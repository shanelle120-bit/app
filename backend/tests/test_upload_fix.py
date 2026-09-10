"""
Targeted tests for the FormData upload fix (expo-file-system uploadAsync compatibility).

Simulates the exact multipart shape expo-file-system uploadAsync sends:
  - field name: 'file'
  - filename: basename of local path (e.g. IMG_0001.jpg)
  - Content-Type: image/jpeg, video/mp4, video/quicktime
  - Extra text form field 'filename' (from `parameters: { filename: name }`), which
    the backend must IGNORE (i.e. not 422).

Also verifies:
  - Uploaded media persists and is served without auth
  - avatar_url/cover_url via PUT /api/me are reflected in GET /api/users/{id}
    and GET /api/auth/me after re-login.
  - Regression smoke: feed, like, comment w/ gif_url, gifs/trending,
    conversations, stories.
"""
import io
import os
import struct
import uuid
import zlib
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://navy-social-platform.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- helpers to build realistic payloads ----------
def make_jpeg_bytes(target_size: int = 1_200_000) -> bytes:
    """Build a valid-ish JPEG large enough to simulate a real photo (~1.2MB).

    Minimal SOI + APP0 + a huge COM segment containing padding + EOI. Content-type
    is what matters to the backend (it stores bytes, doesn't parse the image).
    """
    soi = b"\xff\xd8"
    app0 = b"\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
    # COM segment: 0xFFFE + length (2 bytes, includes itself) + payload
    payload_len = max(3, target_size - len(soi) - len(app0) - 2 - 2)
    # length field is 2 bytes -> max 65535 including the 2 length bytes; we chunk
    chunks = []
    remaining = payload_len
    while remaining > 0:
        take = min(remaining, 65533)
        chunks.append(b"\xff\xfe" + struct.pack(">H", take + 2) + (b"\x00" * take))
        remaining -= take
    return soi + app0 + b"".join(chunks) + b"\xff\xd9"


def make_mp4_bytes(target_size: int = 200_000) -> bytes:
    """Minimal MP4 with ftyp box + free box padding to reach target size."""
    ftyp = b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00isomiso2avc1mp41"
    # free box: 4 bytes size + 'free' + payload
    pad_len = max(0, target_size - len(ftyp) - 8)
    free_size = pad_len + 8
    free = struct.pack(">I", free_size) + b"free" + (b"\x00" * pad_len)
    return ftyp + free


def make_png_bytes(size_px: int = 4) -> bytes:
    """Valid tiny PNG."""
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size_px, size_px, 8, 6, 0, 0, 0)
    raw = b"".join(b"\x00" + b"\xff\x00\x00\xff" * size_px for _ in range(size_px))
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def demo_token(s):
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def second_user(s):
    """Sign up a second, independent user for cross-account visibility tests."""
    suffix = uuid.uuid4().hex[:8]
    email = f"test_second_{suffix}@leveluphub.com"
    password = "SecondPass123!"
    r = s.post(f"{API}/auth/signup", json={
        "email": email, "password": password, "display_name": f"TEST Second {suffix}"
    }, timeout=20)
    assert r.status_code == 201, r.text
    body = r.json()
    return {"email": email, "password": password, "token": body["access_token"], "user": body["user"]}


# ---------- Upload fix: expo-file-system uploadAsync shape ----------
class TestUploadAsyncShape:
    def test_jpeg_with_extra_filename_param(self, s, demo_token):
        """expo-file-system sends an extra text field 'filename' via `parameters`.

        The backend must accept the multipart, IGNORE the extra field (no 422),
        and return url + type='image'."""
        jpeg = make_jpeg_bytes(1_200_000)  # ~1.2MB simulates a real photo
        files = {"file": ("IMG_0001.jpg", io.BytesIO(jpeg), "image/jpeg")}
        data = {"filename": "IMG_0001.jpg"}  # extra text form field
        r = s.post(f"{API}/upload", headers=auth(demo_token), files=files, data=data, timeout=60)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["url"].startswith("/api/files/")
        assert body["type"] == "image"
        assert body["content_type"] == "image/jpeg"
        # Fetch back without auth (mirrors browser <img> from another device)
        r2 = requests.get(f"{BASE_URL}{body['url']}", timeout=60)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/")
        assert len(r2.content) == len(jpeg)

    def test_mp4_video_upload(self, s, demo_token):
        mp4 = make_mp4_bytes(300_000)
        files = {"file": ("video.mp4", io.BytesIO(mp4), "video/mp4")}
        data = {"filename": "video.mp4"}
        r = s.post(f"{API}/upload", headers=auth(demo_token), files=files, data=data, timeout=60)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["type"] == "video"
        assert body["content_type"] == "video/mp4"
        assert body["url"].startswith("/api/files/") and body["url"].endswith(".mp4")
        r2 = requests.get(f"{BASE_URL}{body['url']}", timeout=60)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("video/")
        assert len(r2.content) == len(mp4)

    def test_mov_quicktime_upload(self, s, demo_token):
        mov = make_mp4_bytes(100_000)  # bytes ok; content-type drives extension
        files = {"file": ("IMG_0002.mov", io.BytesIO(mov), "video/quicktime")}
        data = {"filename": "IMG_0002.mov"}
        r = s.post(f"{API}/upload", headers=auth(demo_token), files=files, data=data, timeout=60)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["type"] == "video"
        assert body["content_type"] == "video/quicktime"
        assert body["url"].endswith(".mov")

    def test_reject_unsupported_type(self, s, demo_token):
        files = {"file": ("evil.txt", io.BytesIO(b"hello"), "text/plain")}
        r = s.post(f"{API}/upload", headers=auth(demo_token), files=files)
        assert r.status_code == 400


