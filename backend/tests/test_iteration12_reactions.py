"""Iteration 12: verify updated reactions set (💜 replaces 🩷, ‼️ replaces 🗣️)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://navy-social-platform.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token")
    assert tok, r.json()
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def post_id(headers):
    r = requests.get(f"{API}/posts?limit=20", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    assert items, "no posts in main feed"
    pid = items[0]["post_id"]
    yield pid
    # Cleanup: remove any reaction we may have left
    requests.post(f"{API}/posts/{pid}/react", headers=headers, json={"reaction": None}, timeout=15)


# ---- Valid reactions ----

def test_react_purple_heart(headers, post_id):
    r = requests.post(f"{API}/posts/{post_id}/react", headers=headers, json={"reaction": "💜"}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["my_reaction"] == "💜"
    assert body["liked"] is True


def test_react_double_bang(headers, post_id):
    r = requests.post(f"{API}/posts/{post_id}/react", headers=headers, json={"reaction": "‼️"}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["my_reaction"] == "‼️"


# ---- Rejected legacy reactions ----

def test_react_pink_heart_rejected(headers, post_id):
    r = requests.post(f"{API}/posts/{post_id}/react", headers=headers, json={"reaction": "🩷"}, timeout=15)
    assert r.status_code == 400, r.text
    assert "Unknown reaction" in r.json().get("detail", "")


def test_react_speaking_head_rejected(headers, post_id):
    r = requests.post(f"{API}/posts/{post_id}/react", headers=headers, json={"reaction": "🗣️"}, timeout=15)
    assert r.status_code == 400, r.text
    assert "Unknown reaction" in r.json().get("detail", "")


# ---- Removal ----

def test_react_null_removes(headers, post_id):
    # Ensure a reaction is present
    requests.post(f"{API}/posts/{post_id}/react", headers=headers, json={"reaction": "🔥"}, timeout=15)
    r = requests.post(f"{API}/posts/{post_id}/react", headers=headers, json={"reaction": None}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["my_reaction"] is None
    assert body["liked"] is False


# ---- Legacy /like endpoint ----

def test_like_toggle_defaults_to_purple(headers, post_id):
    # Make sure we have no reaction first
    requests.post(f"{API}/posts/{post_id}/react", headers=headers, json={"reaction": None}, timeout=15)
    r1 = requests.post(f"{API}/posts/{post_id}/like", headers=headers, timeout=15)
    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    assert b1["my_reaction"] == "💜"
    assert b1["liked"] is True

    r2 = requests.post(f"{API}/posts/{post_id}/like", headers=headers, timeout=15)
    assert r2.status_code == 200, r2.text
    b2 = r2.json()
    assert b2["my_reaction"] is None
    assert b2["liked"] is False


# ---- Reaction summary never contains legacy emojis ----

def test_no_legacy_emojis_in_summaries(headers):
    r = requests.get(f"{API}/posts?limit=30", headers=headers, timeout=15)
    assert r.status_code == 200
    items = r.json().get("items", [])
    for p in items:
        keys = list((p.get("reactions") or {}).keys())
        assert "🩷" not in keys, f"pink heart found in post {p['post_id']} reactions"
        assert "🗣️" not in keys, f"speaking head found in post {p['post_id']} reactions"


def test_no_legacy_emojis_in_trading_summaries(headers):
    r = requests.get(f"{API}/posts?space=trading&limit=30", headers=headers, timeout=15)
    # demo is Premium – expect 200
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    for p in items:
        keys = list((p.get("reactions") or {}).keys())
        assert "🩷" not in keys
        assert "🗣️" not in keys
