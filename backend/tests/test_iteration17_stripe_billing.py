"""
Iteration 17: Real Stripe billing integration tests.
Covers:
 - GET /api/membership plans array is monthly-only (Yearly removed)
 - POST /api/billing/checkout-link (auth) returns stripe payment link URL w/ client_reference_id + prefilled_email
   and persists a checkout_tokens doc
 - POST /api/billing/portal (auth, no stripe_customer_id) -> 400 "No subscription found to manage yet"
 - POST /api/stripe/webhook with invalid signature -> 400, no crash
 - Regression: POST /api/membership/notify-billing + GET /api/admin/billing-waitlist still work
"""
import os
import pytest
import requests
from urllib.parse import urlparse, parse_qs

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
    resp = api_client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"Could not login admin account: {resp.status_code} {resp.text}")
    return resp.json()["access_token"]


class TestMembershipPlans:
    def test_plans_array_is_monthly_only(self, api_client, demo_token):
        resp = api_client.get(f"{API}/membership", headers={"Authorization": f"Bearer {demo_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "plans" in data
        assert len(data["plans"]) == 1, f"Expected exactly 1 plan (monthly), got {data['plans']}"
        plan = data["plans"][0]
        assert plan["id"] == "monthly"
        assert plan["price"] == "$9.99/mo"
        assert "trial" in plan["price_note"].lower()

    def test_membership_requires_auth(self, api_client):
        resp = api_client.get(f"{API}/membership")
        assert resp.status_code in (401, 403)


class TestCheckoutLink:
    def test_checkout_link_returns_valid_stripe_url(self, api_client, demo_token):
        resp = api_client.post(f"{API}/billing/checkout-link", headers={"Authorization": f"Bearer {demo_token}"})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "url" in data
        url = data["url"]
        assert url.startswith("https://buy.stripe.com/"), f"URL doesn't start with buy.stripe.com: {url}"
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        assert "client_reference_id" in qs
        assert "prefilled_email" in qs
        assert qs["prefilled_email"][0] == DEMO_EMAIL

    def test_checkout_link_requires_auth(self, api_client):
        resp = api_client.post(f"{API}/billing/checkout-link")
        assert resp.status_code in (401, 403)

    def test_checkout_link_creates_unique_token_each_call(self, api_client, demo_token):
        r1 = api_client.post(f"{API}/billing/checkout-link", headers={"Authorization": f"Bearer {demo_token}"})
        r2 = api_client.post(f"{API}/billing/checkout-link", headers={"Authorization": f"Bearer {demo_token}"})
        qs1 = parse_qs(urlparse(r1.json()["url"]).query)
        qs2 = parse_qs(urlparse(r2.json()["url"]).query)
        assert qs1["client_reference_id"][0] != qs2["client_reference_id"][0]


class TestBillingPortal:
    def test_portal_no_subscription_returns_400(self, api_client, demo_token):
        """demo@leveluphub.com was seeded premium via OLD mock activation and has NO stripe_customer_id."""
        resp = api_client.post(f"{API}/billing/portal", headers={"Authorization": f"Bearer {demo_token}"})
        assert resp.status_code == 400, resp.text
        assert "No subscription found" in resp.json().get("detail", "")

    def test_portal_requires_auth(self, api_client):
        resp = api_client.post(f"{API}/billing/portal")
        assert resp.status_code in (401, 403)


class TestStripeWebhook:
    def test_invalid_signature_rejected(self, api_client):
        resp = api_client.post(
            f"{API}/stripe/webhook",
            data=b'{"id": "evt_fake", "type": "checkout.session.completed"}',
            headers={"stripe-signature": "t=1,v1=garbage_invalid_signature", "Content-Type": "application/json"},
        )
        assert resp.status_code == 400
        assert "Invalid Stripe webhook signature" in resp.json().get("detail", "")

    def test_missing_signature_rejected(self, api_client):
        resp = api_client.post(
            f"{API}/stripe/webhook",
            data=b'{"id": "evt_fake2", "type": "checkout.session.completed"}',
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 400

    def test_server_still_healthy_after_bad_webhook(self, api_client, demo_token):
        """Ensure a malformed webhook didn't crash the server or corrupt demo user's data."""
        resp = api_client.get(f"{API}/membership", headers={"Authorization": f"Bearer {demo_token}"})
        assert resp.status_code == 200


class TestBillingWaitlistRegression:
    """Backend infra kept for notify-billing/admin-billing-waitlist though unlinked from UI now."""

    def test_notify_billing_still_works(self, api_client, demo_token):
        resp = api_client.post(
            f"{API}/membership/notify-billing",
            json={"plan": "monthly"},
            headers={"Authorization": f"Bearer {demo_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_admin_billing_waitlist_accessible_by_admin(self, api_client, admin_token):
        resp = api_client.get(f"{API}/admin/billing-waitlist", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data and "count" in data

    def test_admin_billing_waitlist_forbidden_for_non_admin(self, api_client, demo_token):
        resp = api_client.get(f"{API}/admin/billing-waitlist", headers={"Authorization": f"Bearer {demo_token}"})
        assert resp.status_code == 403