# ---------- Media persistence across users ----------
class TestMediaPersistsAcrossUsers:
    def test_post_with_uploaded_media_visible_to_other_user(self, s, demo_token, second_user):
        # 1. Upload as demo
        png = make_png_bytes()
        files = {"file": ("shot.png", io.BytesIO(png), "image/png")}
        r = s.post(f"{API}/upload", headers=auth(demo_token), files=files, data={"filename": "shot.png"})
        assert r.status_code == 201, r.text
        upload = r.json()
        media_url = upload["url"]

        # 2. Create post referencing that media
        r = s.post(f"{API}/posts", headers=auth(demo_token), json={
            "text": f"TEST cross-user visibility {uuid.uuid4().hex[:6]}",
            "media": [{"type": "image", "url": media_url}],
        })
        assert r.status_code == 201, r.text
        post_id = r.json()["post_id"]

        try:
            # 3. Fetch as second user (different account)
            r = s.get(f"{API}/posts/{post_id}", headers=auth(second_user["token"]))
            assert r.status_code == 200, r.text
            fetched = r.json()
            assert fetched["media"], f"media missing on cross-user fetch: {fetched}"
            urls = [m.get("url") for m in fetched["media"]]
            assert media_url in urls, urls

            # 4. Fetch the file bytes WITHOUT auth (mirrors <img> tag on another device)
            r_noauth = requests.get(f"{BASE_URL}{media_url}", timeout=30)
            assert r_noauth.status_code == 200
            assert r_noauth.headers.get("content-type", "").startswith("image/")
            assert len(r_noauth.content) == len(png)
        finally:
            s.delete(f"{API}/posts/{post_id}", headers=auth(demo_token))


# ---------- Profile media (avatar_url, cover_url) ----------
class TestProfileMedia:
    def test_avatar_and_cover_reflected_everywhere(self, s, second_user):
        token = second_user["token"]
        user_id = second_user["user"]["user_id"]

        # Upload two images
        av = make_png_bytes()
        cv = make_png_bytes()
        r1 = s.post(f"{API}/upload", headers=auth(token),
                    files={"file": ("avatar.png", io.BytesIO(av), "image/png")},
                    data={"filename": "avatar.png"})
        r2 = s.post(f"{API}/upload", headers=auth(token),
                    files={"file": ("cover.png", io.BytesIO(cv), "image/png")},
                    data={"filename": "cover.png"})
        assert r1.status_code == 201 and r2.status_code == 201
        avatar_url = r1.json()["url"]
        cover_url = r2.json()["url"]

        # PUT /api/me
        r = s.put(f"{API}/me", headers=auth(token), json={
            "avatar_url": avatar_url, "cover_url": cover_url,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["avatar_url"] == avatar_url
        assert body["cover_url"] == cover_url

        # GET /api/users/{id}
        r = s.get(f"{API}/users/{user_id}", headers=auth(token))
        assert r.status_code == 200
        detail = r.json()
        assert detail["avatar_url"] == avatar_url, detail
        assert detail["cover_url"] == cover_url, detail

        # Re-login and confirm /api/auth/me still reflects them
        r = s.post(f"{API}/auth/login", json={
            "email": second_user["email"], "password": second_user["password"]
        })
        assert r.status_code == 200
        new_token = r.json()["access_token"]
        r = s.get(f"{API}/auth/me", headers=auth(new_token))
        assert r.status_code == 200
        me = r.json()
        assert me["avatar_url"] == avatar_url
        assert me["cover_url"] == cover_url


# ---------- Regression smoke ----------
class TestRegressionSmoke:
    def test_feed(self, s, demo_token):
        r = s.get(f"{API}/posts", headers=auth(demo_token))
        assert r.status_code == 200 and "items" in r.json()

    def test_like_toggle(self, s, demo_token):
        # Grab first feed item
        r = s.get(f"{API}/posts", headers=auth(demo_token))
        items = r.json().get("items", [])
        assert items, "feed empty"
        post_id = items[0]["post_id"]
        r1 = s.post(f"{API}/posts/{post_id}/like", headers=auth(demo_token))
        assert r1.status_code == 200
        first_state = r1.json()["liked"]
        r2 = s.post(f"{API}/posts/{post_id}/like", headers=auth(demo_token))
        assert r2.status_code == 200
        assert r2.json()["liked"] != first_state

    def test_comment_with_gif_url(self, s, demo_token):
        r = s.post(f"{API}/posts", headers=auth(demo_token),
                   json={"text": f"TEST regr {uuid.uuid4().hex[:6]}"})
        assert r.status_code == 201
        post_id = r.json()["post_id"]
        try:
            r = s.post(f"{API}/posts/{post_id}/comments", headers=auth(demo_token),
                       json={"gif_url": "https://media.giphy.com/media/xyz/giphy.gif"})
            assert r.status_code == 201 and r.json()["gif_url"]
        finally:
            s.delete(f"{API}/posts/{post_id}", headers=auth(demo_token))

    def test_gifs_trending(self, s, demo_token):
        r = s.get(f"{API}/gifs/trending?limit=3", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()["items"]

    def test_conversations_list(self, s, demo_token):
        r = s.get(f"{API}/conversations", headers=auth(demo_token))
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_stories(self, s, demo_token):
        r = s.get(f"{API}/stories", headers=auth(demo_token))
        assert r.status_code == 200 and isinstance(r.json(), list)
