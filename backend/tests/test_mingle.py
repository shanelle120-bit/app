"""Backend tests for Single & Mingle feature."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://mongo-web-portal.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"


def auth(t):
    return {"Authorization": f"Bearer {t}"}


def _signup(s):
    suffix = uuid.uuid4().hex[:8]
    email = f"mingle_{suffix}@leveluphub.com"
    r = s.post(f"{API}/auth/signup", json={"email": email, "password": "InitPass123!",
                                            "display_name": f"TEST Mingle {suffix}"}, timeout=20)
    assert r.status_code == 201, r.text
    body = r.json()
    return {"email": email, "token": body["access_token"], "user": body["user"]}


def _valid_profile(**over):
    p = {
        "display_name": "TEST Trader",
        "age": 30,
        "location": "New York",
        "trader_type": "Multiple",
        "trading_style": "Day Trader",
        "looking_for": ["Networking"],
        "bio": "Trading and vibing",
        "favorite_instrument": "ES",
        "interests": "coffee, charts",
        "prompt_key": "red_flag",
        "prompt_answer": "over-leveraging",
        "photo_url": None,
    }
    p.update(over)
    return p


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def demo_token(s):
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
    assert r.status_code == 200
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def demo_user(s, demo_token):
    r = s.get(f"{API}/auth/me", headers=auth(demo_token))
    assert r.status_code == 200
    return r.json()


# Ensure demo has no mingle profile at start/end (per request)
@pytest.fixture(scope="module", autouse=True)
def _demo_no_mingle(s, demo_token):
    s.delete(f"{API}/mingle/me", headers=auth(demo_token))
    yield
    s.delete(f"{API}/mingle/me", headers=auth(demo_token))


class TestMingleMeta:
    def test_meta(self, s):
        r = s.get(f"{API}/mingle/meta")
        assert r.status_code == 200
        data = r.json()
        assert "Futures" in data["trader_types"]
        assert "Dating" in data["looking_for"]
        assert "red_flag" in data["prompts"]
        assert "background checks" in data["safety_notice"]


class TestMingleProfileBasics:
    def test_me_fresh_null(self, s):
        u = _signup(s)
        r = s.get(f"{API}/mingle/me", headers=auth(u["token"]))
        assert r.status_code == 200
        assert r.json() == {"profile": None}

    def test_discover_forbidden_without_profile(self, s):
        u = _signup(s)
        r = s.get(f"{API}/mingle/discover", headers=auth(u["token"]))
        assert r.status_code == 403

    def test_put_underage_rejected(self, s):
        u = _signup(s)
        r = s.put(f"{API}/mingle/me", headers=auth(u["token"]), json=_valid_profile(age=17))
        assert r.status_code == 422

    def test_put_valid_returns_profile(self, s):
        u = _signup(s)
        r = s.put(f"{API}/mingle/me", headers=auth(u["token"]), json=_valid_profile())
        assert r.status_code == 200
        prof = r.json()["profile"]
        assert prof["age"] == 30
        assert prof["display_name"] == "TEST Trader"
        assert prof["active"] is True
        assert prof["show_badge"] is True
        assert prof["allow_hi_from"] == "everyone"
        assert prof["prompt_label"]


class TestMingleDiscover:
    @pytest.fixture(scope="class")
    def user(self, s):
        u = _signup(s)
        r = s.put(f"{API}/mingle/me", headers=auth(u["token"]),
                  json=_valid_profile(age=25, location="New York"))
        assert r.status_code == 200
        return u

    def test_seeded_visible(self, s, user):
        r = s.get(f"{API}/mingle/discover", headers=auth(user["token"]))
        assert r.status_code == 200
        cards = r.json()
        names = [c["display_name"].lower() for c in cards]
        # At least 4 seeded
        assert len(cards) >= 4
        joined = " ".join(names)
        for expected in ("marcus", "sophia", "devon", "ava"):
            assert expected in joined, f"missing {expected} in {names}"
        # Not self
        assert all(c["user_id"] != user["user"]["user_id"] for c in cards)

    def test_filter_trader_type_futures(self, s, user):
        r = s.get(f"{API}/mingle/discover?trader_type=Futures", headers=auth(user["token"]))
        assert r.status_code == 200
        cards = r.json()
        assert cards, "expected Marcus at least"
        assert all(c["trader_type"] == "Futures" for c in cards)

    def test_filter_min_age_30(self, s, user):
        r = s.get(f"{API}/mingle/discover?min_age=30", headers=auth(user["token"]))
        assert r.status_code == 200
        cards = r.json()
        assert cards
        assert all(c["age"] >= 30 for c in cards)

    def test_filter_location_austin(self, s, user):
        r = s.get(f"{API}/mingle/discover?location=austin", headers=auth(user["token"]))
        assert r.status_code == 200
        cards = r.json()
        assert cards
        assert all("austin" in (c["location"] or "").lower() for c in cards)

    def test_filter_looking_for_dating(self, s, user):
        r = s.get(f"{API}/mingle/discover?looking_for=Dating", headers=auth(user["token"]))
        assert r.status_code == 200
        cards = r.json()
        assert cards
        assert all("Dating" in c["looking_for"] for c in cards)


class TestMingleMutualMatch:
    def test_mutual_flow(self, s):
        A = _signup(s); B = _signup(s)
        assert s.put(f"{API}/mingle/me", headers=auth(A["token"]),
                     json=_valid_profile(display_name="TEST A")).status_code == 200
        assert s.put(f"{API}/mingle/me", headers=auth(B["token"]),
                     json=_valid_profile(display_name="TEST B")).status_code == 200

        # A -> B interested (no mingle yet)
        r = s.post(f"{API}/mingle/actions", headers=auth(A["token"]),
                   json={"to_user_id": B["user"]["user_id"], "action": "interested"})
        assert r.status_code == 200
        assert r.json()["mingle"] is False

        # B -> A interested (mutual)
        r = s.post(f"{API}/mingle/actions", headers=auth(B["token"]),
                   json={"to_user_id": A["user"]["user_id"], "action": "interested"})
        assert r.status_code == 200
        data = r.json()
        assert data["mingle"] is True
        assert data["connection_id"] and data["conversation_id"]
        conv_id = data["conversation_id"]
        conn_id = data["connection_id"]

        # A's conversations include this
        r = s.get(f"{API}/conversations", headers=auth(A["token"]))
        assert r.status_code == 200
        assert any(c["conversation_id"] == conv_id for c in r.json())

        # connections list for both
        for U in (A, B):
            r = s.get(f"{API}/mingle/connections", headers=auth(U["token"]))
            assert r.status_code == 200
            assert any(c["connection_id"] == conn_id for c in r.json())

        # After acting, B should not appear in A's discover
        r = s.get(f"{API}/mingle/discover", headers=auth(A["token"]))
        assert r.status_code == 200
        assert all(c["user_id"] != B["user"]["user_id"] for c in r.json())

        # A deletes the connection
        r = s.delete(f"{API}/mingle/connections/{conn_id}", headers=auth(A["token"]))
        assert r.status_code == 200
        # B's connections no longer includes it
        r = s.get(f"{API}/mingle/connections", headers=auth(B["token"]))
        assert all(c["connection_id"] != conn_id for c in r.json())


class TestMinglePrivacyAndSafety:
    def test_full_privacy_flow(self, s):
        A = _signup(s); B = _signup(s)
        s.put(f"{API}/mingle/me", headers=auth(A["token"]), json=_valid_profile(display_name="TEST A2"))
        s.put(f"{API}/mingle/me", headers=auth(B["token"]), json=_valid_profile(display_name="TEST B2"))

        # B: only connections can say hi
        r = s.post(f"{API}/mingle/me/status", headers=auth(B["token"]), json={"allow_hi_from": "connections"})
        assert r.status_code == 200
        # A -> B hi should be 403
        r = s.post(f"{API}/mingle/actions", headers=auth(A["token"]),
                   json={"to_user_id": B["user"]["user_id"], "action": "hi"})
        assert r.status_code == 403

        # B relaxes
        s.post(f"{API}/mingle/me/status", headers=auth(B["token"]), json={"allow_hi_from": "everyone"})
        r = s.post(f"{API}/mingle/actions", headers=auth(A["token"]),
                   json={"to_user_id": B["user"]["user_id"], "action": "hi"})
        assert r.status_code == 200
        conv_id = r.json()["conversation_id"]
        # greeting msg exists
        r = s.get(f"{API}/conversations/{conv_id}/messages", headers=auth(A["token"]))
        assert r.status_code == 200
        msgs = r.json()
        assert any("Hi" in (m.get("text") or "") and "Single & Mingle" in (m.get("text") or "") for m in msgs), msgs

        # A blocks B
        r = s.post(f"{API}/mingle/block", headers=auth(A["token"]),
                   json={"user_id": B["user"]["user_id"]})
        assert r.status_code == 200 and r.json()["blocked"] is True
        # B not in A's discover
        r = s.get(f"{API}/mingle/discover", headers=auth(A["token"]))
        assert all(c["user_id"] != B["user"]["user_id"] for c in r.json())
        # B not in A's connections
        r = s.get(f"{API}/mingle/connections", headers=auth(A["token"]))
        assert all(c["other"]["user_id"] != B["user"]["user_id"] for c in r.json())
        # B action toward A -> 404
        r = s.post(f"{API}/mingle/actions", headers=auth(B["token"]),
                   json={"to_user_id": A["user"]["user_id"], "action": "interested"})
        assert r.status_code == 404

        # A reports someone
        r = s.post(f"{API}/mingle/report", headers=auth(A["token"]),
                   json={"user_id": B["user"]["user_id"], "reason": "TEST"})
        assert r.status_code == 200 and r.json()["reported"] is True

        # A leaves
        r = s.delete(f"{API}/mingle/me", headers=auth(A["token"]))
        assert r.status_code == 200
        r = s.get(f"{API}/mingle/me", headers=auth(A["token"]))
        assert r.status_code == 200 and r.json()["profile"] is None
        # A absent from B's discover
        r = s.get(f"{API}/mingle/discover", headers=auth(B["token"]))
        assert all(c["user_id"] != A["user"]["user_id"] for c in r.json())
        # A's main auth still works
        r = s.get(f"{API}/auth/me", headers=auth(A["token"]))
        assert r.status_code == 200
        # A can still create post
        r = s.post(f"{API}/posts", headers=auth(A["token"]), json={"text": "TEST post after leave"})
        assert r.status_code == 201
        pid = r.json()["post_id"]
        s.delete(f"{API}/posts/{pid}", headers=auth(A["token"]))


class TestMingleBadge:
    def test_badge_toggle_via_user_detail(self, s):
        A = _signup(s); B = _signup(s)
        s.put(f"{API}/mingle/me", headers=auth(A["token"]), json=_valid_profile(display_name="TEST A3"))
        s.put(f"{API}/mingle/me", headers=auth(B["token"]), json=_valid_profile(display_name="TEST B3"))

        # A views B
        r = s.get(f"{API}/users/{B['user']['user_id']}", headers=auth(A["token"]))
        assert r.status_code == 200
        detail = r.json()
        assert detail.get("mingle_badge") is True, detail

        # B hides badge
        r = s.post(f"{API}/mingle/me/status", headers=auth(B["token"]), json={"show_badge": False})
        assert r.status_code == 200
        r = s.get(f"{API}/users/{B['user']['user_id']}", headers=auth(A["token"]))
        assert r.status_code == 200
        assert r.json().get("mingle_badge") is False
