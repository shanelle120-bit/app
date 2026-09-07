"""
Iteration 9 backend tests.

Covers:
  1. Multi-reaction API on main posts (create/change/remove/legacy like/summary/unknown emoji).
  2. Reactions ↔ activity: single 'like' notification updates reaction, no duplicates, no self-notify.
  3. Mingle reactions + privacy (identity swap, non-member 403).
  4. Voice message uploads + chat messages, validation, block enforcement.
"""

import io
import os
import struct
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://level-up-hub-85.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASS = "Trader123!"


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------
def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    body = r.json()
    return body.get("token") or body["access_token"]


def _signup(prefix: str = "iter9") -> tuple[str, dict]:
    suffix = uuid.uuid4().hex[:8]
    body = {
        "email": f"TEST_{prefix}_{suffix}@example.com",
        "password": "Trader123!",
        "username": f"t{prefix}{suffix}"[:24],
        "display_name": f"Test {prefix} {suffix}",
    }
    r = requests.post(f"{API}/auth/signup", json=body, timeout=15)
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    payload = r.json()
    token = payload.get("token") or payload.get("access_token")
    assert token, f"signup returned no token: {payload}"
    return token, payload.get("user") or payload


def _make_wav_bytes(seconds: float = 0.2, sample_rate: int = 8000) -> bytes:
    """Return a tiny in-memory WAV blob."""
    n_samples = max(1, int(sample_rate * seconds))
    data_bytes = b"\x00\x00" * n_samples  # 16-bit silence
    byte_rate = sample_rate * 2
    fmt_chunk = b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, byte_rate, 2, 16)
    data_chunk = b"data" + struct.pack("<I", len(data_bytes)) + data_bytes
    riff_size = 4 + len(fmt_chunk) + len(data_chunk)
    return b"RIFF" + struct.pack("<I", riff_size) + b"WAVE" + fmt_chunk + data_chunk


@pytest.fixture(scope="module")
def demo_token() -> str:
    return _login(DEMO_EMAIL, DEMO_PASS)


@pytest.fixture(scope="module")
def fresh_user():
    token, user = _signup("author")
    return {"token": token, "user_id": user["user_id"], "username": user.get("username")}


@pytest.fixture(scope="module")
def demo_user_id() -> str:
    r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASS}, timeout=15)
    assert r.status_code == 200
    return r.json()["user"]["user_id"]


