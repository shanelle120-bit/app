"""Iteration 11 - Trading Only Premium feed. Tests copy-of-main behaviour scoped to space='trading'."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://navy-social-platform.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASS = "Trader123!"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _me(tok):
    r = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


STATE = {}  # module-level shared state across tests


@pytest.fixture(scope="module")
def demo():
    tok = _login(DEMO_EMAIL, DEMO_PASS)
    me = _me(tok)
    return {"tok": tok, "me": me}


@pytest.fixture(scope="module")
def fresh_free():
    """Fresh free-tier signup."""
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"TEST_iter11_free_{suffix}@example.com",
        "password": "TestPass123!",
        "username": f"test11free{suffix}",
        "display_name": "TEST iter11 Free",
    }
    r = requests.post(f"{API}/auth/signup", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    # Complete onboarding if endpoint exists (best effort)
    requests.post(f"{API}/onboarding/complete", headers=_hdr(tok), json={}, timeout=15)
    return {"tok": tok, "email": payload["email"]}


@pytest.fixture(scope="module")
def fresh_premium():
    """Fresh signup then activate premium."""
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "email": f"TEST_iter11_prem_{suffix}@example.com",
        "password": "TestPass123!",
        "username": f"test11prem{suffix}",
        "display_name": "TEST iter11 Premium",
    }
    r = requests.post(f"{API}/auth/signup", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("access_token") or r.json().get("token")
    requests.post(f"{API}/onboarding/complete", headers=_hdr(tok), json={}, timeout=15)
    r = requests.post(f"{API}/membership/activate", headers=_hdr(tok), json={"plan": "monthly"}, timeout=15)
    assert r.status_code == 200, r.text
    return {"tok": tok}


CREATED_POSTS = []  # (tok, post_id)


def _cleanup(post_ids_and_toks):
    for tok, pid in post_ids_and_toks:
        try:
            requests.delete(f"{API}/posts/{pid}", headers=_hdr(tok), timeout=15)
        except Exception:
            pass


# ---------------- BACKEND: Trading Only core ----------------

class TestTradingOnlyDemo:
    def test_01_login_demo(self, demo):
        assert demo["me"]["username"] == "demo_trader"

    def test_02_create_trading_post(self, demo):
        r = requests.post(f"{API}/posts", headers=_hdr(demo["tok"]),
                          json={"text": "TEST_iter11 prop firm question", "space": "trading", "mentions": []},
                          timeout=15)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["space"] == "trading"
        assert body["author"]["username"] == "demo_trader"  # normal identity
        assert body["text"] == "TEST_iter11 prop firm question"
        CREATED_POSTS.append((demo["tok"], body["post_id"]))
        STATE['trading_post_id'] = body["post_id"]

    def test_03_trading_feed_contains_it(self, demo):
        r = requests.get(f"{API}/posts?space=trading", headers=_hdr(demo["tok"]), timeout=15)
        assert r.status_code == 200
        ids = [p["post_id"] for p in r.json()["items"]]
        assert STATE['trading_post_id'] in ids

    def test_04_main_feed_excludes_trading(self, demo):
        for scope in ("all", "following"):
            r = requests.get(f"{API}/posts?scope={scope}", headers=_hdr(demo["tok"]), timeout=15)
            assert r.status_code == 200
            ids = [p["post_id"] for p in r.json()["items"]]
            assert STATE['trading_post_id'] not in ids, f"trading leaked into main feed scope={scope}"

    def test_05_user_posts_excludes_trading(self, demo):
        r = requests.get(f"{API}/users/{demo['me']['user_id']}/posts", headers=_hdr(demo["tok"]), timeout=15)
        assert r.status_code == 200
        ids = [p["post_id"] for p in r.json()]
        assert STATE['trading_post_id'] not in ids

    def test_06_get_by_id_ok_for_demo(self, demo):
        r = requests.get(f"{API}/posts/{STATE['trading_post_id']}", headers=_hdr(demo["tok"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["space"] == "trading"

    def test_07_react_fire(self, demo):
        r = requests.post(f"{API}/posts/{STATE['trading_post_id']}/react",
                          headers=_hdr(demo["tok"]), json={"reaction": "🔥"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["my_reaction"] == "🔥"

    def test_08_comment_with_mention(self, demo):
        r = requests.post(f"{API}/posts/{STATE['trading_post_id']}/comments",
                          headers=_hdr(demo["tok"]),
                          json={"text": "TEST_iter11 self mention @demo_trader",
                                "mentions": [demo["me"]["user_id"]], "space": "trading"},
                          timeout=15)
        assert r.status_code == 201, r.text
        body = r.json()
        assert demo["me"]["user_id"] in (body.get("mentions") or [])
        assert any(u.get("username") == "demo_trader" for u in body.get("mentioned_users", []))

    def test_09_share(self, demo):
        r = requests.post(f"{API}/posts/{STATE['trading_post_id']}/share",
                          headers=_hdr(demo["tok"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["shares_count"] >= 1

    def test_10_bookmark_and_saved_includes_it(self, demo):
        r = requests.post(f"{API}/posts/{STATE['trading_post_id']}/bookmark",
                          headers=_hdr(demo["tok"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["saved"] is True
        r = requests.get(f"{API}/me/saved", headers=_hdr(demo["tok"]), timeout=15)
        assert r.status_code == 200
        ids = [p["post_id"] for p in r.json()]
        assert STATE['trading_post_id'] in ids

    def test_11_main_regression_no_space(self, demo):
        r = requests.post(f"{API}/posts", headers=_hdr(demo["tok"]),
                          json={"text": "TEST_iter11 regression main"}, timeout=15)
        assert r.status_code == 201
        body = r.json()
        assert body["space"] == "main"
        CREATED_POSTS.append((demo["tok"], body["post_id"]))


# ---------------- BACKEND: gating ----------------

class TestTradingOnlyGating:
    def test_12_free_cannot_list_trading(self, fresh_free):
        r = requests.get(f"{API}/posts?space=trading", headers=_hdr(fresh_free["tok"]), timeout=15)
        assert r.status_code == 402

    def test_13_free_cannot_post_trading(self, fresh_free):
        r = requests.post(f"{API}/posts", headers=_hdr(fresh_free["tok"]),
                          json={"text": "TEST_iter11 free trying", "space": "trading"}, timeout=15)
        assert r.status_code == 402

    def test_14_free_cannot_get_trading_post(self, fresh_free):
        r = requests.get(f"{API}/posts/{STATE['trading_post_id']}", headers=_hdr(fresh_free["tok"]), timeout=15)
        assert r.status_code == 402

    def test_15_activate_then_all_ok(self, fresh_free):
        r = requests.post(f"{API}/membership/activate", headers=_hdr(fresh_free["tok"]),
                          json={"plan": "monthly"}, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/posts?space=trading", headers=_hdr(fresh_free["tok"]), timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{API}/posts/{STATE['trading_post_id']}", headers=_hdr(fresh_free["tok"]), timeout=15)
        assert r.status_code == 200
        r = requests.post(f"{API}/posts", headers=_hdr(fresh_free["tok"]),
                          json={"text": "TEST_iter11 now premium", "space": "trading"}, timeout=15)
        assert r.status_code == 201
        CREATED_POSTS.append((fresh_free["tok"], r.json()["post_id"]))

    def test_16_membership_features_trading_only(self, fresh_free):
        r = requests.get(f"{API}/membership", headers=_hdr(fresh_free["tok"]), timeout=15)
        assert r.status_code == 200
        feats = r.json().get("features", [])
        tof = next((f for f in feats if f.get("key") == "trading_only"), None)
        assert tof, f"trading_only missing in features: {feats}"
        assert tof.get("available") is True
        assert tof.get("unlocked") is True


# ---------------- BACKEND: notifications (normal identity) ----------------

class TestTradingNotifications:
    def test_17_notifications_normal_identity(self, demo, fresh_premium):
        # fresh premium reacts and comments on demo trading post
        r = requests.post(f"{API}/posts/{STATE['trading_post_id']}/react",
                          headers=_hdr(fresh_premium["tok"]), json={"reaction": "🔥"}, timeout=15)
        assert r.status_code == 200, r.text
        r = requests.post(f"{API}/posts/{STATE['trading_post_id']}/comments",
                          headers=_hdr(fresh_premium["tok"]),
                          json={"text": "TEST_iter11 nice question", "space": "trading"}, timeout=15)
        assert r.status_code == 201, r.text
        time.sleep(1)
        r = requests.get(f"{API}/notifications", headers=_hdr(demo["tok"]), timeout=15)
        assert r.status_code == 200
        notifs = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        rel = [n for n in notifs if n.get("post_id") == STATE['trading_post_id']]
        assert rel, "no notifications for demo about trading post"
        # normal actor identity: username should NOT be a mingle alias
        for n in rel:
            actor = n.get("actor") or {}
            assert actor.get("username"), f"actor missing normal username: {n}"
            assert n.get("mingle") in (False, None), f"mingle flag set on notification: {n}"


def teardown_module(module):
    _cleanup(CREATED_POSTS)
