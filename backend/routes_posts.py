import re
from datetime import datetime
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core import db, NO_ID, now_utc, new_id, get_current_user, author_summary, users_map, mingle_blocked_ids, mingle_summaries
from routes_activity import notify

router = APIRouter(tags=["posts"])

MENTION_RX = re.compile(r"@([a-zA-Z0-9_]{3,24})")
# Posts carry a `space`; Mingle posts never surface in main-feed queries.
MAIN_SPACE = {"space": {"$ne": "mingle"}}


class MediaItem(BaseModel):
    type: Literal["image", "video", "gif"]
    url: str
    width: Optional[int] = None
    height: Optional[int] = None


class PostCreate(BaseModel):
    text: str = Field(default="", max_length=2000)
    media: List[MediaItem] = []
    # user_ids explicitly selected from the @mention picker. When provided (even
    # empty), only these are stored; free-typed @handles are treated as plain text.
    mentions: Optional[List[str]] = None


class CommentCreate(BaseModel):
    text: str = Field(default="", max_length=1000)
    gif_url: Optional[str] = None
    parent_id: Optional[str] = None
    mentions: Optional[List[str]] = None


class PostUpdate(BaseModel):
    text: str = Field(default="", max_length=2000)
    mentions: Optional[List[str]] = None


async def resolve_mentions(text: str) -> List[str]:
    names = list({m.lower() for m in MENTION_RX.findall(text or "")})
    if not names:
        return []
    cursor = db.users.find({"username": {"$in": names}}, NO_ID)
    return [u["user_id"] async for u in cursor]


async def resolve_selected_mentions(user_ids: List[str], text: str) -> List[str]:
    """Keep only real accounts whose @username is still present in the text."""
    ids = list({u for u in user_ids if u})[:20]
    if not ids:
        return []
    typed = {m.lower() for m in MENTION_RX.findall(text or "")}
    cursor = db.users.find({"user_id": {"$in": ids}, "deleted_at": None}, NO_ID)
    return [u["user_id"] async for u in cursor if (u.get("username") or "").lower() in typed]


async def enrich_posts(posts: List[dict], viewer_id: str) -> List[dict]:
    if not posts:
        return []
    post_ids = [p["post_id"] for p in posts]
    mention_ids = [m for p in posts for m in (p.get("mentions") or [])]
    umap = await users_map([p["author_id"] for p in posts] + mention_ids)
    liked = {d["post_id"] async for d in db.likes.find({"user_id": viewer_id, "post_id": {"$in": post_ids}}, NO_ID)}
    saved = {d["post_id"] async for d in db.bookmarks.find({"user_id": viewer_id, "post_id": {"$in": post_ids}}, NO_ID)}
    mmap = await mingle_summaries([p["author_id"] for p in posts if p.get("space") == "mingle"])
    out = []
    for p in posts:
        p = dict(p)
        if p.get("space") == "mingle":
            p["author"] = mmap[p["author_id"]]
            p["mentioned_users"] = []
        else:
            p["author"] = author_summary(umap.get(p["author_id"]))
            p["mentioned_users"] = [author_summary(umap[m]) for m in (p.get("mentions") or []) if m in umap]
        p["liked"] = p["post_id"] in liked
        p["saved"] = p["post_id"] in saved
        p["is_mine"] = p["author_id"] == viewer_id
        p.pop("deleted_at", None)
        out.append(p)
    return out


async def get_post_or_404(post_id: str, viewer_id: str) -> dict:
    post = await db.posts.find_one({"post_id": post_id, "deleted_at": None}, NO_ID)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if post.get("space") == "mingle":
        # Mingle content is members-only and hidden between blocked members.
        if not await db.mingle_profiles.find_one({"user_id": viewer_id, "deleted_at": None}, NO_ID):
            raise HTTPException(status_code=403, detail="Join Single & Mingle to view this post")
        if post["author_id"] in await mingle_blocked_ids(viewer_id):
            raise HTTPException(status_code=404, detail="Post not found")
    return post


async def comment_authors(post: dict, comments: List[dict], viewer_id: str) -> tuple:
    """(author map, filtered comments) — Mingle posts use Mingle identities and hide blocked members."""
    if post.get("space") == "mingle":
        blocked = await mingle_blocked_ids(viewer_id)
        comments = [c for c in comments if c["author_id"] not in blocked]
        return await mingle_summaries([c["author_id"] for c in comments]), comments
    mention_ids = [m for c in comments for m in (c.get("mentions") or [])]
    umap = await users_map([c["author_id"] for c in comments] + mention_ids)
    return {k: author_summary(v) for k, v in umap.items()}, comments


