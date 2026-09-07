"""Tests for Edit Post + comment @mentions (stabilization iteration 4)."""
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


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def demo_token(s):
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def demo_user(s, demo_token):
    r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {demo_token}"}, timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def other_user(s):
    """Create a second user to verify 403 on cross-user edits."""
    suffix = uuid.uuid4().hex[:8]
    email = f"test_other_{suffix}@leveluphub.com"
    pw = "OtherPass123!"
    r = s.post(f"{API}/auth/signup", json={
        "email": email, "password": pw, "display_name": f"TEST Other {suffix}"
    }, timeout=20)
    assert r.status_code == 201, r.text
    body = r.json()
    return {"email": email, "password": pw, "token": body["access_token"], "user": body["user"]}


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def _get_user(s, token, q):
    r = s.get(f"{API}/users?q={q}", headers=auth(token))
    assert r.status_code == 200 and r.json(), r.text
    return r.json()[0]


def make_mp4_bytes(payload_size: int = 4096) -> bytes:
    ftyp = b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00isomiso2avc1mp41"
    mdat_header = struct.pack(">I", payload_size + 8) + b"mdat"
    return ftyp + mdat_header + b"\x00" * payload_size


# =============== EDIT POST ===============
class TestEditPost:
    created: list = []

    def test_edit_by_author_updates_text_and_edited_at(self, s, demo_token):
        marcus = _get_user(s, demo_token, "marcus")
        r = s.post(f"{API}/posts", headers=auth(demo_token),
                   json={"text": f"TEST edit-src {uuid.uuid4().hex[:6]}"})
        assert r.status_code == 201
        pid = r.json()["post_id"]
        self.__class__.created.append(pid)
        assert r.json().get("edited_at") in (None, "")  # not edited yet

        new_text = f"TEST edited body @marcus_fx {uuid.uuid4().hex[:6]}"
        r2 = s.put(f"{API}/posts/{pid}", headers=auth(demo_token),
                   json={"text": new_text, "mentions": [marcus["user_id"]]})
        assert r2.status_code == 200, r2.text
        updated = r2.json()
        assert updated["text"] == new_text
        assert updated["edited_at"], "edited_at should be set after edit"
        assert updated["mentions"] == [marcus["user_id"]]
        assert len(updated["mentioned_users"]) == 1
        assert updated["mentioned_users"][0]["username"].lower() == "marcus_fx"

        # GET reflects new text + edited_at
        r3 = s.get(f"{API}/posts/{pid}", headers=auth(demo_token))
        assert r3.status_code == 200
        assert r3.json()["text"] == new_text
        assert r3.json()["edited_at"] == updated["edited_at"]

    def test_edit_only_stores_selected_valid_mentions_whose_handle_in_text(self, s, demo_token):
        marcus = _get_user(s, demo_token, "marcus")
        ava = _get_user(s, demo_token, "ava")
        r = s.post(f"{API}/posts", headers=auth(demo_token),
                   json={"text": f"TEST edit-mm {uuid.uuid4().hex[:6]}"})
        assert r.status_code == 201
        pid = r.json()["post_id"]
        self.__class__.created.append(pid)

        # Text has @marcus_fx only, but we pass both ids → only marcus kept
        text = f"hey @marcus_fx TEST {uuid.uuid4().hex[:6]}"
        r2 = s.put(f"{API}/posts/{pid}", headers=auth(demo_token),
                   json={"text": text, "mentions": [marcus["user_id"], ava["user_id"]]})
        assert r2.status_code == 200
        assert r2.json()["mentions"] == [marcus["user_id"]]

        # mentions=[] disables auto-resolution even with handle in text
        r3 = s.put(f"{API}/posts/{pid}", headers=auth(demo_token),
                   json={"text": f"still @marcus_fx TEST {uuid.uuid4().hex[:6]}", "mentions": []})
        assert r3.status_code == 200
        assert r3.json()["mentions"] == []
        assert r3.json()["mentioned_users"] == []

    def test_edit_by_other_user_returns_403(self, s, demo_token, other_user):
        r = s.post(f"{API}/posts", headers=auth(demo_token),
                   json={"text": f"TEST edit-403 {uuid.uuid4().hex[:6]}"})
        assert r.status_code == 201
        pid = r.json()["post_id"]
        self.__class__.created.append(pid)

        r2 = s.put(f"{API}/posts/{pid}", headers=auth(other_user["token"]),
                   json={"text": "hijack attempt", "mentions": []})
        assert r2.status_code == 403

    def test_edit_empty_text_on_text_only_post_returns_400(self, s, demo_token):
        r = s.post(f"{API}/posts", headers=auth(demo_token),
                   json={"text": f"TEST edit-empty {uuid.uuid4().hex[:6]}"})
        assert r.status_code == 201
        pid = r.json()["post_id"]
        self.__class__.created.append(pid)

        for empty in ("", "   ", "\n\t "):
            r2 = s.put(f"{API}/posts/{pid}", headers=auth(demo_token),
                       json={"text": empty, "mentions": []})
            assert r2.status_code == 400, f"expected 400 for empty text on text-only post, got {r2.status_code}"

    def test_edit_empty_text_allowed_when_post_has_media(self, s, demo_token):
        # Upload a tiny mp4 so post has media
        mp4 = make_mp4_bytes(2048)
        files = {"file": (f"e_{uuid.uuid4().hex[:6]}.mp4", io.BytesIO(mp4), "video/mp4")}
        u = s.post(f"{API}/upload", headers=auth(demo_token), files=files)
        assert u.status_code == 201
        media_url = u.json()["url"]

        r = s.post(f"{API}/posts", headers=auth(demo_token), json={
            "text": f"TEST edit-media {uuid.uuid4().hex[:6]}",
            "media": [{"type": "video", "url": media_url}],
        })
        assert r.status_code == 201
        pid = r.json()["post_id"]
        self.__class__.created.append(pid)

        r2 = s.put(f"{API}/posts/{pid}", headers=auth(demo_token),
                   json={"text": "", "mentions": []})
        assert r2.status_code == 200
        assert r2.json()["text"] == ""

    def test_delete_still_works_after_edit_and_get_404(self, s, demo_token):
        r = s.post(f"{API}/posts", headers=auth(demo_token),
                   json={"text": f"TEST edit-then-del {uuid.uuid4().hex[:6]}"})
        assert r.status_code == 201
        pid = r.json()["post_id"]

        r2 = s.put(f"{API}/posts/{pid}", headers=auth(demo_token),
                   json={"text": "TEST updated body", "mentions": []})
        assert r2.status_code == 200

        r3 = s.delete(f"{API}/posts/{pid}", headers=auth(demo_token))
        assert r3.status_code == 200 and r3.json()["deleted"] is True

        r4 = s.get(f"{API}/posts/{pid}", headers=auth(demo_token))
        assert r4.status_code == 404

    @classmethod
    def teardown_class(cls):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
        if r.status_code != 200:
            return
        t = r.json()["access_token"]
        for pid in cls.created:
            try:
                s.delete(f"{API}/posts/{pid}", headers=auth(t), timeout=15)
            except Exception:
                pass


