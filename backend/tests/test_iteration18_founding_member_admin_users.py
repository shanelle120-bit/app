"""
Iteration 18: Founding Member badge data-flow + admin 'All Users' screen.
Covers:
 - GET /api/admin/users (admin-only 200/403/401, item shape)
 - author_summary() -> post response includes is_founding_member, flowing from a
   directly-mutated user document (mirrors real Stripe premium activation before cutoff)
 - Regression: /api/membership, /api/billing/checkout-link, /api/billing/portal still work
"""
import os
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

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
    data = resp.json()
    assert data["user"]["is_admin"] is True
    return data["access_token"]


class TestAdminUsersEndpoint:
    def test_no_token_returns_401(self, api_client):
        resp = api_client.get(f"{API}/admin/users")
        assert resp.status_code == 401

    def test_invalid_token_returns_401(self, api_client):
        resp = api_client.get(f"{API}/admin/users", headers={"Authorization": "Bearer invalid.token.here"})
        assert resp.status_code == 401

    def test_non_admin_returns_403(self, api_client, demo_token):
        resp = api_client.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {demo_token}"})
        assert resp.status_code == 403

    def test_admin_returns_200_with_valid_shape(self, api_client, admin_token, demo_token):
        resp = api_client.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data and "count" in data
        assert isinstance(data["items"], list)
        assert data["count"] == len(data["items"])
        assert data["count"] > 0

        demo_entries = [it for it in data["items"] if it.get("email") == DEMO_EMAIL]
        assert len(demo_entries) == 1
        entry = demo_entries[0]
        required_fields = ["user_id", "display_name", "username", "email", "avatar_url",
                            "tier", "is_founding_member", "is_admin", "created_at", "deleted"]
        for f in required_fields:
            assert f in entry, f"missing field {f}"
        assert isinstance(entry["is_founding_member"], bool)
        assert isinstance(entry["is_admin"], bool)
        assert isinstance(entry["deleted"], bool)
        assert entry["tier"] in ("free", "premium")

        admin_entries = [it for it in data["items"] if it.get("email") == ADMIN_EMAIL]
        assert len(admin_entries) == 1
        assert admin_entries[0]["is_admin"] is True


@pytest.fixture(scope="module")
def mongo_db():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        # Try loading from backend/.env directly (motor client not tied to backend process env)
        from dotenv import load_dotenv
        from pathlib import Path
        load_dotenv(Path(__file__).resolve().parent.parent / ".env")
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME not available for direct DB test setup")
    client = AsyncIOMotorClient(mongo_url)
    return client[db_name]


