"""End-to-end backend tests for Level Up Trading Hub."""
import io
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mongo-web-portal.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def demo_token(s):
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def demo_user(s, demo_token):
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {demo_token}"}, timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def new_user(s):
    """Create a fresh user for tests that mutate password/profile."""
    suffix = uuid.uuid4().hex[:8]
    email = f"test_{suffix}@leveluphub.com"
    password = "InitPass123!"
    r = s.post(f"{API}/auth/signup", json={
        "email": email, "password": password, "display_name": f"TEST User {suffix}"
    }, timeout=20)
    assert r.status_code == 201, r.text
    body = r.json()
    return {"email": email, "password": password, "token": body["access_token"], "user": body["user"]}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Auth ----------
class TestAuth:
    def test_root(self, s):
        r = s.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert "Level Up" in r.json().get("app", "")

    def test_signup_and_duplicate(self, s):
        suffix = uuid.uuid4().hex[:8]
        email = f"dup_{suffix}@leveluphub.com"
        r = s.post(f"{API}/auth/signup", json={
            "email": email, "password": "SomePass123!", "display_name": "TEST Dup"
        })
        assert r.status_code == 201
        assert "access_token" in r.json() and r.json()["user"]["email"] == email
        r2 = s.post(f"{API}/auth/signup", json={
            "email": email, "password": "SomePass123!", "display_name": "TEST Dup"
        })
        assert r2.status_code == 409

    def test_login_demo_ok(self, demo_token):
        assert demo_token

    def test_login_bad_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrong-pass"})
        assert r.status_code == 401

    def test_me_ok(self, demo_user):
        assert demo_user["email"] == DEMO_EMAIL
        assert demo_user["username"] == "demo_trader"

    def test_me_no_token(self, s):
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_forgot_and_reset_password(self, s, new_user):
        # Forgot
        r = s.post(f"{API}/auth/forgot-password", json={"email": new_user["email"]})
        assert r.status_code == 200
        body = r.json()
        assert "dev_code" in body, f"expected dev_code in dev preview: {body}"
        code = body["dev_code"]
        # Reset
        new_pw = "NewPass456!"
        r2 = s.post(f"{API}/auth/reset-password", json={
            "email": new_user["email"], "code": code, "new_password": new_pw
        })
        assert r2.status_code == 200
        # Login with new password
        r3 = s.post(f"{API}/auth/login", json={"email": new_user["email"], "password": new_pw})
        assert r3.status_code == 200


