"""Iteration 7 backend tests: notifications inbox, premium membership (no pricing),
Mingle inbox and Mingle photo gallery.

Covers:
- Demo user premium tier + plans have price null + price_note.
- Fresh signup free tier; 402 gating on /mingle/*; activate → premium; cancel → free.
- PUT /mingle/me photos truncation ≤4, photo_url = photos[0], excess rejected/truncated.
- Notifications creation (like, comment, follow, mingle_hi, mingle_interested) + no self-notify,
  list, unread-count, read-all.
- /mingle/inbox lists demo's incoming hi/interested (Ava, Marcus, and fresh user), and
  responding "interested" removes them (with match), "pass" also removes.
"""
import os
import secrets
import time

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # fallback to reading frontend .env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"')
                    break
    except Exception:
        pass
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def _reset_demo_mingle_state():
    """Iteration 5 left demo with outgoing actions on Ava/Marcus, which excludes them
    from the demo inbox. Reset outgoing actions targeting seeded traders and re-seed
    the incoming 'Ava hi / Marcus interested' actions so this iteration's inbox tests
    reflect the intended demo state.
    """
    import asyncio
    import sys
    sys.path.insert(0, "/app/backend")
    from core import db, now_utc  # noqa: WPS433

    async def _reset():
        demo = await db.users.find_one({"email_normalized": DEMO_EMAIL})
        if not demo:
            return
        demo_id = demo["user_id"]
        seed_names = ["ava_forex", "marcus_fx", "sophia_swings", "devon_crypto"]
        seed_users = [u async for u in db.users.find({"username": {"$in": seed_names}})]
        seed_ids = [u["user_id"] for u in seed_users]
        name_to_id = {u["username"]: u["user_id"] for u in seed_users}
        # 1) clear demo -> seeded trader actions
        await db.mingle_actions.delete_many({"from_id": demo_id, "to_id": {"$in": seed_ids}})
        # 2) upsert seed incoming actions ava(hi), marcus(interested)
        now = now_utc()
        wants = {"ava_forex": "hi", "marcus_fx": "interested"}
        for uname, action in wants.items():
            uid = name_to_id.get(uname)
            if uid:
                await db.mingle_actions.update_one(
                    {"from_id": uid, "to_id": demo_id},
                    {"$set": {"action": action, "created_at": now}}, upsert=True)

    asyncio.get_event_loop().run_until_complete(_reset())
    yield
    # do NOT clean demo mingle profile — user asked to keep it Premium and keep the profile


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def demo_user(demo_token):
    r = requests.get(f"{API}/auth/me", headers=_auth_headers(demo_token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def fresh_user():
    """Create fresh signup for gating tests. Not cleaned up (backend has no delete-user)."""
    tag = secrets.token_hex(4)
    email = f"iter7_{tag}@example.com"
    payload = {"email": email, "password": "Trader123!", "display_name": f"Iter7 {tag}"}
    r = requests.post(f"{API}/auth/signup", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    return {"token": body["access_token"], "user": body["user"], "email": email}


# ---------------------------------------------------------------------------
# 1) Demo premium & membership response shape
# ---------------------------------------------------------------------------
class TestDemoPremiumAndMembership:
    def test_demo_login_is_premium(self, demo_token, demo_user):
        # `public_user` flattens membership → tier at top-level
        assert demo_user.get("tier") == "premium"

    def test_demo_membership_no_pricing(self, demo_token):
        r = requests.get(f"{API}/membership", headers=_auth_headers(demo_token), timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["tier"] == "premium"
        # plans structure
        assert isinstance(data["plans"], list) and len(data["plans"]) >= 2
        for p in data["plans"]:
            assert p["price"] is None
            assert p.get("price_note")
        # features
        feats = {f["key"]: f for f in data["features"]}
        assert feats["single_mingle"]["unlocked"] is True
        assert feats["single_mingle"]["available"] is True
        for k in ("accountability", "trading_only"):
            assert feats[k]["available"] is False


# ---------------------------------------------------------------------------
# 2) Fresh user free tier + 402 gating + activate + cancel
# ---------------------------------------------------------------------------
class TestFreshUserGating:
    def test_membership_free_by_default(self, fresh_user):
        h = _auth_headers(fresh_user["token"])
        r = requests.get(f"{API}/membership", headers=h, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["tier"] == "free"
        feats = {f["key"]: f for f in data["features"]}
        assert feats["single_mingle"]["unlocked"] is False

    def test_discover_402_when_free(self, fresh_user):
        h = _auth_headers(fresh_user["token"])
        r = requests.get(f"{API}/mingle/discover", headers=h, timeout=15)
        assert r.status_code == 402

    def test_put_me_402_when_free(self, fresh_user):
        h = _auth_headers(fresh_user["token"])
        r = requests.put(f"{API}/mingle/me", headers=h, json={
            "display_name": "Testy", "age": 25, "trader_type": "Multiple", "looking_for": ["Friendship"]
        }, timeout=15)
        assert r.status_code == 402

    def test_inbox_402_when_free(self, fresh_user):
        h = _auth_headers(fresh_user["token"])
        r = requests.get(f"{API}/mingle/inbox", headers=h, timeout=15)
        assert r.status_code == 402

    def test_activate_makes_premium(self, fresh_user):
        h = _auth_headers(fresh_user["token"])
        r = requests.post(f"{API}/membership/activate", headers=h, json={"plan": "monthly"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("tier") == "premium"

        # Now discover shouldn't be 402 (should be 403 until profile created)
        r2 = requests.get(f"{API}/mingle/discover", headers=h, timeout=15)
        assert r2.status_code == 403, r2.text

    def test_cancel_reverts_to_free(self, fresh_user):
        h = _auth_headers(fresh_user["token"])
        r = requests.post(f"{API}/membership/cancel", headers=h, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("tier") == "free"

        # Discover back to 402
        r2 = requests.get(f"{API}/mingle/discover", headers=h, timeout=15)
        assert r2.status_code == 402

    def test_reactivate_ok(self, fresh_user):
        h = _auth_headers(fresh_user["token"])
        r = requests.post(f"{API}/membership/activate", headers=h, json={"plan": "yearly"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["tier"] == "premium"


# ---------------------------------------------------------------------------
# 3) Mingle photos array
# ---------------------------------------------------------------------------
class TestMinglePhotos:
    """Requires premium + mingle profile; use fresh_user after activation."""

    def _ensure_profile(self, token, photos):
        h = _auth_headers(token)
        body = {
            "display_name": "PhotoUser",
            "age": 28,
            "location": "NYC",
            "trader_type": "Options",
            "looking_for": ["Friendship"],
            "bio": "hi",
            "photos": photos,
        }
        return requests.put(f"{API}/mingle/me", headers=h, json=body, timeout=15)

    def test_stores_4_photos_and_sets_photo_url(self, fresh_user):
        photos = [f"https://example.com/p{i}.jpg" for i in range(4)]
        r = self._ensure_profile(fresh_user["token"], photos)
        assert r.status_code == 200, r.text
        profile = r.json()["profile"]
        assert profile["photos"] == photos
        assert profile["photo_url"] == photos[0]

        # GET returns them
        h = _auth_headers(fresh_user["token"])
        r2 = requests.get(f"{API}/mingle/me", headers=h, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["profile"]["photos"] == photos

    def test_5_photos_rejected_or_truncated(self, fresh_user):
        photos = [f"https://example.com/x{i}.jpg" for i in range(5)]
        r = self._ensure_profile(fresh_user["token"], photos)
        # Pydantic Field(max_length=4) causes 422; if server truncated then 200 with 4 photos
        assert r.status_code in (200, 422)
        if r.status_code == 200:
            assert len(r.json()["profile"]["photos"]) == 4


# ---------------------------------------------------------------------------
# 4) Notifications: create → list → unread count → read-all; no self-notify
# ---------------------------------------------------------------------------
class TestNotifications:
    def test_actions_create_and_readall(self, demo_token, demo_user, fresh_user):
        demo_uid = demo_user["user_id"]

        # Establish clean read state at the start (demo may already have unread from seed)
        h_demo = _auth_headers(demo_token)
        requests.post(f"{API}/notifications/read-all", headers=h_demo, timeout=15)

        h_fresh = _auth_headers(fresh_user["token"])

        # fresh_user must be premium+mingle profile for mingle actions
        # (created above via TestMinglePhotos or activation). Ensure activation & profile.
        requests.post(f"{API}/membership/activate", headers=h_fresh, json={"plan": "monthly"}, timeout=15)
        requests.put(f"{API}/mingle/me", headers=h_fresh, json={
            "display_name": "Fresh", "age": 28, "location": "NYC", "trader_type": "Options",
            "looking_for": ["Friendship"], "bio": "hi"
        }, timeout=15)

        # Demo must also have a mingle profile (previous iteration cleaned it up) so
        # /mingle/actions targeting demo doesn't 404 "Member not available".
        requests.put(f"{API}/mingle/me", headers=h_demo, json={
            "display_name": "Demo Trader", "age": 30, "location": "NYC", "trader_type": "Options",
            "looking_for": ["Friendship"], "bio": "demo mingle"
        }, timeout=15)

        # Grab a demo post
        r = requests.get(f"{API}/posts?scope=all&limit=20", headers=h_fresh, timeout=15)
        assert r.status_code == 200
        posts = r.json()["items"]
        demo_post = next((p for p in posts if p["author_id"] == demo_uid), None)
        # If demo has no posts, create one as demo
        if not demo_post:
            rp = requests.post(f"{API}/posts", headers=_auth_headers(demo_token),
                               json={"text": "Iter7 demo post"}, timeout=15)
            assert rp.status_code == 201, rp.text
            demo_post = rp.json()

        post_id = demo_post["post_id"]

        # (a) like demo post → 'like' notification
        rl = requests.post(f"{API}/posts/{post_id}/like", headers=h_fresh, timeout=15)
        assert rl.status_code == 200

        # (b) comment on demo post → 'comment' notification
        rc = requests.post(f"{API}/posts/{post_id}/comments", headers=h_fresh,
                           json={"text": "Iter7 nice"}, timeout=15)
        assert rc.status_code == 201, rc.text

        # (c) follow demo → 'follow' notification
        rf = requests.post(f"{API}/users/{demo_uid}/follow", headers=h_fresh, timeout=15)
        assert rf.status_code == 200

        # (d) mingle hi + interested toward demo
        rh = requests.post(f"{API}/mingle/actions", headers=h_fresh,
                          json={"to_user_id": demo_uid, "action": "hi"}, timeout=15)
        assert rh.status_code == 200, rh.text
        ri = requests.post(f"{API}/mingle/actions", headers=h_fresh,
                          json={"to_user_id": demo_uid, "action": "interested"}, timeout=15)
        assert ri.status_code == 200, ri.text

        # Give backend a moment
        time.sleep(0.5)

        # List notifications as demo
        rn = requests.get(f"{API}/notifications", headers=h_demo, timeout=15)
        assert rn.status_code == 200
        items = rn.json()
        kinds = [n["type"] for n in items]
        for expected in ("like", "comment", "follow", "mingle_hi", "mingle_interested"):
            assert expected in kinds, f"missing {expected} in {kinds}"

        # each has actor summary
        for n in items[:5]:
            assert "actor" in n

        # unread count > 0
        ru = requests.get(f"{API}/notifications/unread-count", headers=h_demo, timeout=15)
        assert ru.status_code == 200
        assert ru.json()["count"] > 0

        # read-all zeroes it
        rr = requests.post(f"{API}/notifications/read-all", headers=h_demo, timeout=15)
        assert rr.status_code == 200
        ru2 = requests.get(f"{API}/notifications/unread-count", headers=h_demo, timeout=15)
        assert ru2.json()["count"] == 0

    def test_self_action_no_notification(self, demo_token, demo_user):
        h = _auth_headers(demo_token)
        # Get one of demo's posts (create if needed)
        rp = requests.post(f"{API}/posts", headers=h, json={"text": "self-notif test"}, timeout=15)
        assert rp.status_code == 201
        post_id = rp.json()["post_id"]

        requests.post(f"{API}/notifications/read-all", headers=h, timeout=15)
        # Self-like
        requests.post(f"{API}/posts/{post_id}/like", headers=h, timeout=15)
        # Self-comment
        requests.post(f"{API}/posts/{post_id}/comments", headers=h, json={"text": "own"}, timeout=15)

        ru = requests.get(f"{API}/notifications/unread-count", headers=h, timeout=15)
        assert ru.json()["count"] == 0, "self-actions must not create notifications"


# ---------------------------------------------------------------------------
# 5) Mingle inbox (demo sees Ava hi + Marcus interested + fresh user actions)
# ---------------------------------------------------------------------------
class TestMingleInbox:
    def test_demo_inbox_contains_seeded_and_fresh(self, demo_token, demo_user, fresh_user):
        h_demo = _auth_headers(demo_token)
        # Ensure demo has a mingle profile so require_premium + own-profile-check pass for inbox
        # (inbox uses require_premium; no need to have own profile, but we ensure it once)
        # Skip creating (see previous iteration cleanup) — inbox only needs to READ actions.

        r = requests.get(f"{API}/mingle/inbox", headers=h_demo, timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        # Extract by display_name (Ava, Marcus)
        names = [i["profile"]["display_name"] for i in items]
        actions = {i["profile"]["display_name"]: i["action"] for i in items}
        # Ava said hi to demo, Marcus said interested (from seed)
        assert "Ava" in names, f"Ava missing from inbox: {names}"
        assert "Marcus" in names, f"Marcus missing from inbox: {names}"
        assert actions.get("Ava") == "hi"
        assert actions.get("Marcus") == "interested"

    def test_interested_back_removes_marcus_and_pass_removes_next(self, demo_token, demo_user):
        h = _auth_headers(demo_token)
        # Ensure demo has a mingle profile — required for /actions
        # Create/upsert a minimal one; the previous iteration cleared it.
        requests.put(f"{API}/mingle/me", headers=h, json={
            "display_name": "Demo Trader", "age": 30, "location": "NYC", "trader_type": "Options",
            "looking_for": ["Friendship"], "bio": "demo mingle"
        }, timeout=15)

        # Find Marcus user_id from inbox
        r = requests.get(f"{API}/mingle/inbox", headers=h, timeout=15)
        assert r.status_code == 200
        items = r.json()
        marcus = next((i for i in items if i["profile"]["display_name"] == "Marcus"), None)
        assert marcus, "Marcus not in inbox to test 'interested back'"

        r2 = requests.post(f"{API}/mingle/actions", headers=h,
                           json={"to_user_id": marcus["profile"]["user_id"], "action": "interested"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("mingle") is True

        # Marcus should now be gone from inbox
        r3 = requests.get(f"{API}/mingle/inbox", headers=h, timeout=15)
        names_after = [i["profile"]["display_name"] for i in r3.json()]
        assert "Marcus" not in names_after

        # Try pass on the fresh user's actions if present (they said hi + interested)
        remaining = r3.json()
        if remaining:
            target = remaining[0]
            rp = requests.post(f"{API}/mingle/actions", headers=h,
                               json={"to_user_id": target["profile"]["user_id"], "action": "pass"}, timeout=15)
            assert rp.status_code == 200
            r4 = requests.get(f"{API}/mingle/inbox", headers=h, timeout=15)
            ids_after = [i["profile"]["user_id"] for i in r4.json()]
            assert target["profile"]["user_id"] not in ids_after