@router.post("/posts", status_code=201)
async def create_post(body: PostCreate, user=Depends(get_current_user)):
    text = body.text.strip()
    if not text and not body.media:
        raise HTTPException(status_code=400, detail="Add some text, media or a GIF")
    doc = {
        "post_id": new_id("post"),
        "author_id": user["user_id"],
        "text": text,
        "media": [m.model_dump() for m in body.media],
        "mentions": await resolve_selected_mentions(body.mentions, text) if body.mentions is not None else await resolve_mentions(text),
        "likes_count": 0,
        "comments_count": 0,
        "shares_count": 0,
        "space": "main",
        "created_at": now_utc(),
        "deleted_at": None,
    }
    await db.posts.insert_one(doc)
    doc.pop("_id", None)
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"posts_count": 1}})
    for m in doc["mentions"]:
        await notify(m, user["user_id"], "mention", post_id=doc["post_id"], text=text)
    return (await enrich_posts([doc], user["user_id"]))[0]


@router.get("/posts")
async def list_posts(
    scope: Literal["all", "following"] = "all",
    before: Optional[datetime] = None,
    limit: int = Query(default=20, le=50),
    user=Depends(get_current_user),
):
    query = {"deleted_at": None, **MAIN_SPACE}
    if scope == "following":
        ids = [f["following_id"] async for f in db.follows.find({"follower_id": user["user_id"]}, NO_ID)]
        ids.append(user["user_id"])
        query["author_id"] = {"$in": ids}
    if before:
        query["created_at"] = {"$lt": before}
    cursor = db.posts.find(query, NO_ID).sort("created_at", -1).limit(limit)
    posts = [p async for p in cursor]
    items = await enrich_posts(posts, user["user_id"])
    next_cursor = posts[-1]["created_at"].isoformat() if len(posts) == limit else None
    return {"items": items, "next_cursor": next_cursor}


@router.get("/posts/{post_id}")
async def get_post(post_id: str, user=Depends(get_current_user)):
    post = await get_post_or_404(post_id, user["user_id"])
    return (await enrich_posts([post], user["user_id"]))[0]


@router.put("/posts/{post_id}")
async def update_post(post_id: str, body: PostUpdate, user=Depends(get_current_user)):
    post = await get_post_or_404(post_id, user["user_id"])
    if post["author_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="You can only edit your own posts")
    text = body.text.strip()
    if not text and not post.get("media"):
        raise HTTPException(status_code=400, detail="A post needs some text or media")
    if post.get("space") == "mingle":
        mentions = []
    else:
        mentions = await resolve_selected_mentions(body.mentions, text) if body.mentions is not None else await resolve_mentions(text)
    await db.posts.update_one(
        {"post_id": post_id},
        {"$set": {"text": text, "mentions": mentions, "edited_at": now_utc()}},
    )
    fresh = await db.posts.find_one({"post_id": post_id}, NO_ID)
    for m in set(mentions) - set(post.get("mentions") or []):
        await notify(m, user["user_id"], "mention", post_id=post_id, text=text)
    return (await enrich_posts([fresh], user["user_id"]))[0]


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, user=Depends(get_current_user)):
    post = await get_post_or_404(post_id, user["user_id"])
    if post["author_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own posts")
    await db.posts.update_one({"post_id": post_id}, {"$set": {"deleted_at": now_utc()}})
    if post.get("space") != "mingle":
        await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"posts_count": -1}})
    return {"deleted": True}


@router.post("/posts/{post_id}/like")
async def toggle_like(post_id: str, user=Depends(get_current_user)):
    await get_post_or_404(post_id, user["user_id"])
    key = {"post_id": post_id, "user_id": user["user_id"]}
    if await db.likes.find_one(key, NO_ID):
        await db.likes.delete_one(key)
        delta, liked = -1, False
    else:
        await db.likes.insert_one({**key, "created_at": now_utc()})
        delta, liked = 1, True
        post = await db.posts.find_one({"post_id": post_id}, NO_ID)
        await notify(post["author_id"], user["user_id"], "like", post_id=post_id, text=post.get("text"))
    await db.posts.update_one({"post_id": post_id}, {"$inc": {"likes_count": delta}})
    fresh = await db.posts.find_one({"post_id": post_id}, NO_ID)
    return {"liked": liked, "likes_count": max(0, fresh["likes_count"])}


@router.post("/posts/{post_id}/bookmark")
async def toggle_bookmark(post_id: str, user=Depends(get_current_user)):
    await get_post_or_404(post_id, user["user_id"])
    key = {"post_id": post_id, "user_id": user["user_id"]}
    if await db.bookmarks.find_one(key, NO_ID):
        await db.bookmarks.delete_one(key)
        return {"saved": False}
    await db.bookmarks.insert_one({**key, "created_at": now_utc()})
    return {"saved": True}


@router.post("/posts/{post_id}/share")
async def share_post(post_id: str, user=Depends(get_current_user)):
    await get_post_or_404(post_id, user["user_id"])
    await db.posts.update_one({"post_id": post_id}, {"$inc": {"shares_count": 1}})
    fresh = await db.posts.find_one({"post_id": post_id}, NO_ID)
    return {"shares_count": fresh["shares_count"]}


