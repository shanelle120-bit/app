"""
V1 Regression Test Suite for Level Up Trading Hub
Tests Auth, Feed/Posts, Profile/Users, Premium/Billing after dependency fix
"""
import uuid
import requests

# Backend URL from frontend/.env
BASE_URL = "https://navy-social-platform.preview.emergentagent.com"
API = f"{BASE_URL}/api"

# Test credentials from test_credentials.md
DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"

# Session for connection pooling
session = requests.Session()

# Test state
test_results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def log_pass(test_name):
    print(f"✅ PASS: {test_name}")
    test_results["passed"].append(test_name)

def log_fail(test_name, reason):
    print(f"❌ FAIL: {test_name} - {reason}")
    test_results["failed"].append(f"{test_name}: {reason}")

def log_warning(test_name, reason):
    print(f"⚠️  WARNING: {test_name} - {reason}")
    test_results["warnings"].append(f"{test_name}: {reason}")

# =============================================================================
# AUTH TESTS
# =============================================================================

def test_auth_signup():
    """Test POST /api/auth/signup with new unique email"""
    suffix = uuid.uuid4().hex[:8]
    email = f"test_{suffix}@leveluphub.com"
    payload = {
        "email": email,
        "password": "TestPass123!",
        "display_name": f"Test User {suffix}",
        "age_confirmed": True,
        "agreed_to_terms": True
    }
    
    try:
        r = session.post(f"{API}/auth/signup", json=payload, timeout=20)
        if r.status_code == 201:
            data = r.json()
            if "access_token" in data and "user" in data:
                if data["user"]["email"] == email:
                    log_pass("AUTH: Signup with new user")
                    return {"email": email, "password": payload["password"], "token": data["access_token"], "user": data["user"]}
                else:
                    log_fail("AUTH: Signup", f"Email mismatch: expected {email}, got {data['user'].get('email')}")
            else:
                log_fail("AUTH: Signup", f"Missing access_token or user in response: {data}")
        else:
            log_fail("AUTH: Signup", f"Expected 201, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("AUTH: Signup", f"Exception: {str(e)}")
    
    return None

def test_auth_login_demo():
    """Test POST /api/auth/login with demo credentials"""
    try:
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=20)
        if r.status_code == 200:
            data = r.json()
            if "access_token" in data and "user" in data:
                if data["user"].get("tier") == "premium" or (data["user"].get("membership") or {}).get("tier") == "premium":
                    log_pass("AUTH: Login demo (Premium account)")
                    return data["access_token"], data["user"]
                else:
                    log_warning("AUTH: Login demo", f"Demo account tier is not premium: {data['user'].get('membership')}")
                    return data["access_token"], data["user"]
            else:
                log_fail("AUTH: Login demo", f"Missing access_token or user: {data}")
        else:
            log_fail("AUTH: Login demo", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("AUTH: Login demo", f"Exception: {str(e)}")
    
    return None, None

def test_auth_login_wrong_password():
    """Test POST /api/auth/login with wrong password"""
    try:
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "WrongPassword123!"}, timeout=20)
        if r.status_code == 401:
            log_pass("AUTH: Login with wrong password (401)")
        else:
            log_fail("AUTH: Login wrong password", f"Expected 401, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("AUTH: Login wrong password", f"Exception: {str(e)}")

def test_auth_me(token):
    """Test GET /api/auth/me"""
    try:
        r = session.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if "user_id" in data and "email" in data:
                log_pass("AUTH: GET /me")
                return data
            else:
                log_fail("AUTH: GET /me", f"Missing user_id or email: {data}")
        else:
            log_fail("AUTH: GET /me", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("AUTH: GET /me", f"Exception: {str(e)}")
    
    return None

def test_auth_forgot_password(email):
    """Test POST /api/auth/forgot-password"""
    try:
        r = session.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=20)
        if r.status_code == 200:
            data = r.json()
            if "message" in data:
                if "dev_code" in data:
                    log_pass("AUTH: Forgot password (dev_code present)")
                else:
                    log_warning("AUTH: Forgot password", "No dev_code in response (expected in dev preview)")
            else:
                log_fail("AUTH: Forgot password", f"Missing message: {data}")
        else:
            log_fail("AUTH: Forgot password", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("AUTH: Forgot password", f"Exception: {str(e)}")

def test_auth_logout(token):
    """Test POST /api/auth/logout"""
    try:
        r = session.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if "message" in data:
                log_pass("AUTH: Logout")
            else:
                log_fail("AUTH: Logout", f"Missing message: {data}")
        else:
            log_fail("AUTH: Logout", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("AUTH: Logout", f"Exception: {str(e)}")

# =============================================================================
# FEED / POSTS TESTS
# =============================================================================

def test_posts_list(token):
    """Test GET /api/posts?scope=all&limit=15"""
    try:
        r = session.get(f"{API}/posts?scope=all&limit=15", headers={"Authorization": f"Bearer {token}"}, timeout=20)
        if r.status_code == 200:
            data = r.json()
            if "items" in data and isinstance(data["items"], list):
                # Check post structure
                if len(data["items"]) > 0:
                    post = data["items"][0]
                    required_fields = ["post_id", "author", "text", "likes_count", "comments_count", "reactions"]
                    missing = [f for f in required_fields if f not in post]
                    if not missing:
                        log_pass("POSTS: List posts (scope=all)")
                        return data["items"]
                    else:
                        log_fail("POSTS: List posts", f"Missing fields in post: {missing}")
                else:
                    log_warning("POSTS: List posts", "No posts returned (empty feed)")
                    log_pass("POSTS: List posts (empty feed)")
                    return []
            else:
                log_fail("POSTS: List posts", f"Missing or invalid 'items': {data}")
        else:
            log_fail("POSTS: List posts", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("POSTS: List posts", f"Exception: {str(e)}")
    
    return None

def test_posts_create(token):
    """Test POST /api/posts"""
    text = f"Test post from QA {uuid.uuid4().hex[:6]}"
    try:
        r = session.post(f"{API}/posts", headers={"Authorization": f"Bearer {token}"}, json={"text": text}, timeout=20)
        if r.status_code == 201:
            data = r.json()
            if "post_id" in data and data.get("text") == text:
                log_pass("POSTS: Create post")
                return data["post_id"]
            else:
                log_fail("POSTS: Create post", f"Missing post_id or text mismatch: {data}")
        else:
            log_fail("POSTS: Create post", f"Expected 201, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("POSTS: Create post", f"Exception: {str(e)}")
    
    return None

def test_posts_like(token, post_id):
    """Test POST /api/posts/{post_id}/like"""
    try:
        # Like
        r = session.post(f"{API}/posts/{post_id}/like", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if "liked" in data and "likes_count" in data:
                if data["liked"]:
                    log_pass("POSTS: Like post (toggle on)")
                    # Unlike to restore state
                    r2 = session.post(f"{API}/posts/{post_id}/like", headers={"Authorization": f"Bearer {token}"}, timeout=15)
                    if r2.status_code == 200 and not r2.json().get("liked"):
                        log_pass("POSTS: Unlike post (toggle off)")
                    else:
                        log_warning("POSTS: Unlike", f"Toggle off failed: {r2.status_code} {r2.text}")
                else:
                    log_fail("POSTS: Like", "Expected liked=true after first toggle")
            else:
                log_fail("POSTS: Like", f"Missing liked or likes_count: {data}")
        else:
            log_fail("POSTS: Like", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("POSTS: Like", f"Exception: {str(e)}")

def test_posts_react(token, post_id):
    """Test POST /api/posts/{post_id}/react"""
    try:
        # React with fire emoji
        r = session.post(f"{API}/posts/{post_id}/react", headers={"Authorization": f"Bearer {token}"}, 
                        json={"reaction": "🔥"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if "my_reaction" in data and data["my_reaction"] == "🔥":
                log_pass("POSTS: React with 🔥")
                # Remove reaction to clean up
                r2 = session.post(f"{API}/posts/{post_id}/react", headers={"Authorization": f"Bearer {token}"}, 
                                json={"reaction": None}, timeout=15)
                if r2.status_code == 200 and r2.json().get("my_reaction") is None:
                    log_pass("POSTS: Remove reaction")
                else:
                    log_warning("POSTS: Remove reaction", f"Failed: {r2.status_code} {r2.text}")
            else:
                log_fail("POSTS: React", f"my_reaction not updated: {data}")
        else:
            log_fail("POSTS: React", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("POSTS: React", f"Exception: {str(e)}")

def test_posts_comment(token, post_id):
    """Test POST /api/posts/{post_id}/comments"""
    comment_text = f"Test comment {uuid.uuid4().hex[:6]}"
    try:
        r = session.post(f"{API}/posts/{post_id}/comments", headers={"Authorization": f"Bearer {token}"}, 
                        json={"text": comment_text}, timeout=20)
        if r.status_code == 201:
            data = r.json()
            if "comment_id" in data and data.get("text") == comment_text:
                log_pass("POSTS: Create comment")
                return data["comment_id"]
            else:
                log_fail("POSTS: Create comment", f"Missing comment_id or text mismatch: {data}")
        else:
            log_fail("POSTS: Create comment", f"Expected 201, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("POSTS: Create comment", f"Exception: {str(e)}")
    
    return None

def test_posts_get_detail(token, post_id):
    """Test GET /api/posts/{post_id}"""
    try:
        r = session.get(f"{API}/posts/{post_id}", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if data.get("post_id") == post_id:
                log_pass("POSTS: Get post detail")
                return data
            else:
                log_fail("POSTS: Get detail", f"post_id mismatch: {data}")
        else:
            log_fail("POSTS: Get detail", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("POSTS: Get detail", f"Exception: {str(e)}")
    
    return None

def test_posts_get_comments(token, post_id):
    """Test GET /api/posts/{post_id}/comments"""
    try:
        r = session.get(f"{API}/posts/{post_id}/comments", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                log_pass("POSTS: Get comments")
                return data
            else:
                log_fail("POSTS: Get comments", f"Expected list, got: {type(data)}")
        else:
            log_fail("POSTS: Get comments", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("POSTS: Get comments", f"Exception: {str(e)}")
    
    return None

def test_posts_delete(token, post_id):
    """Test DELETE /api/posts/{post_id}"""
    try:
        r = session.delete(f"{API}/posts/{post_id}", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if data.get("deleted"):
                log_pass("POSTS: Delete post")
            else:
                log_fail("POSTS: Delete", f"deleted not true: {data}")
        else:
            log_fail("POSTS: Delete", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("POSTS: Delete", f"Exception: {str(e)}")

# =============================================================================
# PROFILE / USERS TESTS
# =============================================================================

def test_users_get_profile(token, user_id):
    """Test GET /api/users/{user_id}"""
    try:
        r = session.get(f"{API}/users/{user_id}", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            required_fields = ["user_id", "display_name", "username", "followers_count", "following_count"]
            missing = [f for f in required_fields if f not in data]
            if not missing:
                log_pass("USERS: Get user profile")
                return data
            else:
                log_fail("USERS: Get profile", f"Missing fields: {missing}")
        else:
            log_fail("USERS: Get profile", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("USERS: Get profile", f"Exception: {str(e)}")
    
    return None

def test_users_get_posts(token, user_id):
    """Test GET /api/users/{user_id}/posts?tab=posts"""
    try:
        r = session.get(f"{API}/users/{user_id}/posts?tab=posts", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                log_pass("USERS: Get user posts")
                return data
            else:
                log_fail("USERS: Get posts", f"Expected list, got: {type(data)}")
        else:
            log_fail("USERS: Get posts", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("USERS: Get posts", f"Exception: {str(e)}")
    
    return None

def test_users_update_profile(token):
    """Test PUT /api/me (profile update)"""
    new_bio = f"Test bio {uuid.uuid4().hex[:6]}"
    try:
        r = session.put(f"{API}/me", headers={"Authorization": f"Bearer {token}"}, 
                       json={"bio": new_bio}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if data.get("bio") == new_bio:
                log_pass("USERS: Update profile (bio)")
            else:
                log_fail("USERS: Update profile", f"Bio not updated: {data.get('bio')}")
        else:
            log_fail("USERS: Update profile", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("USERS: Update profile", f"Exception: {str(e)}")

def test_users_followers(token, user_id):
    """Test GET /api/users/{user_id}/followers"""
    try:
        r = session.get(f"{API}/users/{user_id}/followers", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                log_pass("USERS: Get followers")
                return data
            else:
                log_fail("USERS: Get followers", f"Expected list, got: {type(data)}")
        else:
            log_fail("USERS: Get followers", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("USERS: Get followers", f"Exception: {str(e)}")
    
    return None

def test_users_following(token, user_id):
    """Test GET /api/users/{user_id}/following"""
    try:
        r = session.get(f"{API}/users/{user_id}/following", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                log_pass("USERS: Get following")
                return data
            else:
                log_fail("USERS: Get following", f"Expected list, got: {type(data)}")
        else:
            log_fail("USERS: Get following", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("USERS: Get following", f"Exception: {str(e)}")
    
    return None

# =============================================================================
# PREMIUM / BILLING TESTS
# =============================================================================

def test_membership_get(token):
    """Test GET /api/membership"""
    try:
        r = session.get(f"{API}/membership", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            required_fields = ["tier", "plans", "features"]
            missing = [f for f in required_fields if f not in data]
            if not missing:
                log_pass("BILLING: Get membership")
                return data
            else:
                log_fail("BILLING: Get membership", f"Missing fields: {missing}")
        else:
            log_fail("BILLING: Get membership", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("BILLING: Get membership", f"Exception: {str(e)}")
    
    return None

def test_billing_checkout_link(token):
    """Test POST /api/billing/checkout-link (for free-tier user)"""
    try:
        r = session.post(f"{API}/billing/checkout-link", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 200:
            data = r.json()
            if "url" in data and "client_reference_id" in data["url"] and "prefilled_email" in data["url"]:
                log_pass("BILLING: Checkout link (URL with params)")
            else:
                log_fail("BILLING: Checkout link", f"Missing url or params: {data}")
        else:
            log_fail("BILLING: Checkout link", f"Expected 200, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("BILLING: Checkout link", f"Exception: {str(e)}")

def test_billing_portal_no_subscription(token):
    """Test POST /api/billing/portal (for user without stripe_customer_id)"""
    try:
        r = session.post(f"{API}/billing/portal", headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 400:
            data = r.json()
            if "No subscription" in data.get("detail", ""):
                log_pass("BILLING: Portal without subscription (400 expected)")
            else:
                log_fail("BILLING: Portal", f"Expected 'No subscription' message, got: {data}")
        elif r.status_code == 200:
            # User might have a stripe_customer_id from previous tests
            log_warning("BILLING: Portal", "User has stripe_customer_id (200 OK)")
        else:
            log_fail("BILLING: Portal", f"Expected 400, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("BILLING: Portal", f"Exception: {str(e)}")

def test_stripe_webhook_invalid_signature():
    """Test POST /api/stripe/webhook with invalid signature"""
    try:
        r = session.post(f"{API}/stripe/webhook", 
                        data='{"type": "test"}',
                        headers={"stripe-signature": "invalid"},
                        timeout=15)
        if r.status_code == 400:
            data = r.json()
            if "signature" in data.get("detail", "").lower():
                log_pass("BILLING: Webhook invalid signature (400)")
            else:
                log_fail("BILLING: Webhook", f"Expected signature error, got: {data}")
        else:
            log_fail("BILLING: Webhook", f"Expected 400, got {r.status_code}: {r.text}")
    except Exception as e:
        log_fail("BILLING: Webhook", f"Exception: {str(e)}")

# =============================================================================
# MAIN TEST RUNNER
# =============================================================================

def run_all_tests():
    print("\n" + "="*80)
    print("Level Up Trading Hub - V1 Backend Regression Test Suite")
    print("Testing: Auth, Feed/Posts, Profile/Users, Premium/Billing")
    print("="*80 + "\n")
    
    # AUTH TESTS
    print("\n--- AUTH TESTS ---")
    new_user = test_auth_signup()
    demo_token, demo_user = test_auth_login_demo()
    test_auth_login_wrong_password()
    
    if demo_token:
        demo_user_data = test_auth_me(demo_token)
        test_auth_forgot_password(DEMO_EMAIL)
        # Don't logout demo yet, we need it for other tests
    
    # FEED / POSTS TESTS
    print("\n--- FEED / POSTS TESTS ---")
    if demo_token:
        posts = test_posts_list(demo_token)
        test_post_id = test_posts_create(demo_token)
        
        if test_post_id:
            test_posts_like(demo_token, test_post_id)
            test_posts_react(demo_token, test_post_id)
            test_posts_comment(demo_token, test_post_id)
            test_posts_get_detail(demo_token, test_post_id)
            test_posts_get_comments(demo_token, test_post_id)
            test_posts_delete(demo_token, test_post_id)
    
    # PROFILE / USERS TESTS
    print("\n--- PROFILE / USERS TESTS ---")
    if demo_token and demo_user:
        user_id = demo_user.get("user_id")
        if user_id:
            test_users_get_profile(demo_token, user_id)
            test_users_get_posts(demo_token, user_id)
            test_users_followers(demo_token, user_id)
            test_users_following(demo_token, user_id)
        
        # Use new_user token for profile update to avoid modifying demo
        if new_user and new_user.get("token"):
            test_users_update_profile(new_user["token"])
    
    # PREMIUM / BILLING TESTS
    print("\n--- PREMIUM / BILLING TESTS ---")
    if demo_token:
        membership = test_membership_get(demo_token)
        
        # Test checkout-link with new_user (free tier)
        if new_user and new_user.get("token"):
            test_billing_checkout_link(new_user["token"])
            test_billing_portal_no_subscription(new_user["token"])
        
        # Test webhook signature validation
        test_stripe_webhook_invalid_signature()
    
    # Logout demo at the end
    if demo_token:
        test_auth_logout(demo_token)
    
    # SUMMARY
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"✅ PASSED: {len(test_results['passed'])}")
    print(f"❌ FAILED: {len(test_results['failed'])}")
    print(f"⚠️  WARNINGS: {len(test_results['warnings'])}")
    
    if test_results['failed']:
        print("\n--- FAILED TESTS ---")
        for failure in test_results['failed']:
            print(f"  ❌ {failure}")
    
    if test_results['warnings']:
        print("\n--- WARNINGS ---")
        for warning in test_results['warnings']:
            print(f"  ⚠️  {warning}")
    
    print("\n" + "="*80)
    
    return len(test_results['failed']) == 0

if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
