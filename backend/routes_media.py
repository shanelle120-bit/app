import re
import uuid
from collections import OrderedDict
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from core import db, NO_ID, now_utc, get_current_user, put_object, get_object, APP_NAME, GIPHY_API_KEY, logger

router = APIRouter(tags=["media"])

MAX_UPLOAD_BYTES = 150 * 1024 * 1024
ALLOWED_PREFIXES = ("image/", "video/", "audio/")
EXT_BY_TYPE = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/heic": "heic",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
    "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/mp4": "m4a", "audio/aac": "aac", "audio/mpeg": "mp3",
    "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav",
}


@router.post("/upload", status_code=201)
async def upload(file: UploadFile = File(...), user=Depends(get_current_user)):
    content_type = (file.content_type or "application/octet-stream").lower()
    if not content_type.startswith(ALLOWED_PREFIXES):
        raise HTTPException(status_code=400, detail="Only images, videos and voice recordings are allowed")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 150MB)")
    ext = EXT_BY_TYPE.get(content_type) or (file.filename or "bin").rsplit(".", 1)[-1].lower()[:5]
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        result = await run_in_threadpool(put_object, path, data, content_type)
    except HTTPException:
        raise
    except Exception as exc:  # storage unavailable
        logger.exception("Upload failed")
        raise HTTPException(status_code=502, detail=f"Upload failed: {exc}")
    doc = {
        "path": result.get("path", path),
        "owner_id": user["user_id"],
        "content_type": content_type,
        "size": len(data),
        "original_name": file.filename,
        "created_at": now_utc(),
        "deleted_at": None,
    }
    await db.media_files.insert_one(doc)
    kind = "video" if content_type.startswith("video/") else "audio" if content_type.startswith("audio/") else "image"
    return {"url": f"/api/files/{doc['path']}", "type": kind, "path": doc["path"], "content_type": content_type}


# Small in-process cache so video players issuing many Range requests don't
# re-download the whole object from storage each time.
_object_cache: "OrderedDict[str, tuple[bytes, str]]" = OrderedDict()
_OBJECT_CACHE_MAX_BYTES = 300 * 1024 * 1024


async def _load_object(path: str):
    if path in _object_cache:
        _object_cache.move_to_end(path)
        return _object_cache[path]
    content, content_type = await run_in_threadpool(get_object, path)
    _object_cache[path] = (content, content_type)
    total = sum(len(v[0]) for v in _object_cache.values())
    while total > _OBJECT_CACHE_MAX_BYTES and len(_object_cache) > 1:
        _, (evicted, _) = _object_cache.popitem(last=False)
        total -= len(evicted)
    return content, content_type


def _parse_range(header: str, size: int):
    m = re.match(r"bytes=(\d*)-(\d*)$", header.strip())
    if not m:
        return None
    start_s, end_s = m.groups()
    if start_s == "" and end_s == "":
        return None
    if start_s == "":
        length = int(end_s)
        start, end = max(0, size - length), size - 1
    else:
        start = int(start_s)
        end = int(end_s) if end_s else size - 1
    end = min(end, size - 1)
    if start > end or start >= size:
        return "invalid"
    return start, end


@router.api_route("/files/{path:path}", methods=["GET", "HEAD"])
async def serve_file(path: str, request: Request):
    record = await db.media_files.find_one({"path": path, "deleted_at": None}, NO_ID)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        content, content_type = await _load_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not available")
    media_type = record.get("content_type") or content_type
    size = len(content)
    headers = {"Cache-Control": "public, max-age=31536000, immutable", "Accept-Ranges": "bytes"}

    range_header = request.headers.get("range")
    if range_header:
        rng = _parse_range(range_header, size)
        if rng == "invalid":
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        if rng:
            start, end = rng
            headers["Content-Range"] = f"bytes {start}-{end}/{size}"
            headers["Content-Length"] = str(end - start + 1)
            body = b"" if request.method == "HEAD" else content[start:end + 1]
            return Response(content=body, status_code=206, media_type=media_type, headers=headers)

    headers["Content-Length"] = str(size)
    if request.method == "HEAD":
        return Response(status_code=200, media_type=media_type, headers=headers)
    return Response(content=content, media_type=media_type, headers=headers)


# ---------------------------------------------------------------------------
# GIPHY proxy
# ---------------------------------------------------------------------------
def _normalize_gif(g: dict) -> dict:
    images = g.get("images", {})
    preview = images.get("fixed_width") or images.get("downsized_medium") or {}
    full = images.get("downsized_medium") or images.get("original") or preview
    return {
        "id": g.get("id"),
        "title": g.get("title") or "GIF",
        "preview_url": preview.get("url"),
        "url": full.get("url"),
        "width": int(preview.get("width") or 200),
        "height": int(preview.get("height") or 200),
    }


async def giphy_get(path: str, params: dict):
    if not GIPHY_API_KEY:
        raise HTTPException(status_code=503, detail="GIF search is not configured yet")
    try:
        async with httpx.AsyncClient(base_url="https://api.giphy.com", timeout=10) as http:
            resp = await http.get(path, params={**params, "api_key": GIPHY_API_KEY})
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="GIPHY timed out")
    if resp.status_code == 429:
        raise HTTPException(status_code=503, detail="GIF rate limit reached, try again shortly")
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="GIF search failed")
    data = resp.json().get("data", [])
    return {"items": [_normalize_gif(g) for g in data if g.get("images")]}


@router.get("/gifs/search")
async def search_gifs(q: str = Query(min_length=1, max_length=50), limit: int = Query(default=24, ge=1, le=50),
                      offset: int = Query(default=0, ge=0, le=4999),
                      rating: Literal["g", "pg", "pg-13", "r"] = "pg-13", user=Depends(get_current_user)):
    return await giphy_get("/v1/gifs/search", {"q": q, "limit": limit, "offset": offset, "rating": rating})


@router.get("/gifs/trending")
async def trending_gifs(limit: int = Query(default=24, ge=1, le=50), offset: int = Query(default=0, ge=0, le=499),
                        rating: Literal["g", "pg", "pg-13", "r"] = "pg-13", user=Depends(get_current_user)):
    return await giphy_get("/v1/gifs/trending", {"limit": limit, "offset": offset, "rating": rating})
