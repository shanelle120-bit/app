"""
Iteration 13 — Legal & Compliance feature tests.

Covers:
- POST /api/auth/signup requires age_confirmed=true and agreed_to_terms=true (422 otherwise)
- Valid signup still returns access_token + user with consent fields
- GET /api/auth/me returns has_seen_trading_disclaimer / has_seen_mingle_safety booleans
- PUT /api/me accepts and persists has_seen_trading_disclaimer / has_seen_mingle_safety
- DELETE /api/auth/me soft-deletes; subsequent login fails with 401
- Regression: demo login, GET /api/posts, GET /api/membership still work
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", os.environ.get("EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


def unique_email():
    return f"TEST_legal_{uuid.uuid4().hex[:10]}@example.com"


class TestSignupConsent:
    def test_signup_missing_both_consent_fields_422(self, api_client):
        resp = api_client.post(f"{API}/auth/signup", json={
            "email": unique_email(), "password": "Password123!", "display_name": "Test User",
        })
        assert resp.status_code == 422, resp.text

    def test_signup_age_confirmed_only_422(self, api_client):
        resp = api_client.post(f"{API}/auth/signup", json={
            "email": unique_email(), "password": "Password123!", "display_name": "Test User",
            "age_confirmed": True, "agreed_to_terms": False,
        })
        assert resp.status_code == 422, resp.text

    def test_signup_terms_only_422(self, api_client):
        resp = api_client.post(f"{API}/auth/signup", json={
            "email": unique_email(), "password": "Password123!", "display_name": "Test User",
            "age_confirmed": False, "agreed_to_terms": True,
        })
        assert resp.status_code == 422, resp.text

    def test_signup_valid_consent_returns_token_and_user(self, api_client):
        email = unique_email()
        resp = api_client.post(f"{API}/auth/signup", json={
            "email": email, "password": "Password123!", "display_name": "Test Legal User",
            "age_confirmed": True, "agreed_to_terms": True,
        })
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        user = data["user"]
        assert user["email"] == email.casefold()
        assert user["has_seen_trading_disclaimer"] is False
        assert user["has_seen_mingle_safety"] is False

        # Cleanup: soft-delete this throwaway account
        token = data["access_token"]
        api_client.delete(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})


class TestMeFlagsAndDeletion:
    def _signup(self, api_client):
        email = unique_email()
        resp = api_client.post(f"{API}/auth/signup", json={
            "email": email, "password": "Password123!", "display_name": "Flag Test User",
            "age_confirmed": True, "agreed_to_terms": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        return email, data["access_token"]

    def test_auth_me_returns_flags(self, api_client):
        email, token = self._signup(api_client)
        headers = {"Authorization": f"Bearer {token}"}
        resp = api_client.get(f"{API}/auth/me", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "has_seen_trading_disclaimer" in data
        assert "has_seen_mingle_safety" in data
        assert data["has_seen_trading_disclaimer"] is False
        assert data["has_seen_mingle_safety"] is False
        api_client.delete(f"{API}/auth/me", headers=headers)

    def test_put_me_persists_trading_disclaimer_flag(self, api_client):
        email, token = self._signup(api_client)
        headers = {"Authorization": f"Bearer {token}"}
        put_resp = api_client.put(f"{API}/me", json={"has_seen_trading_disclaimer": True}, headers=headers)
        assert put_resp.status_code == 200, put_resp.text
        assert put_resp.json()["has_seen_trading_disclaimer"] is True

        get_resp = api_client.get(f"{API}/auth/me", headers=headers)
        assert get_resp.json()["has_seen_trading_disclaimer"] is True
        api_client.delete(f"{API}/auth/me", headers=headers)

    def test_put_me_persists_mingle_safety_flag(self, api_client):
        email, token = self._signup(api_client)
        headers = {"Authorization": f"Bearer {token}"}
        put_resp = api_client.put(f"{API}/me", json={"has_seen_mingle_safety": True}, headers=headers)
        assert put_resp.status_code == 200, put_resp.text
        assert put_resp.json()["has_seen_mingle_safety"] is True

        get_resp = api_client.get(f"{API}/auth/me", headers=headers)
        assert get_resp.json()["has_seen_mingle_safety"] is True
        api_client.delete(f"{API}/auth/me", headers=headers)

    def test_delete_account_soft_deletes_and_login_fails(self, api_client):
        email, token = self._signup(api_client)
        headers = {"Authorization": f"Bearer {token}"}
        del_resp = api_client.delete(f"{API}/auth/me", headers=headers)
        assert del_resp.status_code == 200, del_resp.text

        # Login with same credentials must now fail with 401
        login_resp = api_client.post(f"{API}/auth/login", json={"email": email, "password": "Password123!"})
        assert login_resp.status_code == 401, login_resp.text
        assert "Invalid email or password" in login_resp.json().get("detail", "")

        # Token itself should also be invalid now (resolve_token filters deleted_at=None)
        me_resp = api_client.get(f"{API}/auth/me", headers=headers)
        assert me_resp.status_code == 401


class TestRegressionDemoAccount:
    def test_demo_login_still_works(self, api_client):
        resp = api_client.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == DEMO_EMAIL

    def test_demo_me_has_flags(self, api_client):
        login_resp = api_client.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        token = login_resp.json()["access_token"]
        me_resp = api_client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        data = me_resp.json()
        assert isinstance(data.get("has_seen_trading_disclaimer"), bool)
        assert isinstance(data.get("has_seen_mingle_safety"), bool)

    def test_demo_posts_feed_still_works(self, api_client):
        login_resp = api_client.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        token = login_resp.json()["access_token"]
        resp = api_client.get(f"{API}/posts?scope=all&limit=15", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert "items" in resp.json()

    def test_demo_membership_still_works(self, api_client):
        login_resp = api_client.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        token = login_resp.json()["access_token"]
        resp = api_client.get(f"{API}/membership", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
