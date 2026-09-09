"""
Iteration 15: Billing waitlist + minimal admin role tests.
Covers:
 - POST /api/membership/notify-billing (auth required, idempotent upsert)
 - GET /api/membership includes notified_billing bool
 - GET /api/admin/billing-waitlist (401/403/200 gating)
 - Admin auto-promotion via ADMIN_EMAILS allowlist on signup
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"
ADMIN_EMAIL = "shanelle120@gmail.com"
ADMIN_PASSWORD = "Test1234!"


@pytest.fixture(scope="module")
def api_client():
    return requests.Session()


@pytest.fixture(scope="module")
def demo_token(api_client):
    resp = api_client.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"Could not login demo account: {resp.status_code} {resp.text}")
    return resp.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token(api_client):
    # Try signup first; if already exists, login instead.
    resp = api_client.post(f"{API}/auth/signup", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "display_name": "Shanelle Admin",
        "age_confirmed": True,
        "agreed_to_terms": True,
    })
    if resp.status_code == 201:
        data = resp.json()
        assert data["user"]["is_admin"] is True, "Admin email should be auto-promoted on signup"
        return data["access_token"]
    elif resp.status_code == 409:
        login_resp = api_client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        if login_resp.status_code != 200:
            pytest.skip(
                "Admin account exists but password differs from expected test password. "
                "See /app/memory/test_credentials.md for current password (was reset via dev_code flow)."
            )
        data = login_resp.json()
        assert data["user"]["is_admin"] is True
        return data["access_token"]
    else:
        pytest.fail(f"Unexpected signup response: {resp.status_code} {resp.text}")


class TestAdminPromotion:
    def test_admin_email_auto_promoted(self, admin_token):
        assert admin_token is not None

    def test_regular_signup_is_not_admin(self, api_client):
        email = f"TEST_regular_{uuid.uuid4().hex[:8]}@example.com"
        resp = api_client.post(f"{API}/auth/signup", json={
            "email": email,
            "password": "RegularPass1!",
            "display_name": "Regular Trader",
            "age_confirmed": True,
            "agreed_to_terms": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["user"]["is_admin"] is False


class TestMembershipNotifyBilling:
    def test_notify_billing_requires_auth(self, api_client):
        resp = api_client.post(f"{API}/membership/notify-billing", json={"plan": "yearly"})
        assert resp.status_code in (401, 403)

    def test_membership_shows_notified_billing_false_before(self, api_client, demo_token):
        # Not asserting False strictly since other tests may have run before; just check field exists & is bool
        resp = api_client.get(f"{API}/membership", headers={"Authorization": f"Bearer {demo_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "notified_billing" in data
        assert isinstance(data["notified_billing"], bool)

    def test_notify_billing_persists_and_idempotent(self, api_client, demo_token):
        headers = {"Authorization": f"Bearer {demo_token}"}
        resp1 = api_client.post(f"{API}/membership/notify-billing", json={"plan": "yearly"}, headers=headers)
        assert resp1.status_code == 200
        assert resp1.json()["ok"] is True

        # Verify membership now reflects notified_billing True
        mem = api_client.get(f"{API}/membership", headers=headers)
        assert mem.status_code == 200
        assert mem.json()["notified_billing"] is True

        # Re-tap should not error and remain idempotent
        resp2 = api_client.post(f"{API}/membership/notify-billing", json={"plan": "yearly"}, headers=headers)
        assert resp2.status_code == 200

        mem2 = api_client.get(f"{API}/membership", headers=headers)
        assert mem2.json()["notified_billing"] is True


class TestAdminBillingWaitlist:
    def test_no_token_returns_401(self, api_client):
        resp = api_client.get(f"{API}/admin/billing-waitlist")
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, api_client):
        resp = api_client.get(f"{API}/admin/billing-waitlist", headers={"Authorization": "Bearer invalid.token.here"})
        assert resp.status_code == 401

    def test_non_admin_returns_403(self, api_client, demo_token):
        resp = api_client.get(f"{API}/admin/billing-waitlist", headers={"Authorization": f"Bearer {demo_token}"})
        assert resp.status_code == 403

    def test_admin_returns_200_with_items(self, api_client, admin_token, demo_token):
        # Ensure demo user is on the waitlist first (dependency on TestMembershipNotifyBilling order not guaranteed,
        # so re-post here to be safe/idempotent)
        api_client.post(f"{API}/membership/notify-billing", json={"plan": "yearly"},
                         headers={"Authorization": f"Bearer {demo_token}"})

        resp = api_client.get(f"{API}/admin/billing-waitlist", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data and "count" in data
        assert isinstance(data["items"], list)
        assert data["count"] == len(data["items"])
        demo_entries = [it for it in data["items"] if it.get("email") == DEMO_EMAIL]
        assert len(demo_entries) == 1, "demo@leveluphub.com should appear exactly once in waitlist (idempotent upsert)"
        entry = demo_entries[0]
        assert entry["plan"] == "yearly"
        assert "created_at" in entry and entry["created_at"]
        assert "user_id" in entry