# ---------- Meta / users ----------
class TestUsersAndMeta:
    def test_meta_options(self, s, demo_token):
        r = s.get(f"{API}/meta/options", headers=auth(demo_token))
        assert r.status_code == 200
        data = r.json()
        for k in ("markets", "trading_styles", "sessions"):
            assert isinstance(data.get(k), list) and data[k]

    def test_search_users_marcus(self, s, demo_token):
        r = s.get(f"{API}/users?q=marcus", headers=auth(demo_token))
        assert r.status_code == 200
        users = r.json()
        assert any("marcus" in (u.get("username") or "").lower() for u in users), users

    def test_get_user_and_follow_toggle(self, s, demo_token, demo_user):
        # find sophia
        r = s.get(f"{API}/users?q=sophia", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()
        target = r.json()[0]
        uid = target["user_id"]
        # get user detail
        r = s.get(f"{API}/users/{uid}", headers=auth(demo_token))
        assert r.status_code == 200
        detail = r.json()
        was_following = detail["is_following"]
        start_followers = detail["followers_count"]
        # toggle
        r = s.post(f"{API}/users/{uid}/follow", headers=auth(demo_token))
        assert r.status_code == 200
        after = r.json()
        assert after["following"] != was_following
        assert after["followers_count"] == start_followers + (1 if after["following"] else -1)
        # revert to keep state stable
        r = s.post(f"{API}/users/{uid}/follow", headers=auth(demo_token))
        assert r.status_code == 200
        assert r.json()["following"] == was_following

    def test_followers_and_following(self, s, demo_token, demo_user):
        r = s.get(f"{API}/users/{demo_user['user_id']}/followers", headers=auth(demo_token))
        assert r.status_code == 200 and isinstance(r.json(), list)
        r = s.get(f"{API}/users/{demo_user['user_id']}/following", headers=auth(demo_token))
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_stories(self, s, demo_token):
        r = s.get(f"{API}/stories", headers=auth(demo_token))
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # demo user follows 4 seeded traders
        assert len(items) >= 1

    def test_update_me_and_username_conflict(self, s, new_user, demo_token):
        # own bio update
        r = s.put(f"{API}/me", headers=auth(new_user["token"]),
                  json={"bio": "TEST bio " + uuid.uuid4().hex[:6]})
        assert r.status_code == 200
        assert r.json()["bio"].startswith("TEST bio")
        # conflict: try to take demo_trader
        r = s.put(f"{API}/me", headers=auth(new_user["token"]), json={"username": "demo_trader"})
        assert r.status_code == 409

    def test_user_posts_tabs(self, s, demo_token, demo_user):
        for tab in ("posts", "photos", "videos", "mentions"):
            r = s.get(f"{API}/users/{demo_user['user_id']}/posts?tab={tab}", headers=auth(demo_token))
            assert r.status_code == 200
            assert isinstance(r.json(), list)


# ---------- Posts ----------
class TestPosts:
    def test_feed_all_and_following(self, s, demo_token):
        for scope in ("all", "following"):
            r = s.get(f"{API}/posts?scope={scope}", headers=auth(demo_token))
            assert r.status_code == 200, r.text
            data = r.json()
            assert "items" in data and "next_cursor" in data
            assert isinstance(data["items"], list)

    def test_create_get_like_bookmark_share_delete_flow(self, s, demo_token):
        # Create with gif media
        payload = {
            "text": f"TEST post {uuid.uuid4().hex[:6]} feeling bullish",
            "media": [{"type": "gif", "url": "https://media.giphy.com/media/xT8qBff0Xj52ZoM3Wg/giphy.gif"}],
        }
        r = s.post(f"{API}/posts", headers=auth(demo_token), json=payload)
        assert r.status_code == 201, r.text
        post = r.json()
        post_id = post["post_id"]
        assert post["text"].startswith("TEST")
        assert post["media"][0]["type"] == "gif"
        assert post["is_mine"] is True

        # GET single
        r = s.get(f"{API}/posts/{post_id}", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()["post_id"] == post_id

        # Like toggle on
        r = s.post(f"{API}/posts/{post_id}/like", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()["liked"] is True
        assert r.json()["likes_count"] >= 1
        # Like toggle off
        r = s.post(f"{API}/posts/{post_id}/like", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()["liked"] is False

        # Bookmark on
        r = s.post(f"{API}/posts/{post_id}/bookmark", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()["saved"] is True
        # Confirm in saved list
        r = s.get(f"{API}/me/saved", headers=auth(demo_token))
        assert r.status_code == 200
        assert any(p["post_id"] == post_id for p in r.json())
        # Bookmark off
        r = s.post(f"{API}/posts/{post_id}/bookmark", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()["saved"] is False

        # Share
        r = s.post(f"{API}/posts/{post_id}/share", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()["shares_count"] >= 1

        # Delete own
        r = s.delete(f"{API}/posts/{post_id}", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()["deleted"] is True
        # Verify soft delete
        r = s.get(f"{API}/posts/{post_id}", headers=auth(demo_token))
        assert r.status_code == 404


class TestComments:
    def test_comment_reply_and_like(self, s, demo_token):
        # Create a post to comment on
        r = s.post(f"{API}/posts", headers=auth(demo_token),
                   json={"text": f"TEST commentable {uuid.uuid4().hex[:6]}"})
        assert r.status_code == 201
        post_id = r.json()["post_id"]

        # Top-level text comment
        r = s.post(f"{API}/posts/{post_id}/comments", headers=auth(demo_token),
                   json={"text": "TEST top comment"})
        assert r.status_code == 201
        parent_id = r.json()["comment_id"]

        # GIF comment
        r = s.post(f"{API}/posts/{post_id}/comments", headers=auth(demo_token),
                   json={"gif_url": "https://media.giphy.com/media/abcd/giphy.gif"})
        assert r.status_code == 201 and r.json()["gif_url"]

        # Reply
        r = s.post(f"{API}/posts/{post_id}/comments", headers=auth(demo_token),
                   json={"text": "TEST reply", "parent_id": parent_id})
        assert r.status_code == 201 and r.json()["parent_id"] == parent_id
        reply_id = r.json()["comment_id"]

        # List comments
        r = s.get(f"{API}/posts/{post_id}/comments", headers=auth(demo_token))
        assert r.status_code == 200 and len(r.json()) >= 3

        # Like comment
        r = s.post(f"{API}/comments/{reply_id}/like", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()["liked"] is True
        r = s.post(f"{API}/comments/{reply_id}/like", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()["liked"] is False

        # Cleanup post
        s.delete(f"{API}/posts/{post_id}", headers=auth(demo_token))


# ---------- Chat ----------
class TestChat:
    def test_conversation_and_messages(self, s, demo_token):
        # Find seeded trader
        r = s.get(f"{API}/users?q=marcus", headers=auth(demo_token))
        assert r.status_code == 200 and r.json()
        other_id = r.json()[0]["user_id"]

        # Create conversation
        r = s.post(f"{API}/conversations", headers=auth(demo_token), json={"user_id": other_id})
        assert r.status_code in (200, 201), r.text
        conv_id = r.json()["conversation_id"]

        # Text message
        r = s.post(f"{API}/conversations/{conv_id}/messages", headers=auth(demo_token),
                   json={"text": "TEST hello from demo"})
        assert r.status_code == 201 and r.json()["text"].startswith("TEST")
        # GIF message
        r = s.post(f"{API}/conversations/{conv_id}/messages", headers=auth(demo_token),
                   json={"gif_url": "https://media.giphy.com/media/xxx/giphy.gif"})
        assert r.status_code == 201 and r.json()["gif_url"]

        # List messages
        r = s.get(f"{API}/conversations/{conv_id}/messages", headers=auth(demo_token))
        assert r.status_code == 200 and len(r.json()) >= 2

        # List conversations
        r = s.get(f"{API}/conversations", headers=auth(demo_token))
        assert r.status_code == 200
        assert any(c["conversation_id"] == conv_id for c in r.json())


# ---------- GIFs ----------
class TestGifs:
    def test_trending(self, s, demo_token):
        r = s.get(f"{API}/gifs/trending?limit=5", headers=auth(demo_token))
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        assert items and items[0]["preview_url"] and items[0]["url"]

    def test_search(self, s, demo_token):
        r = s.get(f"{API}/gifs/search?q=bull&limit=5", headers=auth(demo_token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert items and items[0]["preview_url"]


# ---------- Upload ----------
class TestUpload:
    def test_upload_png_and_fetch(self, s, demo_token):
        # 1x1 PNG
        png_bytes = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A"
            "49444154789C63000100000500010D0A2DB40000000049454E44AE426082"
        )
        files = {"file": ("pixel.png", io.BytesIO(png_bytes), "image/png")}
        r = s.post(f"{API}/upload", headers=auth(demo_token), files=files)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["url"].startswith("/api/files/")
        assert body["type"] == "image"
        # Fetch back
        r2 = s.get(f"{BASE_URL}{body['url']}", timeout=30)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image/")
        assert len(r2.content) == len(png_bytes)