# ---------------------------------------------------------------------------
# 1. Reactions on main posts
# ---------------------------------------------------------------------------
class TestReactions:
    """Compact multi-reaction system on main feed posts."""

    @pytest.fixture(scope="class")
    def post(self, fresh_user):
        r = requests.post(
            f"{API}/posts",
            headers=_auth(fresh_user["token"]),
            json={"text": "TEST_iter9 reaction target"},
            timeout=15,
        )
        assert r.status_code == 201, r.text
        pid = r.json()["post_id"]
        yield pid
        # Cleanup — author deletes their post.
        requests.delete(f"{API}/posts/{pid}", headers=_auth(fresh_user["token"]), timeout=15)

    def test_react_fire(self, demo_token, post):
        r = requests.post(f"{API}/posts/{post}/react", headers=_auth(demo_token), json={"reaction": "🔥"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body == {"liked": True, "my_reaction": "🔥", "likes_count": 1, "reactions": {"🔥": 1}}

    def test_react_change_to_money(self, demo_token, post):
        r = requests.post(f"{API}/posts/{post}/react", headers=_auth(demo_token), json={"reaction": "🤑"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["liked"] is True
        assert body["my_reaction"] == "🤑"
        assert body["likes_count"] == 1  # still one distinct member
        assert body["reactions"] == {"🤑": 1}

    def test_react_unknown_emoji_rejected(self, demo_token, post):
        r = requests.post(f"{API}/posts/{post}/react", headers=_auth(demo_token), json={"reaction": "x"}, timeout=15)
        assert r.status_code == 400

    def test_get_posts_exposes_my_reaction(self, demo_token, post):
        r = requests.get(f"{API}/posts?scope=all&limit=50", headers=_auth(demo_token), timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        me = next((p for p in items if p["post_id"] == post), None)
        assert me is not None, "post missing from list"
        assert me["my_reaction"] == "🤑"
        assert me["reactions"] == {"🤑": 1}

    def test_get_post_detail_exposes_reactions(self, demo_token, post):
        r = requests.get(f"{API}/posts/{post}", headers=_auth(demo_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["my_reaction"] == "🤑"
        assert body["reactions"] == {"🤑": 1}

    def test_second_user_adds_to_summary(self, post, demo_token):
        token2, _ = _signup("second")
        r = requests.post(f"{API}/posts/{post}/react", headers=_auth(token2), json={"reaction": "🥳"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["likes_count"] == 2
        assert set(body["reactions"].keys()) == {"🤑", "🥳"}
        assert body["reactions"]["🥳"] == 1
        assert body["reactions"]["🤑"] == 1
        # cleanup — second user removes
        r = requests.post(f"{API}/posts/{post}/react", headers=_auth(token2), json={"reaction": None}, timeout=15)
        assert r.status_code == 200

    def test_remove_reaction(self, demo_token, post):
        r = requests.post(f"{API}/posts/{post}/react", headers=_auth(demo_token), json={"reaction": None}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body == {"liked": False, "my_reaction": None, "likes_count": 0, "reactions": {}}

    def test_legacy_like_toggle_uses_heart(self, demo_token, post):
        r = requests.post(f"{API}/posts/{post}/like", headers=_auth(demo_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["liked"] is True
        assert body["my_reaction"] == "🩷"
        assert body["reactions"] == {"🩷": 1}
        # toggle back off
        r = requests.post(f"{API}/posts/{post}/like", headers=_auth(demo_token), timeout=15)
        assert r.status_code == 200
        assert r.json()["liked"] is False


# ---------------------------------------------------------------------------
# 2. Reactions + activity
# ---------------------------------------------------------------------------
class TestReactionNotifications:
    """One notification per (actor, post) 'like'; reaction updates in-place; no self-notify."""

    def test_reaction_flow_creates_single_notification(self, demo_token, demo_user_id):
        # Fresh author + fresh post so we can inspect *their* notifications cleanly.
        author = _signup("notif_author")
        author_token, author_info = author
        r = requests.post(f"{API}/posts", headers=_auth(author_token), json={"text": "TEST_iter9 notif target"}, timeout=15)
        assert r.status_code == 201
        pid = r.json()["post_id"]

        # Demo reacts 🔥
        requests.post(f"{API}/posts/{pid}/react", headers=_auth(demo_token), json={"reaction": "🔥"}, timeout=15)
        # Demo changes to 🤑
        requests.post(f"{API}/posts/{pid}/react", headers=_auth(demo_token), json={"reaction": "🤑"}, timeout=15)

        r = requests.get(f"{API}/notifications", headers=_auth(author_token), timeout=15)
        assert r.status_code == 200
        items = r.json()
        related = [n for n in items if n.get("post_id") == pid and n["type"] == "like" and n["actor_id"] == demo_user_id]
        assert len(related) == 1, f"expected exactly one like notification, got {len(related)}: {related}"
        assert related[0]["reaction"] == "🤑"

        # Removing the reaction MUST NOT add a new notification (still exactly one).
        requests.post(f"{API}/posts/{pid}/react", headers=_auth(demo_token), json={"reaction": None}, timeout=15)
        r = requests.get(f"{API}/notifications", headers=_auth(author_token), timeout=15)
        related_after = [n for n in r.json() if n.get("post_id") == pid and n["type"] == "like" and n["actor_id"] == demo_user_id]
        assert len(related_after) == 1

        # cleanup
        requests.delete(f"{API}/posts/{pid}", headers=_auth(author_token), timeout=15)

    def test_self_reaction_no_notification(self, demo_token, demo_user_id):
        r = requests.post(f"{API}/posts", headers=_auth(demo_token), json={"text": "TEST_iter9 self-react"}, timeout=15)
        assert r.status_code == 201
        pid = r.json()["post_id"]
        try:
            requests.post(f"{API}/posts/{pid}/react", headers=_auth(demo_token), json={"reaction": "🔥"}, timeout=15)
            r = requests.get(f"{API}/notifications", headers=_auth(demo_token), timeout=15)
            self_notifs = [n for n in r.json() if n.get("post_id") == pid and n["type"] == "like"]
            assert self_notifs == []
        finally:
            requests.delete(f"{API}/posts/{pid}", headers=_auth(demo_token), timeout=15)


# ---------------------------------------------------------------------------
# 3. Mingle reactions / privacy
# ---------------------------------------------------------------------------
def _make_mingle_member(prefix: str) -> dict:
    """Signup + activate premium + create Mingle profile. Returns dict with token/user_id/mingle_name."""
    token, user = _signup(prefix)
    r = requests.post(f"{API}/membership/activate", headers=_auth(token), json={"plan": "monthly"}, timeout=15)
    assert r.status_code == 200, r.text
    mingle_name = f"Ming{prefix[:5]}{uuid.uuid4().hex[:4]}"
    r = requests.put(
        f"{API}/mingle/me",
        headers=_auth(token),
        json={
            "display_name": mingle_name,
            "age": 30,
            "gender": "woman",
            "looking_for": ["friendship"],
            "bio": "test",
            "photos": [],
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return {"token": token, "user_id": user["user_id"], "mingle_name": mingle_name}


class TestMingleReactions:
    @pytest.fixture(scope="class")
    def members(self):
        a = _make_mingle_member("mgA")
        b = _make_mingle_member("mgB")
        yield {"a": a, "b": b}
        # cleanup — soft delete mingle profiles
        for m in (a, b):
            requests.delete(f"{API}/mingle/me", headers=_auth(m["token"]), timeout=15)

    def test_mingle_react_and_identity(self, members):
        a, b = members["a"], members["b"]
        # A posts to mingle
        r = requests.post(f"{API}/mingle/posts", headers=_auth(a["token"]), json={"text": "TEST_iter9 mingle target"}, timeout=15)
        assert r.status_code == 201, r.text
        pid = r.json()["post_id"]

        # B reacts via generic endpoint
        r = requests.post(f"{API}/posts/{pid}/react", headers=_auth(b["token"]), json={"reaction": "🔥"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["reactions"] == {"🔥": 1}

        # GET /mingle/posts shows my_reaction for B
        r = requests.get(f"{API}/mingle/posts", headers=_auth(b["token"]), timeout=15)
        assert r.status_code == 200
        items = r.json().get("items", r.json()) if isinstance(r.json(), dict) else r.json()
        me = next((p for p in items if p["post_id"] == pid), None)
        assert me is not None
        assert me["my_reaction"] == "🔥"
        assert me["reactions"] == {"🔥": 1}

        # A's notifications: mingle==true and actor uses Mingle display_name
        r = requests.get(f"{API}/notifications", headers=_auth(a["token"]), timeout=15)
        assert r.status_code == 200
        related = [n for n in r.json() if n.get("post_id") == pid and n["type"] == "like"]
        assert len(related) == 1
        n = related[0]
        assert n.get("mingle") is True
        assert n["actor"]["display_name"] == b["mingle_name"]
        assert n["actor"].get("username", "") == ""

        # Non-member (fresh throwaway) reacting → 403
        outsider_token, _ = _signup("outsider")
        r = requests.post(f"{API}/posts/{pid}/react", headers=_auth(outsider_token), json={"reaction": "🔥"}, timeout=15)
        assert r.status_code == 403

        # cleanup
        requests.delete(f"{API}/posts/{pid}", headers=_auth(a["token"]), timeout=15)


# ---------------------------------------------------------------------------
# 4. Voice messages
# ---------------------------------------------------------------------------
class TestVoiceMessages:
    @pytest.fixture(scope="class")
    def convo(self, demo_token, demo_user_id):
        # Use marcus_fx seeded trader — they always exist.
        r = requests.get(f"{API}/users/search?q=marcus", headers=_auth(demo_token), timeout=15)
        # search may or may not exist; fallback: list follows/trending? Use conversation create with a known seed via /users/{id}? Simpler: create new user.
        other_token, other = _signup("chatbud")
        r = requests.post(f"{API}/conversations", headers=_auth(demo_token), json={"user_id": other["user_id"]}, timeout=15)
        assert r.status_code == 201, r.text
        cid = r.json()["conversation_id"]
        return {"conversation_id": cid, "other_token": other_token, "other_id": other["user_id"]}

    def test_upload_audio_returns_type_audio(self, demo_token):
        wav = _make_wav_bytes(0.5)
        r = requests.post(
            f"{API}/upload",
            headers=_auth(demo_token),
            files={"file": ("voice.wav", io.BytesIO(wav), "audio/wav")},
            timeout=30,
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["type"] == "audio"
        assert body["url"].startswith("/api/files/")

    def test_send_voice_message(self, demo_token, convo):
        wav = _make_wav_bytes(0.5)
        r = requests.post(
            f"{API}/upload",
            headers=_auth(demo_token),
            files={"file": ("voice.wav", io.BytesIO(wav), "audio/wav")},
            timeout=30,
        )
        audio_url = r.json()["url"]
        r = requests.post(
            f"{API}/conversations/{convo['conversation_id']}/messages",
            headers=_auth(demo_token),
            json={"audio_url": audio_url, "audio_duration": 4.2},
            timeout=15,
        )
        assert r.status_code == 201, r.text
        msg = r.json()
        assert msg["audio_url"] == audio_url
        assert msg["audio_duration"] == 4.2

        # GET messages returns it
        r = requests.get(f"{API}/conversations/{convo['conversation_id']}/messages", headers=_auth(demo_token), timeout=15)
        assert r.status_code == 200
        assert any(m.get("audio_url") == audio_url for m in r.json())

        # Conversations preview
        r = requests.get(f"{API}/conversations", headers=_auth(demo_token), timeout=15)
        assert r.status_code == 200
        this = next((c for c in r.json() if c["conversation_id"] == convo["conversation_id"]), None)
        assert this is not None
        assert this["last_message"] == "🎤 Voice message"

    def test_voice_validation_duration_over_60(self, demo_token, convo):
        r = requests.post(
            f"{API}/conversations/{convo['conversation_id']}/messages",
            headers=_auth(demo_token),
            json={"audio_url": "/api/files/some/path.wav", "audio_duration": 61},
            timeout=15,
        )
        assert r.status_code == 422

    def test_voice_validation_bad_url(self, demo_token, convo):
        r = requests.post(
            f"{API}/conversations/{convo['conversation_id']}/messages",
            headers=_auth(demo_token),
            json={"audio_url": "https://evil.example.com/x.wav", "audio_duration": 3.0},
            timeout=15,
        )
        assert r.status_code == 400

    def test_empty_body_rejected(self, demo_token, convo):
        r = requests.post(
            f"{API}/conversations/{convo['conversation_id']}/messages",
            headers=_auth(demo_token),
            json={},
            timeout=15,
        )
        assert r.status_code == 400

    def test_text_and_gif_messages_still_work(self, demo_token, convo):
        r = requests.post(
            f"{API}/conversations/{convo['conversation_id']}/messages",
            headers=_auth(demo_token),
            json={"text": "TEST_iter9 hello"},
            timeout=15,
        )
        assert r.status_code == 201
        r = requests.post(
            f"{API}/conversations/{convo['conversation_id']}/messages",
            headers=_auth(demo_token),
            json={"gif_url": "https://media.giphy.com/some.gif"},
            timeout=15,
        )
        assert r.status_code == 201


class TestVoiceMessagesMingleBlock:
    """Voice messages must honor Mingle block rules symmetrically."""

    @pytest.fixture(scope="class")
    def pair(self):
        a = _make_mingle_member("vmA")
        b = _make_mingle_member("vmB")
        # Get a conversation via /mingle/actions hi from A to B.
        r = requests.post(f"{API}/mingle/actions", headers=_auth(a["token"]), json={"to_user_id": b["user_id"], "action": "hi"}, timeout=15)
        assert r.status_code in (200, 201), r.text
        cid = r.json().get("conversation_id")
        if not cid:
            # Fallback: get inbox for B
            r = requests.get(f"{API}/mingle/inbox", headers=_auth(b["token"]), timeout=15)
            for item in r.json():
                if item.get("conversation_id"):
                    cid = item["conversation_id"]
                    break
        assert cid, "could not obtain conversation between mingle members"
        yield {"a": a, "b": b, "cid": cid}
        # cleanup
        requests.delete(f"{API}/mingle/blocks/{b['user_id']}", headers=_auth(a["token"]), timeout=15)
        for m in (a, b):
            requests.delete(f"{API}/mingle/me", headers=_auth(m["token"]), timeout=15)

    def _upload(self, token):
        wav = _make_wav_bytes(0.3)
        r = requests.post(f"{API}/upload", headers=_auth(token),
                          files={"file": ("v.wav", io.BytesIO(wav), "audio/wav")}, timeout=30)
        assert r.status_code == 201
        return r.json()["url"]

    def test_block_prevents_voice_both_directions(self, pair):
        a, b, cid = pair["a"], pair["b"], pair["cid"]

        # Send once to warm up (before block).
        url_b = self._upload(b["token"])
        r = requests.post(f"{API}/conversations/{cid}/messages",
                          headers=_auth(b["token"]),
                          json={"audio_url": url_b, "audio_duration": 2.0}, timeout=15)
        assert r.status_code == 201

        # A blocks B
        r = requests.post(f"{API}/mingle/block", headers=_auth(a["token"]), json={"user_id": b["user_id"]}, timeout=15)
        assert r.status_code in (200, 201), r.text

        # B → 403
        url_b2 = self._upload(b["token"])
        r = requests.post(f"{API}/conversations/{cid}/messages",
                          headers=_auth(b["token"]),
                          json={"audio_url": url_b2, "audio_duration": 2.0}, timeout=15)
        assert r.status_code == 403

        # A → 403
        url_a = self._upload(a["token"])
        r = requests.post(f"{API}/conversations/{cid}/messages",
                          headers=_auth(a["token"]),
                          json={"audio_url": url_a, "audio_duration": 2.0}, timeout=15)
        assert r.status_code == 403

        # Unblock
        r = requests.delete(f"{API}/mingle/blocks/{b['user_id']}", headers=_auth(a["token"]), timeout=15)
        assert r.status_code == 200

        # A can send again
        url_a2 = self._upload(a["token"])
        r = requests.post(f"{API}/conversations/{cid}/messages",
                          headers=_auth(a["token"]),
                          json={"audio_url": url_a2, "audio_duration": 2.0}, timeout=15)
        assert r.status_code == 201