# =============== COMMENT MENTIONS ===============
class TestCommentMentions:
    created_posts: list = []

    def _make_post(self, s, token):
        r = s.post(f"{API}/posts", headers=auth(token),
                   json={"text": f"TEST cmt-mention {uuid.uuid4().hex[:6]}"})
        assert r.status_code == 201
        pid = r.json()["post_id"]
        self.__class__.created_posts.append(pid)
        return pid

    def test_comment_with_mention_returns_mentioned_users(self, s, demo_token):
        marcus = _get_user(s, demo_token, "marcus")
        pid = self._make_post(s, demo_token)
        r = s.post(f"{API}/posts/{pid}/comments", headers=auth(demo_token),
                   json={"text": "thanks @marcus_fx", "mentions": [marcus["user_id"]]})
        assert r.status_code == 201, r.text
        c = r.json()
        assert c["mentions"] == [marcus["user_id"]]
        assert len(c["mentioned_users"]) == 1
        assert c["mentioned_users"][0]["user_id"] == marcus["user_id"]
        assert c["mentioned_users"][0]["username"].lower() == "marcus_fx"

    def test_comment_with_empty_mentions_field_produces_empty_mentioned_users(self, s, demo_token):
        pid = self._make_post(s, demo_token)
        r = s.post(f"{API}/posts/{pid}/comments", headers=auth(demo_token),
                   json={"text": "thanks @marcus_fx", "mentions": []})
        assert r.status_code == 201
        c = r.json()
        assert c["mentions"] == []
        assert c["mentioned_users"] == []

    def test_reply_with_mention_works(self, s, demo_token):
        sophia = _get_user(s, demo_token, "sophia")
        pid = self._make_post(s, demo_token)
        # Parent comment
        r = s.post(f"{API}/posts/{pid}/comments", headers=auth(demo_token),
                   json={"text": "TEST parent"})
        assert r.status_code == 201
        parent_id = r.json()["comment_id"]
        # Reply with mention
        r2 = s.post(f"{API}/posts/{pid}/comments", headers=auth(demo_token), json={
            "text": "cc @sophia_swings",
            "parent_id": parent_id,
            "mentions": [sophia["user_id"]],
        })
        assert r2.status_code == 201, r2.text
        c = r2.json()
        assert c["parent_id"] == parent_id
        assert c["mentions"] == [sophia["user_id"]]
        assert len(c["mentioned_users"]) == 1
        assert c["mentioned_users"][0]["username"].lower() == "sophia_swings"

    def test_get_comments_returns_mentioned_users_per_comment(self, s, demo_token):
        marcus = _get_user(s, demo_token, "marcus")
        sophia = _get_user(s, demo_token, "sophia")
        pid = self._make_post(s, demo_token)

        s.post(f"{API}/posts/{pid}/comments", headers=auth(demo_token),
               json={"text": "hi @marcus_fx", "mentions": [marcus["user_id"]]})
        s.post(f"{API}/posts/{pid}/comments", headers=auth(demo_token),
               json={"text": "hi @sophia_swings", "mentions": [sophia["user_id"]]})
        s.post(f"{API}/posts/{pid}/comments", headers=auth(demo_token),
               json={"text": "no mention here"})

        r = s.get(f"{API}/posts/{pid}/comments", headers=auth(demo_token))
        assert r.status_code == 200
        comments = r.json()
        assert len(comments) >= 3
        for c in comments:
            assert "mentioned_users" in c
            assert isinstance(c["mentioned_users"], list)
        # Verify the marcus mention comment has marcus in mentioned_users
        marcus_comment = next(c for c in comments if "@marcus_fx" in c["text"])
        assert any(u["user_id"] == marcus["user_id"] for u in marcus_comment["mentioned_users"])

    def test_comment_selected_only_valid_and_handle_in_text(self, s, demo_token):
        marcus = _get_user(s, demo_token, "marcus")
        ava = _get_user(s, demo_token, "ava")
        pid = self._make_post(s, demo_token)
        # text has both handles but we only select marcus → only marcus kept
        r = s.post(f"{API}/posts/{pid}/comments", headers=auth(demo_token), json={
            "text": "cc @marcus_fx and @ava_forex",
            "mentions": [marcus["user_id"]],
        })
        assert r.status_code == 201
        assert r.json()["mentions"] == [marcus["user_id"]]

        # Handle not in text → dropped
        r2 = s.post(f"{API}/posts/{pid}/comments", headers=auth(demo_token), json={
            "text": "no handles here",
            "mentions": [ava["user_id"]],
        })
        assert r2.status_code == 201
        assert r2.json()["mentions"] == []
        assert r2.json()["mentioned_users"] == []

    @classmethod
    def teardown_class(cls):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
        if r.status_code != 200:
            return
        t = r.json()["access_token"]
        for pid in cls.created_posts:
            try:
                s.delete(f"{API}/posts/{pid}", headers=auth(t), timeout=15)
            except Exception:
                pass