@router.get("/posts/{post_id}/comments")
async def list_comments(post_id: str, user=Depends(get_current_user)):
    post = await get_post_or_404(post_id, user["user_id"])
    cursor = db.comments.find({"post_id": post_id, "deleted_at": None}, NO_ID).sort("created_at", 1).limit(300)
    comments = [c async for c in cursor]
    amap, comments = await comment_authors(post, comments, user["user_id"])
    ids = [c["comment_id"] for c in comments]
    liked = {d["comment_id"] async for d in db.comment_likes.find(
        {"user_id": user["user_id"], "comment_id": {"$in": ids}}, NO_ID)}
    for c in comments:
        c["author"] = amap.get(c["author_id"]) or author_summary(None)
        c["mentioned_users"] = [amap[m] for m in (c.get("mentions") or []) if m in amap]
        c["liked"] = c["comment_id"] in liked
        c["is_mine"] = c["author_id"] == user["user_id"]
        c.pop("deleted_at", None)
    return comments


@router.post("/posts/{post_id}/comments", status_code=201)
async def create_comment(post_id: str, body: CommentCreate, user=Depends(get_current_user)):
    post = await get_post_or_404(post_id, user["user_id"])
    text = body.text.strip()
    if not text and not body.gif_url:
        raise HTTPException(status_code=400, detail="Write something or pick a GIF")
    if body.parent_id:
        parent = await db.comments.find_one({"comment_id": body.parent_id, "post_id": post_id}, NO_ID)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")
    is_mingle = post.get("space") == "mingle"
    mentions = [] if is_mingle else (await resolve_selected_mentions(body.mentions, text) if body.mentions is not None else [])
    doc = {
        "comment_id": new_id("cmt"),
        "post_id": post_id,
        "author_id": user["user_id"],
        "parent_id": body.parent_id,
        "text": text,
        "gif_url": body.gif_url,
        "mentions": mentions,
        "likes_count": 0,
        "created_at": now_utc(),
        "deleted_at": None,
    }
    await db.comments.insert_one(doc)
    doc.pop("_id", None)
    await db.posts.update_one({"post_id": post_id}, {"$inc": {"comments_count": 1}})
    post = await db.posts.find_one({"post_id": post_id}, NO_ID)
    await notify(post["author_id"], user["user_id"], "comment", post_id=post_id, comment_id=doc["comment_id"], text=text)
    for m in mentions:
        if m != post["author_id"]:
            await notify(m, user["user_id"], "mention", post_id=post_id, comment_id=doc["comment_id"], text=text)
    mention_map = await users_map(mentions)
    doc["author"] = (await mingle_summaries([user["user_id"]]))[user["user_id"]] if is_mingle else author_summary(user)
    doc["mentioned_users"] = [author_summary(mention_map[m]) for m in mentions if m in mention_map]
    doc["liked"] = False
    doc["is_mine"] = True
    doc.pop("deleted_at", None)
    return doc


@router.post("/comments/{comment_id}/like")
async def toggle_comment_like(comment_id: str, user=Depends(get_current_user)):
    comment = await db.comments.find_one({"comment_id": comment_id, "deleted_at": None}, NO_ID)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    key = {"comment_id": comment_id, "user_id": user["user_id"]}
    if await db.comment_likes.find_one(key, NO_ID):
        await db.comment_likes.delete_one(key)
        delta, liked = -1, False
    else:
        await db.comment_likes.insert_one({**key, "created_at": now_utc()})
        delta, liked = 1, True
    await db.comments.update_one({"comment_id": comment_id}, {"$inc": {"likes_count": delta}})
    fresh = await db.comments.find_one({"comment_id": comment_id}, NO_ID)
    return {"liked": liked, "likes_count": max(0, fresh["likes_count"])}


@router.get("/users/{user_id}/posts")
async def user_posts(
    user_id: str,
    tab: Literal["posts", "photos", "videos", "mentions"] = "posts",
    limit: int = Query(default=30, le=60),
    user=Depends(get_current_user),
):
    query = {"deleted_at": None, **MAIN_SPACE}
    if tab == "mentions":
        query["mentions"] = user_id
    else:
        query["author_id"] = user_id
        if tab == "photos":
            query["media.type"] = {"$in": ["image", "gif"]}
        elif tab == "videos":
            query["media.type"] = "video"
    cursor = db.posts.find(query, NO_ID).sort("created_at", -1).limit(limit)
    posts = [p async for p in cursor]
    return await enrich_posts(posts, user["user_id"])


@router.get("/me/saved")
async def saved_posts(user=Depends(get_current_user)):
    cursor = db.bookmarks.find({"user_id": user["user_id"]}, NO_ID).sort("created_at", -1).limit(100)
    ids = [b["post_id"] async for b in cursor]
    if not ids:
        return []
    posts = {p["post_id"]: p async for p in db.posts.find({"post_id": {"$in": ids}, "deleted_at": None, **MAIN_SPACE}, NO_ID)}
    ordered = [posts[i] for i in ids if i in posts]
    return await enrich_posts(ordered, user["user_id"])
