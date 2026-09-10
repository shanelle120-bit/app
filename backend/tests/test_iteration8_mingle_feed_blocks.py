"""Backend tests for iteration 8 — Mingle Feed, Blocked members, Member view + full regression."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mongo-web-portal.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"


# ---------- helpers ----------
def auth(t):
    return {"Authorization": f"Bearer {t}"}


def _signup(s, activate_premium=True, with_mingle=True, mingle_name=None):
    suffix = uuid.uuid4().hex[:8]
    email = f"iter8_{suffix}@example.com"
    r = s.post(f"{API}/auth/signup", json={
        "email": email, "password": "InitPass123!",
        "display_name": f"TEST Main {suffix}",
    }, timeout=30)
    assert r.status_code == 201, r.text
    body = r.json()
    tok = body["access_token"]
    uid = body["user"]["user_id"]
    if activate_premium:
        r = s.post(f"{API}/membership/activate", headers=auth(tok), json={"plan": "monthly"}, timeout=20)
        assert r.status_code == 200, r.text
    if with_mingle:
        r = s.put(f"{API}/mingle/me", headers=auth(tok), json={
            "display_name": mingle_name or f"Mingle_{suffix}",
            "age": 28, "location": "New York", "trader_type": "Futures",
            "trading_style": "Day Trader", "looking_for": ["Dating"],
            "bio": "iter8 test", "photos": [],
        }, timeout=20)
        assert r.status_code == 200, r.text
    return {"email": email, "token": tok, "user_id": uid, "suffix": suffix}


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
    r = s.get(f"{API}/auth/me", headers=auth(demo_token))
    return r.json()


@pytest.fixture(scope="module")
def demo_mingle(s, demo_token):
    # Ensure demo has a Mingle profile (per spec: leave demo with profile intact).
    r = s.get(f"{API}/mingle/me", headers=auth(demo_token))
    if r.json().get("profile") is None:
        r = s.put(f"{API}/mingle/me", headers=auth(demo_token), json={
            "display_name": "DemoTrader", "age": 32, "location": "New York",
            "trader_type": "Multiple", "trading_style": "Swing Trader",
            "looking_for": ["Dating", "Networking"], "bio": "Level up demo",
            "photos": [],
        })
        assert r.status_code == 200, r.text
    r = s.get(f"{API}/mingle/me", headers=auth(demo_token))
    return r.json()["profile"]


# Module-scope users
@pytest.fixture(scope="module")
def user_a(s):
    return _signup(s, activate_premium=True, with_mingle=True, mingle_name="MingleA")


@pytest.fixture(scope="module")
def user_b(s):
    return _signup(s, activate_premium=True, with_mingle=True, mingle_name="MingleB")


@pytest.fixture(scope="module")
def user_c_no_profile(s):
    # Premium but no mingle profile
    return _signup(s, activate_premium=True, with_mingle=False)


@pytest.fixture(scope="module")
def user_free_no_profile(s):
    return _signup(s, activate_premium=False, with_mingle=False)


# Track cleanup ids
CREATED_MINGLE_USERS = []


def _register(u):
    CREATED_MINGLE_USERS.append(u["token"])


# =====================================================================
# 1. Mingle Feed CRUD + gating
# =====================================================================
class TestMingleFeedGating:
    def test_free_tier_get_402(self, s, user_free_no_profile):
        r = s.get(f"{API}/mingle/posts", headers=auth(user_free_no_profile["token"]))
        assert r.status_code == 402, r.text

    def test_free_tier_post_402(self, s, user_free_no_profile):
        r = s.post(f"{API}/mingle/posts", headers=auth(user_free_no_profile["token"]),
                   json={"text": "hello", "media": []})
        assert r.status_code == 402

    def test_premium_no_profile_get_403(self, s, user_c_no_profile):
        r = s.get(f"{API}/mingle/posts", headers=auth(user_c_no_profile["token"]))
        assert r.status_code == 403

    def test_premium_no_profile_post_403(self, s, user_c_no_profile):
        r = s.post(f"{API}/mingle/posts", headers=auth(user_c_no_profile["token"]),
                   json={"text": "hi", "media": []})
        assert r.status_code == 403

    def test_empty_body_400(self, s, user_a):
        _register(user_a)
        r = s.post(f"{API}/mingle/posts", headers=auth(user_a["token"]),
                   json={"text": "   ", "media": []})
        assert r.status_code == 400


class TestMingleFeedCreate:
    def test_create_and_list(self, s, user_a):
        _register(user_a)
        text = "TEST_iter8 first mingle post"
        r = s.post(f"{API}/mingle/posts", headers=auth(user_a["token"]),
                   json={"text": text, "media": []})
        assert r.status_code == 201, r.text
        post = r.json()
        assert post["space"] == "mingle"
        assert post["author"]["mingle"] is True
        assert post["author"]["display_name"] == "MingleA"
        assert post["author"]["username"] == ""
        pytest.a_post_id = post["post_id"]

        # GET /mingle/posts pagination shape
        r = s.get(f"{API}/mingle/posts", headers=auth(user_a["token"]))
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "next_cursor" in body
        assert any(p["post_id"] == pytest.a_post_id for p in body["items"])


# =====================================================================
# 2. Isolation — mingle content stays out of main surfaces
# =====================================================================
class TestIsolation:
    def test_main_feed_excludes_mingle(self, s, demo_token):
        r = s.get(f"{API}/posts?scope=all", headers=auth(demo_token))
        assert r.status_code == 200
        ids = [p["post_id"] for p in r.json()["items"]]
        assert pytest.a_post_id not in ids
        r = s.get(f"{API}/posts?scope=following", headers=auth(demo_token))
        ids = [p["post_id"] for p in r.json()["items"]]
        assert pytest.a_post_id not in ids

    def test_user_posts_tabs_exclude_mingle(self, s, user_a, demo_token):
        for tab in ("posts", "photos"):
            r = s.get(f"{API}/users/{user_a['user_id']}/posts?tab={tab}", headers=auth(demo_token))
            assert r.status_code == 200
            ids = [p["post_id"] for p in r.json()]
            assert pytest.a_post_id not in ids

    def test_bookmark_saved_excludes_mingle(self, s, user_a):
        r = s.post(f"{API}/posts/{pytest.a_post_id}/bookmark", headers=auth(user_a["token"]))
        assert r.status_code == 200
        r = s.get(f"{API}/me/saved", headers=auth(user_a["token"]))
        assert r.status_code == 200
        ids = [p["post_id"] for p in r.json()]
        assert pytest.a_post_id not in ids

    def test_stories_endpoint_excludes_mingle(self, s, user_a):
        r = s.get(f"{API}/stories", headers=auth(user_a["token"]))
        # stories endpoint may return list or dict; ensure our mingle post id is absent from any 'post_id' field
        assert r.status_code == 200
        body = r.json()
        blob = str(body)
        assert pytest.a_post_id not in blob

    def test_get_post_by_id_gating(self, s, user_c_no_profile, user_b):
        # Non-member (premium but no profile) → 403
        r = s.get(f"{API}/posts/{pytest.a_post_id}", headers=auth(user_c_no_profile["token"]))
        assert r.status_code == 403
        # Member → 200
        r = s.get(f"{API}/posts/{pytest.a_post_id}", headers=auth(user_b["token"]))
        assert r.status_code == 200
        assert r.json()["space"] == "mingle"

    def test_main_post_creation_still_works(self, s, user_a):
        r = s.post(f"{API}/posts", headers=auth(user_a["token"]),
                   json={"text": "TEST_iter8 main-space post from A", "media": []})
        assert r.status_code == 201
        main_pid = r.json()["post_id"]
        pytest.a_main_pid = main_pid
        # appears in /posts with author.username populated
        r = s.get(f"{API}/posts?scope=all", headers=auth(user_a["token"]))
        item = next((p for p in r.json()["items"] if p["post_id"] == main_pid), None)
        assert item is not None
        assert item["author"].get("username")  # non-empty username
        assert item.get("space") in (None, "main")


# =====================================================================
# 3. Like / comment on mingle post
# =====================================================================
class TestMingleLikeComment:
    def test_member_like(self, s, user_b):
        r = s.post(f"{API}/posts/{pytest.a_post_id}/like", headers=auth(user_b["token"]))
        assert r.status_code == 200
        assert r.json()["liked"] is True

    def test_member_comment_ignores_mentions(self, s, user_b, user_a):
        r = s.post(f"{API}/posts/{pytest.a_post_id}/comments", headers=auth(user_b["token"]),
                   json={"text": "great TEST_iter8 comment", "mentions": [user_a["user_id"]]})
        assert r.status_code == 201, r.text
        c = r.json()
        assert c["mentions"] == []
        assert c["author"]["mingle"] is True
        assert c["author"]["username"] == ""
        assert c["author"]["display_name"] == "MingleB"
        pytest.b_comment_id = c["comment_id"]

    def test_list_comments_shape(self, s, user_a):
        r = s.get(f"{API}/posts/{pytest.a_post_id}/comments", headers=auth(user_a["token"]))
        assert r.status_code == 200
        comments = r.json()
        assert comments
        for c in comments:
            assert c["author"]["mingle"] is True
            assert c["author"]["username"] == ""

    def test_non_member_like_403(self, s, user_c_no_profile):
        r = s.post(f"{API}/posts/{pytest.a_post_id}/like", headers=auth(user_c_no_profile["token"]))
        assert r.status_code == 403

    def test_non_member_comment_403(self, s, user_c_no_profile):
        r = s.post(f"{API}/posts/{pytest.a_post_id}/comments", headers=auth(user_c_no_profile["token"]),
                   json={"text": "nope"})
        assert r.status_code == 403

    def test_notifications_use_mingle_identity(self, s, user_a):
        r = s.get(f"{API}/notifications", headers=auth(user_a["token"]))
        assert r.status_code == 200
        items = r.json()
        related = [n for n in items if n.get("post_id") == pytest.a_post_id]
        assert related, "expected like+comment notifications for A"
        for n in related:
            assert n["mingle"] is True, n
            assert n["actor"]["display_name"] == "MingleB"


# =====================================================================
# 4. Member view + mutual mingle
# =====================================================================
class TestMemberView:
    def test_is_me(self, s, user_a):
        r = s.get(f"{API}/mingle/members/{user_a['user_id']}", headers=auth(user_a["token"]))
        assert r.status_code == 200
        assert r.json()["is_me"] is True

    def test_mutual_mingle_and_member_view(self, s, user_a, user_b):
        r = s.post(f"{API}/mingle/actions", headers=auth(user_a["token"]),
                   json={"to_user_id": user_b["user_id"], "action": "interested"})
        assert r.status_code == 200
        assert r.json()["mingle"] is False
        r = s.post(f"{API}/mingle/actions", headers=auth(user_b["token"]),
                   json={"to_user_id": user_a["user_id"], "action": "interested"})
        assert r.status_code == 200
        data = r.json()
        assert data["mingle"] is True
        pytest.ab_connection_id = data["connection_id"]
        pytest.ab_conversation_id = data["conversation_id"]
        # member endpoint shows conn/conv both directions
        for viewer, other in ((user_a, user_b), (user_b, user_a)):
            r = s.get(f"{API}/mingle/members/{other['user_id']}", headers=auth(viewer["token"]))
            assert r.status_code == 200
            body = r.json()
            assert body["connection_id"] == pytest.ab_connection_id
            assert body["conversation_id"] == pytest.ab_conversation_id


# =====================================================================
# 5. Block / unblock
# =====================================================================
class TestBlockUnblock:
    def test_b_creates_post_first(self, s, user_b):
        r = s.post(f"{API}/mingle/posts", headers=auth(user_b["token"]),
                   json={"text": "TEST_iter8 B post", "media": []})
        assert r.status_code == 201
        pytest.b_post_id = r.json()["post_id"]

    def test_block_creates_entry(self, s, user_a, user_b):
        r = s.post(f"{API}/mingle/block", headers=auth(user_a["token"]),
                   json={"user_id": user_b["user_id"]})
        assert r.status_code == 200
        assert r.json()["blocked"] is True

    def test_blocks_list_shape(self, s, user_a, user_b):
        r = s.get(f"{API}/mingle/blocks", headers=auth(user_a["token"]))
        assert r.status_code == 200
        blocks = r.json()
        row = next((b for b in blocks if b["user_id"] == user_b["user_id"]), None)
        assert row is not None
        assert row["display_name"] == "MingleB"
        assert "photo_url" in row
        assert row["blocked_at"]

    def test_connections_hidden_both_sides(self, s, user_a, user_b):
        for viewer, other in ((user_a, user_b), (user_b, user_a)):
            r = s.get(f"{API}/mingle/connections", headers=auth(viewer["token"]))
            assert r.status_code == 200
            assert all(c["other"]["user_id"] != other["user_id"] for c in r.json())

    def test_b_post_hidden_from_a_feed(self, s, user_a):
        r = s.get(f"{API}/mingle/posts", headers=auth(user_a["token"]))
        assert r.status_code == 200
        assert all(p["post_id"] != pytest.b_post_id for p in r.json()["items"])

    def test_b_post_detail_404_for_a(self, s, user_a):
        r = s.get(f"{API}/posts/{pytest.b_post_id}", headers=auth(user_a["token"]))
        assert r.status_code == 404

    def test_messaging_blocked_both_ways(self, s, user_a, user_b):
        conv = pytest.ab_conversation_id
        r = s.post(f"{API}/conversations/{conv}/messages", headers=auth(user_a["token"]),
                   json={"text": "hi"})
        assert r.status_code == 403
        assert "message this member" in r.json().get("detail", "").lower()
        r = s.post(f"{API}/conversations/{conv}/messages", headers=auth(user_b["token"]),
                   json={"text": "hi"})
        assert r.status_code == 403

    def test_member_view_404_for_blocked(self, s, user_a, user_b):
        r = s.get(f"{API}/mingle/members/{user_b['user_id']}", headers=auth(user_a["token"]))
        assert r.status_code == 404

    def test_discover_excludes_blocked(self, s, user_a, user_b):
        r = s.get(f"{API}/mingle/discover", headers=auth(user_a["token"]))
        assert r.status_code == 200
        assert all(c["user_id"] != user_b["user_id"] for c in r.json())

    def test_unblock_and_second_404(self, s, user_a, user_b):
        r = s.delete(f"{API}/mingle/blocks/{user_b['user_id']}", headers=auth(user_a["token"]))
        assert r.status_code == 200
        assert r.json()["unblocked"] is True
        r = s.delete(f"{API}/mingle/blocks/{user_b['user_id']}", headers=auth(user_a["token"]))
        assert r.status_code == 404

    def test_connection_not_restored_after_unblock(self, s, user_a, user_b):
        for viewer, other in ((user_a, user_b), (user_b, user_a)):
            r = s.get(f"{API}/mingle/connections", headers=auth(viewer["token"]))
            assert all(c["other"]["user_id"] != other["user_id"] for c in r.json())

    def test_member_view_after_unblock_connection_null(self, s, user_a, user_b):
        r = s.get(f"{API}/mingle/members/{user_b['user_id']}", headers=auth(user_a["token"]))
        assert r.status_code == 200
        assert r.json()["connection_id"] is None

    def test_messaging_works_after_unblock(self, s, user_a):
        conv = pytest.ab_conversation_id
        r = s.post(f"{API}/conversations/{conv}/messages", headers=auth(user_a["token"]),
                   json={"text": "TEST_iter8 after unblock"})
        assert r.status_code == 201


# =====================================================================
# 6. Regression — existing Mingle flows
# =====================================================================
class TestMingleRegression:
    def test_get_me(self, s, demo_token):
        r = s.get(f"{API}/mingle/me", headers=auth(demo_token))
        assert r.status_code == 200
        assert r.json()["profile"] is not None

    def test_put_me_4_photos(self, s):
        u = _signup(s, activate_premium=True, with_mingle=False)
        _register(u)
        photos = [f"https://example.com/p{i}.jpg" for i in range(4)]
        r = s.put(f"{API}/mingle/me", headers=auth(u["token"]), json={
            "display_name": "PhotosUser", "age": 25, "location": "Miami",
            "trader_type": "Crypto", "looking_for": ["Friendship"],
            "bio": "test", "photos": photos,
        })
        assert r.status_code == 200
        prof = r.json()["profile"]
        assert prof["photos"] == photos
        assert prof["photo_url"] == photos[0]
        pytest.photos_user = u

    def test_discover(self, s, demo_token):
        r = s.get(f"{API}/mingle/discover", headers=auth(demo_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_actions_hi_creates_conversation_with_system_msg(self, s):
        # Create two members
        X = _signup(s, activate_premium=True, with_mingle=True, mingle_name="MingleX")
        Y = _signup(s, activate_premium=True, with_mingle=True, mingle_name="MingleY")
        _register(X); _register(Y)
        r = s.post(f"{API}/mingle/actions", headers=auth(X["token"]),
                   json={"to_user_id": Y["user_id"], "action": "hi"})
        assert r.status_code == 200
        conv = r.json()["conversation_id"]
        assert conv
        r = s.get(f"{API}/conversations/{conv}/messages", headers=auth(X["token"]))
        assert r.status_code == 200
        msgs = r.json()
        assert any("Single & Mingle" in (m.get("text") or "") for m in msgs)

    def test_inbox_shape(self, s, demo_token):
        r = s.get(f"{API}/mingle/inbox", headers=auth(demo_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_connections_shape(self, s, demo_token):
        r = s.get(f"{API}/mingle/connections", headers=auth(demo_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_delete_connection(self, s):
        # Fresh mutual match then unmatch (AB's original connection was already soft-deleted by the block flow).
        X = _signup(s, activate_premium=True, with_mingle=True, mingle_name="UnmatchX")
        Y = _signup(s, activate_premium=True, with_mingle=True, mingle_name="UnmatchY")
        _register(X); _register(Y)
        s.post(f"{API}/mingle/actions", headers=auth(X["token"]),
               json={"to_user_id": Y["user_id"], "action": "interested"})
        r = s.post(f"{API}/mingle/actions", headers=auth(Y["token"]),
                   json={"to_user_id": X["user_id"], "action": "interested"})
        conn_id = r.json()["connection_id"]
        r = s.delete(f"{API}/mingle/connections/{conn_id}", headers=auth(X["token"]))
        assert r.status_code == 200

    def test_report(self, s, user_a, user_b):
        r = s.post(f"{API}/mingle/report", headers=auth(user_a["token"]),
                   json={"user_id": user_b["user_id"], "reason": "TEST_iter8"})
        assert r.status_code == 200

    def test_status_toggle(self, s, demo_token):
        r = s.post(f"{API}/mingle/me/status", headers=auth(demo_token),
                   json={"show_badge": True})
        assert r.status_code == 200

    def test_delete_me_throwaway(self, s):
        u = _signup(s, activate_premium=True, with_mingle=True, mingle_name="Throwaway")
        r = s.delete(f"{API}/mingle/me", headers=auth(u["token"]))
        assert r.status_code == 200
        r = s.get(f"{API}/mingle/me", headers=auth(u["token"]))
        assert r.json()["profile"] is None


# =====================================================================
# 7. Main app regression
# =====================================================================
class TestMainRegression:
    def test_posts_crud_and_mentions_resolve_on_main(self, s):
        author = _signup(s, activate_premium=False, with_mingle=False)
        target = _signup(s, activate_premium=False, with_mingle=False)
        # ensure username exists
        r = s.get(f"{API}/auth/me", headers=auth(target["token"]))
        target_username = r.json().get("username")
        assert target_username
        text = f"hey @{target_username} TEST_iter8"
        r = s.post(f"{API}/posts", headers=auth(author["token"]),
                   json={"text": text, "media": [], "mentions": [target["user_id"]]})
        assert r.status_code == 201
        pid = r.json()["post_id"]
        assert target["user_id"] in r.json()["mentions"]
        # comment with mention
        r = s.post(f"{API}/posts/{pid}/comments", headers=auth(author["token"]),
                   json={"text": f"cc @{target_username}", "mentions": [target["user_id"]]})
        assert r.status_code == 201
        c = r.json()
        assert target["user_id"] in c["mentions"]
        assert any(mu["user_id"] == target["user_id"] for mu in c["mentioned_users"])
        # delete
        r = s.delete(f"{API}/posts/{pid}", headers=auth(author["token"]))
        assert r.status_code == 200

    def test_notifications_endpoint(self, s, demo_token):
        r = s.get(f"{API}/notifications", headers=auth(demo_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_membership_endpoint(self, s, demo_token):
        r = s.get(f"{API}/membership", headers=auth(demo_token))
        assert r.status_code == 200
        assert r.json()["tier"] == "premium"


# =====================================================================
# Teardown: clean up mingle profiles + demo state
# =====================================================================
@pytest.fixture(scope="module", autouse=True)
def _cleanup(s, demo_token, user_a, user_b):
    yield
    # Delete mingle profiles for all fresh test users
    for tok in list(set(CREATED_MINGLE_USERS)):
        try:
            s.delete(f"{API}/mingle/me", headers=auth(tok), timeout=10)
        except Exception:
            pass
    # Also A and B (they were created above but not registered via _register in some paths)
    for u in (user_a, user_b):
        try:
            s.delete(f"{API}/mingle/me", headers=auth(u["token"]), timeout=10)
        except Exception:
            pass
    # Ensure demo has no residual blocks (unblock everything demo blocked in this run — none expected, but be safe)
    try:
        r = s.get(f"{API}/mingle/blocks", headers=auth(demo_token), timeout=10)
        if r.status_code == 200:
            for b in r.json():
                s.delete(f"{API}/mingle/blocks/{b['user_id']}", headers=auth(demo_token), timeout=10)
    except Exception:
        pass
    # Ensure demo's Mingle profile is still present
    try:
        r = s.get(f"{API}/mingle/me", headers=auth(demo_token), timeout=10)
        if r.status_code == 200 and r.json().get("profile") is None:
            s.put(f"{API}/mingle/me", headers=auth(demo_token), json={
                "display_name": "DemoTrader", "age": 32, "location": "New York",
                "trader_type": "Multiple", "trading_style": "Swing Trader",
                "looking_for": ["Dating", "Networking"], "bio": "Level up demo",
                "photos": [],
            }, timeout=10)
    except Exception:
        pass
