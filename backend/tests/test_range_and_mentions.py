"""Range + Mentions + regression smoke tests for Level Up Trading Hub."""
import io
import os
import struct
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://level-up-hub-85.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"

# Existing seeded video from problem statement
EXISTING_VIDEO_PATH = "level-up-trading-hub/uploads/user_d73046b26c41/f16549fa03ed4c4a8cb6058a5536dfdb.mp4"


# --- fixtures ---
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def token(s):
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def me(s, token):
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 200
    return r.json()


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def make_mp4_bytes(payload_size: int = 4096) -> bytes:
    """Minimal-ish mp4 blob with ftyp header + padding. Not a decodable video but
    satisfies backend byte handling + magic-lite checks."""
    ftyp = b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00isomiso2avc1mp41"
    mdat_size = payload_size
    mdat_header = struct.pack(">I", mdat_size + 8) + b"mdat"
    payload = b"\x00" * mdat_size
    return ftyp + mdat_header + payload


def _get_user(s, token, q):
    r = s.get(f"{API}/users?q={q}", headers=auth(token))
    assert r.status_code == 200 and r.json(), r.text
    return r.json()[0]


# =============== VIDEO RANGE ===============
class TestVideoRange:
    """Verify HTTP Range support on /api/files/{path}."""

    @pytest.fixture(scope="class")
    def video_url(self, s, token):
        # Upload a fresh small mp4 (existing seed path may or may not still be present).
        mp4 = make_mp4_bytes(8192)
        files = {"file": (f"test_{uuid.uuid4().hex[:6]}.mp4", io.BytesIO(mp4), "video/mp4")}
        r = s.post(f"{API}/upload", headers=auth(token), files=files)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["type"] == "video"
        return {"url": f"{BASE_URL}{body['url']}", "size": len(mp4), "bytes": mp4}

    def test_full_get_returns_200_with_content_length(self, s, video_url):
        r = s.get(video_url["url"], timeout=30)
        assert r.status_code == 200
        assert r.headers.get("Accept-Ranges") == "bytes"
        assert int(r.headers["Content-Length"]) == video_url["size"]
        assert r.content == video_url["bytes"]
        assert r.headers.get("content-type", "").startswith("video/")

    def test_head_returns_200_no_body(self, s, video_url):
        r = s.head(video_url["url"], timeout=30)
        assert r.status_code == 200
        assert r.headers.get("Accept-Ranges") == "bytes"
        assert int(r.headers.get("Content-Length", 0)) == video_url["size"]
        assert r.content == b""

    def test_range_first_1024(self, s, video_url):
        r = s.get(video_url["url"], headers={"Range": "bytes=0-1023"}, timeout=30)
        assert r.status_code == 206, r.text
        assert r.headers.get("Content-Range") == f"bytes 0-1023/{video_url['size']}"
        assert r.headers.get("Accept-Ranges") == "bytes"
        assert int(r.headers["Content-Length"]) == 1024
        assert len(r.content) == 1024
        assert r.content == video_url["bytes"][:1024]

    def test_range_suffix_last_500(self, s, video_url):
        r = s.get(video_url["url"], headers={"Range": "bytes=-500"}, timeout=30)
        assert r.status_code == 206
        expected_start = video_url["size"] - 500
        expected_end = video_url["size"] - 1
        assert r.headers.get("Content-Range") == f"bytes {expected_start}-{expected_end}/{video_url['size']}"
        assert len(r.content) == 500
        assert r.content == video_url["bytes"][-500:]

    def test_range_invalid_returns_416(self, s, video_url):
        r = s.get(video_url["url"], headers={"Range": "bytes=99999999999-"}, timeout=30)
        assert r.status_code == 416
        assert r.headers.get("Content-Range") == f"bytes */{video_url['size']}"

    def test_range_head_no_body(self, s, video_url):
        r = s.head(video_url["url"], headers={"Range": "bytes=0-1023"}, timeout=30)
        assert r.status_code == 206
        assert r.headers.get("Content-Range") == f"bytes 0-1023/{video_url['size']}"
        assert r.content == b""

    def test_existing_seed_video_range(self, s):
        """Best-effort test on the specific seeded path from problem statement."""
        url = f"{BASE_URL}/api/files/{EXISTING_VIDEO_PATH}"
        h = s.head(url, timeout=30)
        if h.status_code == 404:
            pytest.skip("Seeded video not present in this env")
        assert h.status_code == 200
        assert h.headers.get("Accept-Ranges") == "bytes"
        size = int(h.headers["Content-Length"])
        r = s.get(url, headers={"Range": "bytes=0-1023"}, timeout=60)
        assert r.status_code == 206
        assert r.headers.get("Content-Range") == f"bytes 0-1023/{size}"
        assert len(r.content) == 1024