class TestFoundingMemberBadgeDataFlow:
    """Simulates the effect of a real first-premium Stripe activation before the
    Oct 15 2026 cutoff by directly mutating the user doc, then verifies the flag
    flows through author_summary() into the post API response (what post-card.tsx reads)."""

    @pytest.fixture(scope="class")
    def founding_user(self, api_client):
        email = f"TEST_founder_{uuid.uuid4().hex[:8]}@example.com"
        password = "FounderPass1!"
        resp = api_client.post(f"{API}/auth/signup", json={
            "email": email, "password": password, "display_name": "Founder Test",
            "age_confirmed": True, "agreed_to_terms": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        return {"user_id": data["user"]["user_id"], "token": data["access_token"], "email": email}

    @pytest.fixture(scope="class")
    def non_founding_user(self, api_client):
        email = f"TEST_regular_{uuid.uuid4().hex[:8]}@example.com"
        password = "RegularPass1!"
        resp = api_client.post(f"{API}/auth/signup", json={
            "email": email, "password": password, "display_name": "Regular Test",
            "age_confirmed": True, "agreed_to_terms": True,
        })
        assert resp.status_code == 201
        data = resp.json()
        return {"user_id": data["user"]["user_id"], "token": data["access_token"], "email": email}

    @pytest.mark.asyncio
    async def test_founding_member_flag_flows_to_post_author(self, api_client, founding_user, non_founding_user, mongo_db):
        # Directly mutate the DB to mirror a completed Stripe subscription before the cutoff.
        result = await mongo_db.users.update_one(
            {"user_id": founding_user["user_id"]},
            {"$set": {"is_founding_member": True, "membership": {"tier": "premium", "plan": "monthly", "since": None, "source": "stripe"}}},
        )
        assert result.matched_count == 1

        # Sanity: non-founding user's doc has no such flag.
        doc = await mongo_db.users.find_one({"user_id": non_founding_user["user_id"]})
        assert not doc.get("is_founding_member")

        # Create a post as the founding member.
        resp = api_client.post(
            f"{API}/posts",
            json={"text": "TEST_founder_post hello traders", "space": "main"},
            headers={"Authorization": f"Bearer {founding_user['token']}"},
        )
        assert resp.status_code == 201, resp.text
        post = resp.json()
        assert post["author"]["user_id"] == founding_user["user_id"]
        assert post["author"]["is_founding_member"] is True, "author.is_founding_member should be True after DB flag set"

        # Create a post as the non-founding user for contrast.
        resp2 = api_client.post(
            f"{API}/posts",
            json={"text": "TEST_regular_post hello traders", "space": "main"},
            headers={"Authorization": f"Bearer {non_founding_user['token']}"},
        )
        assert resp2.status_code == 201, resp2.text
        post2 = resp2.json()
        assert post2["author"]["is_founding_member"] is False

        # GET the post back directly (detail) to confirm persistence flows through GET too.
        get_resp = api_client.get(f"{API}/posts/{post['post_id']}", headers={"Authorization": f"Bearer {founding_user['token']}"})
        assert get_resp.status_code == 200
        assert get_resp.json()["author"]["is_founding_member"] is True

        # GET feed and confirm the founder post appears with the flag, regular post without.
        feed_resp = api_client.get(f"{API}/posts", headers={"Authorization": f"Bearer {founding_user['token']}"})
        assert feed_resp.status_code == 200
        items = feed_resp.json().get("items", [])
        founder_items = [p for p in items if p.get("post_id") == post["post_id"]]
        assert len(founder_items) == 1, "founder's post should be visible in main feed"
        assert founder_items[0]["author"]["is_founding_member"] is True

    @pytest.mark.asyncio
    async def test_public_user_profile_includes_founding_flag(self, api_client, founding_user, mongo_db):
        resp = api_client.get(f"{API}/users/{founding_user['user_id']}", headers={"Authorization": f"Bearer {founding_user['token']}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("is_founding_member") is True

    @pytest.mark.asyncio
    async def test_admin_users_lists_founding_member_flag(self, api_client, admin_token, founding_user):
        resp = api_client.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        items = resp.json()["items"]
        match = [it for it in items if it["user_id"] == founding_user["user_id"]]
        assert len(match) == 1
        assert match[0]["is_founding_member"] is True
        assert match[0]["tier"] == "premium"


class TestBillingRegression:
    """Confirm previous-session Stripe billing endpoints still respond as before."""

    def test_membership_endpoint_still_works(self, api_client, demo_token):
        resp = api_client.get(f"{API}/membership", headers={"Authorization": f"Bearer {demo_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "tier" in data
        assert "plans" in data
        assert len(data["plans"]) == 1
        assert data["plans"][0]["id"] == "monthly"

    def test_checkout_link_returns_url_or_503_if_unconfigured(self, api_client, demo_token):
        resp = api_client.post(f"{API}/billing/checkout-link", headers={"Authorization": f"Bearer {demo_token}"})
        assert resp.status_code in (200, 503)
        if resp.status_code == 200:
            assert "url" in resp.json()

    def test_billing_portal_no_customer_returns_400(self, api_client, demo_token):
        resp = api_client.post(f"{API}/billing/portal", headers={"Authorization": f"Bearer {demo_token}"})
        assert resp.status_code == 400
        assert "No subscription found" in resp.json().get("detail", "")

    def test_stripe_webhook_invalid_signature_returns_400(self, api_client):
        resp = api_client.post(f"{API}/stripe/webhook", data=b"{}", headers={"stripe-signature": "invalid"})
        assert resp.status_code == 400