# =============== MENTIONS ===============
class TestMentions:
    """Verify mentions storage rules on POST /api/posts."""

    created_post_ids: list = []

    def test_selected_only_stored(self, s, token, me):
        marcus = _get_user(s, token, "marcus")
        ava = _get_user(s, token, "ava")
        payload = {
            "text": f"hi @marcus_fx and @ava_forex TEST {uuid.uuid4().hex[:6]}",
            "mentions": [marcus["user_id"]],
        }
        r = s.post(f"{API}/posts", headers=auth(token), json=payload)
        assert r.status_code == 201, r.text
        post = r.json()
        self.__class__.created_post_ids.append(post["post_id"])
        assert post["mentions"] == [marcus["user_id"]], f"expected only marcus, got {post['mentions']}"
        mu = post["mentioned_users"]
        assert isinstance(mu, list) and len(mu) == 1
        assert mu[0]["user_id"] == marcus["user_id"]
        assert (mu[0].get("username") or "").lower() == "marcus_fx"

        # Check mentions tab of marcus
        r2 = s.get(f"{API}/users/{marcus['user_id']}/posts?tab=mentions", headers=auth(token))
        assert r2.status_code == 200
        assert any(p["post_id"] == post["post_id"] for p in r2.json()), "post missing from marcus mentions tab"
        # ava was NOT selected → NOT in marcus's list either
        r3 = s.get(f"{API}/users/{ava['user_id']}/posts?tab=mentions", headers=auth(token))
        assert r3.status_code == 200
        assert not any(p["post_id"] == post["post_id"] for p in r3.json()), "ava should not have this post in mentions"

    def test_empty_mentions_field_disables_auto_resolution(self, s, token):
        payload = {"text": f"@marcus_fx TEST {uuid.uuid4().hex[:6]}", "mentions": []}
        r = s.post(f"{API}/posts", headers=auth(token), json=payload)
        assert r.status_code == 201
        post = r.json()
        self.__class__.created_post_ids.append(post["post_id"])
        assert post["mentions"] == []
        assert post["mentioned_users"] == []

    def test_fake_id_dropped(self, s, token):
        payload = {"text": f"@marcus_fx TEST {uuid.uuid4().hex[:6]}", "mentions": ["user_fake_notreal_123"]}
        r = s.post(f"{API}/posts", headers=auth(token), json=payload)
        assert r.status_code == 201
        post = r.json()
        self.__class__.created_post_ids.append(post["post_id"])
        assert post["mentions"] == []
        assert post["mentioned_users"] == []

    def test_valid_id_but_handle_not_in_text_dropped(self, s, token):
        marcus = _get_user(s, token, "marcus")
        # Text mentions ava, but we pass marcus's id — should be dropped
        payload = {
            "text": f"hi @ava_forex TEST {uuid.uuid4().hex[:6]}",
            "mentions": [marcus["user_id"]],
        }
        r = s.post(f"{API}/posts", headers=auth(token), json=payload)
        assert r.status_code == 201
        post = r.json()
        self.__class__.created_post_ids.append(post["post_id"])
        assert post["mentions"] == [], f"expected [] since marcus handle not in text, got {post['mentions']}"

    def test_feed_returns_mentioned_users_field(self, s, token):
        r = s.get(f"{API}/posts?scope=all&limit=10", headers=auth(token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert items
        for it in items:
            assert "mentioned_users" in it, f"missing mentioned_users in feed item: {it.get('post_id')}"
            assert isinstance(it["mentioned_users"], list)

    @classmethod
    def teardown_class(cls):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
        if r.status_code != 200:
            return
        t = r.json()["access_token"]
        for pid in cls.created_post_ids:
            try:
                s.delete(f"{API}/posts/{pid}", headers=auth(t), timeout=15)
            except Exception:
                pass


# =============== REGRESSION SMOKE ===============
class TestRegressionSmoke:
    def test_feed_has_mentioned_users(self, s, token):
        r = s.get(f"{API}/posts?scope=all", headers=auth(token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert all("mentioned_users" in it for it in items)

    def test_like_bookmark_gif_comment_flow(self, s, token):
        r = s.post(f"{API}/posts", headers=auth(token), json={"text": f"TEST regression {uuid.uuid4().hex[:6]}"})
        assert r.status_code == 201
        pid = r.json()["post_id"]
        try:
            r = s.post(f"{API}/posts/{pid}/like", headers=auth(token))
            assert r.status_code == 200 and r.json()["liked"] is True
            r = s.post(f"{API}/posts/{pid}/like", headers=auth(token))
            assert r.status_code == 200 and r.json()["liked"] is False

            r = s.post(f"{API}/posts/{pid}/bookmark", headers=auth(token))
            assert r.status_code == 200 and r.json()["saved"] is True
            r = s.post(f"{API}/posts/{pid}/bookmark", headers=auth(token))
            assert r.status_code == 200 and r.json()["saved"] is False

            r = s.post(f"{API}/posts/{pid}/comments", headers=auth(token),
                       json={"gif_url": "https://media.giphy.com/media/xxx/giphy.gif", "text": "TEST comment"})
            assert r.status_code == 201 and r.json()["gif_url"]
        finally:
            s.delete(f"{API}/posts/{pid}", headers=auth(token))

    def test_gifs_trending(self, s, token):
        r = s.get(f"{API}/gifs/trending?limit=3", headers=auth(token))
        assert r.status_code == 200
        assert r.json()["items"]

    def test_conversations_and_message(self, s, token):
        marcus = _get_user(s, token, "marcus")
        r = s.post(f"{API}/conversations", headers=auth(token), json={"user_id": marcus["user_id"]})
        assert r.status_code in (200, 201)
        conv_id = r.json()["conversation_id"]
        r = s.post(f"{API}/conversations/{conv_id}/messages", headers=auth(token),
                   json={"text": f"TEST msg {uuid.uuid4().hex[:6]}"})
        assert r.status_code == 201
        r = s.get(f"{API}/conversations", headers=auth(token))
        assert r.status_code == 200
        assert any(c["conversation_id"] == conv_id for c in r.json())

    def test_stories(self, s, token):
        r = s.get(f"{API}/stories", headers=auth(token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_put_me_bio(self, s, token):
        new_bio = f"TEST bio {uuid.uuid4().hex[:6]}"
        r = s.put(f"{API}/me", headers=auth(token), json={"bio": new_bio})
        assert r.status_code == 200 and r.json()["bio"] == new_bio
