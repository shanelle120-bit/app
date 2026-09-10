#!/usr/bin/env python3
"""
Admin Panel Backend Test Suite - Iteration 23
Tests all 14 numbered items from the review request.
"""
import requests
import time
import json

# Configuration
BACKEND_URL = "https://navy-social-platform.preview.emergentagent.com/api"
ADMIN_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzA5ZjIxNTcwYTBmNyIsImVtYWlsIjoic2hhbmVsbGUxMjBAZ21haWwuY29tIiwiYXV0aF9wcm92aWRlciI6InBhc3N3b3JkIiwiaWF0IjoxNzg5MDc4NDA1LCJleHAiOjE3OTE2NzA0MDV9.e3Xv3l_54KvtSAlUjiLCtahZpu88pbVDzjU5H6R6-fc"

# Test state
test_results = []
test_user_id = None
test_user_email = None
test_user_password = None
test_user_token = None
test_post_id = None
test_report_id = None
test_announcement_id = None

def log_test(test_num, description, passed, details=""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = f"{test_num}. {status}: {description}"
    if details:
        result += f"\n   Details: {details}"
    test_results.append((test_num, passed, description, details))
    print(result)

def create_test_user():
    """Create a throwaway test user for destructive actions"""
    global test_user_id, test_user_email, test_user_password, test_user_token
    
    timestamp = int(time.time() * 1000)
    test_user_email = f"admin_test_user_{timestamp}@test.com"
    test_user_password = "TestPass123!"
    
    response = requests.post(
        f"{BACKEND_URL}/auth/signup",
        json={
            "email": test_user_email,
            "password": test_user_password,
            "display_name": "Admin Test User",
            "age_confirmed": True,
            "agreed_to_terms": True
        }
    )
    
    if response.status_code == 201:
        data = response.json()
        test_user_id = data["user"]["user_id"]
        test_user_token = data["access_token"]
        print(f"✅ Created test user: {test_user_email} (ID: {test_user_id})")
        return True
    else:
        print(f"❌ Failed to create test user: {response.status_code} - {response.text}")
        return False

def test_1_admin_dashboard():
    """Test 1: GET /api/admin/dashboard (as admin) → 200 with stats"""
    response = requests.get(
        f"{BACKEND_URL}/admin/dashboard",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        required_fields = [
            "total_users", "active_users", "new_signups_7d", "free_users",
            "premium_users", "trial_users", "complimentary_premium_users",
            "founding_members", "suspended_users", "banned_users", "open_reports"
        ]
        
        missing_fields = [f for f in required_fields if f not in data]
        if missing_fields:
            log_test(1, "GET /api/admin/dashboard", False, f"Missing fields: {missing_fields}")
        elif data["active_users"] > 0:
            log_test(1, "GET /api/admin/dashboard", True, f"active_users={data['active_users']}, total_users={data['total_users']}")
        else:
            log_test(1, "GET /api/admin/dashboard", False, "active_users should be > 0")
    else:
        log_test(1, "GET /api/admin/dashboard", False, f"Status {response.status_code}: {response.text}")

def test_2_admin_users_search():
    """Test 2: GET /api/admin/users?q=<search> (as admin) → 200, filtered list"""
    # Search for demo user
    response = requests.get(
        f"{BACKEND_URL}/admin/users?q=demo",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        if "items" in data and len(data["items"]) > 0:
            log_test(2, "GET /api/admin/users?q=demo", True, f"Found {len(data['items'])} users")
        else:
            log_test(2, "GET /api/admin/users?q=demo", False, "No users found in search")
    else:
        log_test(2, "GET /api/admin/users?q=demo", False, f"Status {response.status_code}: {response.text}")

def test_3_non_admin_dashboard():
    """Test 3: GET /api/admin/dashboard (as non-admin) → 403"""
    response = requests.get(
        f"{BACKEND_URL}/admin/dashboard",
        headers={"Authorization": f"Bearer {test_user_token}"}
    )
    
    if response.status_code == 403:
        log_test(3, "GET /api/admin/dashboard (non-admin)", True, "Correctly returned 403")
    else:
        log_test(3, "GET /api/admin/dashboard (non-admin)", False, f"Expected 403, got {response.status_code}")

def test_4_admin_user_detail():
    """Test 4: GET /api/admin/users/{user_id} → 200 with full detail"""
    response = requests.get(
        f"{BACKEND_URL}/admin/users/{test_user_id}",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        required_fields = ["user_id", "email", "account_status", "membership", "notes", "history", "safety"]
        missing_fields = [f for f in required_fields if f not in data]
        
        if missing_fields:
            log_test(4, "GET /api/admin/users/{user_id}", False, f"Missing fields: {missing_fields}")
        elif data["account_status"] == "active":
            log_test(4, "GET /api/admin/users/{user_id}", True, f"account_status=active, email={data['email']}")
        else:
            log_test(4, "GET /api/admin/users/{user_id}", False, f"Unexpected account_status: {data['account_status']}")
    else:
        log_test(4, "GET /api/admin/users/{user_id}", False, f"Status {response.status_code}: {response.text}")

def test_5_account_status_suspend_restore():
    """Test 5: Suspend user, verify login blocked, then restore and verify login works"""
    global test_user_token
    
    # Step 5a: Suspend the test user
    response = requests.post(
        f"{BACKEND_URL}/admin/users/{test_user_id}/account-status",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"status": "suspended", "reason": "QA test"}
    )
    
    if response.status_code != 200:
        log_test(5, "Account status (suspend/restore)", False, f"Suspend failed: {response.status_code} - {response.text}")
        return
    
    # Step 5b: Verify existing token gets 403 on /api/auth/me
    response = requests.get(
        f"{BACKEND_URL}/auth/me",
        headers={"Authorization": f"Bearer {test_user_token}"}
    )
    
    if response.status_code != 403:
        log_test(5, "Account status (suspend/restore)", False, f"Expected 403 for suspended user, got {response.status_code}")
        return
    
    # Step 5c: Verify fresh login attempt also gets 403
    response = requests.post(
        f"{BACKEND_URL}/auth/login",
        json={"email": test_user_email, "password": test_user_password}
    )
    
    if response.status_code != 403:
        log_test(5, "Account status (suspend/restore)", False, f"Expected 403 for login attempt, got {response.status_code}")
        return
    
    # Step 5d: Restore the account
    response = requests.post(
        f"{BACKEND_URL}/admin/users/{test_user_id}/account-status",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"status": "active", "reason": "QA resolved"}
    )
    
    if response.status_code != 200:
        log_test(5, "Account status (suspend/restore)", False, f"Restore failed: {response.status_code} - {response.text}")
        return
    
    # Step 5e: Verify login works again
    response = requests.post(
        f"{BACKEND_URL}/auth/login",
        json={"email": test_user_email, "password": test_user_password}
    )
    
    if response.status_code == 200:
        # Update test_user_token with new token
        data = response.json()
        if "access_token" in data:
            test_user_token = data["access_token"]
            log_test(5, "Account status (suspend/restore)", True, "Suspend blocked login, restore allowed login")
        else:
            log_test(5, "Account status (suspend/restore)", False, "Login succeeded but no access_token in response")
    else:
        log_test(5, "Account status (suspend/restore)", False, f"Login after restore failed: {response.status_code}")

def test_6_admin_role_grant_revoke():
    """Test 6: Grant/revoke admin role + self-lockout guard"""
    # Step 6a: Grant admin role to test user
    response = requests.post(
        f"{BACKEND_URL}/admin/users/{test_user_id}/admin-role",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"grant": True, "reason": "QA test"}
    )
    
    if response.status_code != 200 or not response.json().get("is_admin"):
        log_test(6, "Admin role (grant/revoke/self-lockout)", False, f"Grant failed: {response.status_code} - {response.text}")
        return
    
    # Step 6b: Revoke admin role from test user
    response = requests.post(
        f"{BACKEND_URL}/admin/users/{test_user_id}/admin-role",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"grant": False, "reason": "QA test"}
    )
    
    if response.status_code != 200 or response.json().get("is_admin"):
        log_test(6, "Admin role (grant/revoke/self-lockout)", False, f"Revoke failed: {response.status_code} - {response.text}")
        return
    
    # Step 6c: Try to revoke admin's own admin role (should fail with 400)
    response = requests.post(
        f"{BACKEND_URL}/admin/users/user_09f21570a0f7/admin-role",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"grant": False, "reason": "QA test"}
    )
    
    if response.status_code == 400:
        log_test(6, "Admin role (grant/revoke/self-lockout)", True, "Grant/revoke worked, self-lockout guard prevented self-revoke")
    else:
        log_test(6, "Admin role (grant/revoke/self-lockout)", False, f"Self-lockout guard failed: expected 400, got {response.status_code}")

def test_7_premium_grant_revoke():
    """Test 7: Grant founding premium, verify membership, then revoke"""
    # Step 7a: Grant founding premium
    response = requests.post(
        f"{BACKEND_URL}/admin/users/{test_user_id}/premium-grant",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"plan": "founding", "reason": "QA test"}
    )
    
    if response.status_code != 200:
        log_test(7, "Premium grant/revoke (founding)", False, f"Grant failed: {response.status_code} - {response.text}")
        return
    
    # Step 7b: Verify membership as that user
    response = requests.get(
        f"{BACKEND_URL}/membership",
        headers={"Authorization": f"Bearer {test_user_token}"}
    )
    
    if response.status_code != 200:
        log_test(7, "Premium grant/revoke (founding)", False, f"Membership check failed: {response.status_code}")
        return
    
    data = response.json()
    if data.get("tier") != "premium":
        log_test(7, "Premium grant/revoke (founding)", False, f"Expected tier=premium, got {data.get('tier')}")
        return
    
    # Check if all 3 features are unlocked
    features = data.get("features", [])
    required_features = ["single_mingle", "accountability", "trading_only"]
    unlocked_features = [f["key"] for f in features if f.get("unlocked")]
    
    if not all(f in unlocked_features for f in required_features):
        log_test(7, "Premium grant/revoke (founding)", False, f"Not all features unlocked: {unlocked_features}")
        return
    
    # Step 7c: Revoke premium
    response = requests.post(
        f"{BACKEND_URL}/admin/users/{test_user_id}/premium-revoke",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"reason": "QA test", "revoke_founding": True}
    )
    
    if response.status_code != 200:
        log_test(7, "Premium grant/revoke (founding)", False, f"Revoke failed: {response.status_code} - {response.text}")
        return
    
    # Step 7d: Verify tier back to free
    response = requests.get(
        f"{BACKEND_URL}/membership",
        headers={"Authorization": f"Bearer {test_user_token}"}
    )
    
    if response.status_code == 200 and response.json().get("tier") == "free":
        log_test(7, "Premium grant/revoke (founding)", True, "Granted founding premium, all features unlocked, revoked back to free")
    else:
        log_test(7, "Premium grant/revoke (founding)", False, f"Tier not back to free: {response.json().get('tier')}")

def test_8_admin_notes():
    """Test 8: Add admin note and verify it shows up in user detail"""
    # Step 8a: Add note
    response = requests.post(
        f"{BACKEND_URL}/admin/users/{test_user_id}/notes",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"text": "QA note"}
    )
    
    if response.status_code != 201:
        log_test(8, "Admin notes", False, f"Add note failed: {response.status_code} - {response.text}")
        return
    
    # Step 8b: Verify note in user detail
    response = requests.get(
        f"{BACKEND_URL}/admin/users/{test_user_id}",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        notes = data.get("notes", [])
        if any(n.get("text") == "QA note" for n in notes):
            log_test(8, "Admin notes", True, "Note added and visible in user detail")
        else:
            log_test(8, "Admin notes", False, f"Note not found in user detail. Notes: {notes}")
    else:
        log_test(8, "Admin notes", False, f"User detail check failed: {response.status_code}")

def test_9_warn_user():
    """Test 9: Warn user"""
    response = requests.post(
        f"{BACKEND_URL}/admin/users/{test_user_id}/warn",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"message": "test warning", "reason": "QA test"}
    )
    
    if response.status_code == 200 and response.json().get("warned"):
        log_test(9, "Warn user", True, "User warned successfully")
    else:
        log_test(9, "Warn user", False, f"Status {response.status_code}: {response.text}")

def test_10_reports_flow():
    """Test 10: Create report, list reports, resolve report"""
    global test_post_id, test_report_id
    
    # Step 10a: Create a test post as test user
    response = requests.post(
        f"{BACKEND_URL}/posts",
        headers={"Authorization": f"Bearer {test_user_token}"},
        json={"text": "Test post for reporting"}
    )
    
    if response.status_code != 201:
        log_test(10, "Reports flow (create/list/resolve)", False, f"Post creation failed: {response.status_code}")
        return
    
    test_post_id = response.json()["post_id"]
    
    # Step 10b: Report the post as test user (reporting own post for simplicity)
    # Actually, let's get demo user's post instead
    response = requests.get(
        f"{BACKEND_URL}/posts?scope=all&limit=5",
        headers={"Authorization": f"Bearer {test_user_token}"}
    )
    
    if response.status_code == 200:
        posts = response.json().get("posts", [])
        # Find a post that's not from test user
        other_post = next((p for p in posts if p["author"]["user_id"] != test_user_id), None)
        if other_post:
            target_post_id = other_post["post_id"]
        else:
            # Use our own post if no other posts found
            target_post_id = test_post_id
    else:
        target_post_id = test_post_id
    
    # Step 10c: Create report
    response = requests.post(
        f"{BACKEND_URL}/reports",
        headers={"Authorization": f"Bearer {test_user_token}"},
        json={
            "target_type": "post",
            "target_id": target_post_id,
            "reason": "Spam",
            "details": "qa"
        }
    )
    
    if response.status_code != 201:
        log_test(10, "Reports flow (create/list/resolve)", False, f"Report creation failed: {response.status_code}")
        return
    
    test_report_id = response.json()["report_id"]
    
    # Step 10d: List open reports as admin
    response = requests.get(
        f"{BACKEND_URL}/admin/reports?status=open",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
    )
    
    if response.status_code != 200:
        log_test(10, "Reports flow (create/list/resolve)", False, f"List reports failed: {response.status_code}")
        return
    
    data = response.json()
    reports = data.get("items", [])
    our_report = next((r for r in reports if r["report_id"] == test_report_id), None)
    
    if not our_report:
        log_test(10, "Reports flow (create/list/resolve)", False, "Report not found in admin queue")
        return
    
    # Verify report has reporter info and content preview
    if not our_report.get("reporter") or not our_report.get("content"):
        log_test(10, "Reports flow (create/list/resolve)", False, "Report missing reporter or content preview")
        return
    
    # Step 10e: Resolve report
    response = requests.post(
        f"{BACKEND_URL}/admin/reports/{test_report_id}/resolve",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"action": "dismiss", "note": "qa done"}
    )
    
    if response.status_code == 200 and response.json().get("status") == "resolved":
        log_test(10, "Reports flow (create/list/resolve)", True, "Report created, listed with details, and resolved")
    else:
        log_test(10, "Reports flow (create/list/resolve)", False, f"Resolve failed: {response.status_code}")

def test_11_post_remove_restore():
    """Test 11: Remove post, verify 404, then restore"""
    # Use the test post created in test 10
    if not test_post_id:
        log_test(11, "Post remove/restore", False, "No test post available")
        return
    
    # Step 11a: Remove post
    response = requests.post(
        f"{BACKEND_URL}/admin/posts/{test_post_id}/remove",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"reason": "QA test"}
    )
    
    if response.status_code != 200:
        log_test(11, "Post remove/restore", False, f"Remove failed: {response.status_code} - {response.text}")
        return
    
    # Step 11b: Verify post returns 404
    response = requests.get(
        f"{BACKEND_URL}/posts/{test_post_id}",
        headers={"Authorization": f"Bearer {test_user_token}"}
    )
    
    if response.status_code != 404:
        log_test(11, "Post remove/restore", False, f"Expected 404 for removed post, got {response.status_code}")
        return
    
    # Step 11c: Restore post
    response = requests.post(
        f"{BACKEND_URL}/admin/posts/{test_post_id}/restore",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"reason": "QA test"}
    )
    
    if response.status_code != 200:
        log_test(11, "Post remove/restore", False, f"Restore failed: {response.status_code} - {response.text}")
        return
    
    # Step 11d: Verify post accessible again
    response = requests.get(
        f"{BACKEND_URL}/posts/{test_post_id}",
        headers={"Authorization": f"Bearer {test_user_token}"}
    )
    
    if response.status_code == 200:
        log_test(11, "Post remove/restore", True, "Post removed (404), then restored (accessible)")
    else:
        log_test(11, "Post remove/restore", False, f"Post not accessible after restore: {response.status_code}")

def test_12_audit_log():
    """Test 12: GET /api/admin/audit-log → 200 with entries"""
    response = requests.get(
        f"{BACKEND_URL}/admin/audit-log",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        items = data.get("items", [])
        
        if len(items) == 0:
            log_test(12, "Audit log", False, "No audit log entries found")
            return
        
        # Check if entries have required fields
        sample = items[0]
        required_fields = ["action", "admin_name", "created_at"]
        missing_fields = [f for f in required_fields if f not in sample]
        
        if missing_fields:
            log_test(12, "Audit log", False, f"Missing fields in audit entry: {missing_fields}")
        else:
            # Look for some of our test actions
            actions = [item.get("action") for item in items]
            expected_actions = ["suspended", "premium_grant_founding", "add_note", "warn_user"]
            found_actions = [a for a in expected_actions if a in actions]
            
            log_test(12, "Audit log", True, f"Found {len(items)} entries, including actions: {found_actions}")
    else:
        log_test(12, "Audit log", False, f"Status {response.status_code}: {response.text}")

def test_13_announcements():
    """Test 13: Create announcement, verify active, then unpin"""
    global test_announcement_id
    
    # Step 13a: Create announcement
    response = requests.post(
        f"{BACKEND_URL}/admin/announcements",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"title": "QA Test", "body": "QA body"}
    )
    
    if response.status_code != 201:
        log_test(13, "Announcements (create/active/unpin)", False, f"Create failed: {response.status_code} - {response.text}")
        return
    
    test_announcement_id = response.json()["announcement_id"]
    
    # Step 13b: Get active announcement (as any authenticated user)
    response = requests.get(
        f"{BACKEND_URL}/announcements/active",
        headers={"Authorization": f"Bearer {test_user_token}"}
    )
    
    if response.status_code != 200:
        log_test(13, "Announcements (create/active/unpin)", False, f"Get active failed: {response.status_code}")
        return
    
    data = response.json()
    if not data or data.get("announcement_id") != test_announcement_id:
        log_test(13, "Announcements (create/active/unpin)", False, f"Active announcement not found or wrong ID: {data}")
        return
    
    # Step 13c: Unpin announcement
    response = requests.post(
        f"{BACKEND_URL}/admin/announcements/{test_announcement_id}/unpin",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"}
    )
    
    if response.status_code != 200:
        log_test(13, "Announcements (create/active/unpin)", False, f"Unpin failed: {response.status_code}")
        return
    
    # Step 13d: Verify no active announcement
    response = requests.get(
        f"{BACKEND_URL}/announcements/active",
        headers={"Authorization": f"Bearer {test_user_token}"}
    )
    
    if response.status_code == 200:
        data = response.json()
        if data is None:
            log_test(13, "Announcements (create/active/unpin)", True, "Announcement created, retrieved, and unpinned")
        else:
            log_test(13, "Announcements (create/active/unpin)", False, f"Expected null after unpin, got: {data}")
    else:
        log_test(13, "Announcements (create/active/unpin)", False, f"Get active after unpin failed: {response.status_code}")

def test_14_delete_account():
    """Test 14: Delete test user account"""
    response = requests.post(
        f"{BACKEND_URL}/admin/users/{test_user_id}/delete-account",
        headers={"Authorization": f"Bearer {ADMIN_TOKEN}"},
        json={"reason": "QA cleanup"}
    )
    
    if response.status_code == 200 and response.json().get("deleted"):
        log_test(14, "Delete account", True, "Test user account deleted")
    else:
        log_test(14, "Delete account", False, f"Status {response.status_code}: {response.text}")

def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("ADMIN PANEL BACKEND TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, p, _, _ in test_results if p)
    failed = sum(1 for _, p, _, _ in test_results if not p)
    total = len(test_results)
    
    print(f"\nTotal: {total} tests")
    print(f"✅ Passed: {passed}")
    print(f"❌ Failed: {failed}")
    
    if failed > 0:
        print("\n❌ FAILED TESTS:")
        for num, passed, desc, details in test_results:
            if not passed:
                print(f"  {num}. {desc}")
                if details:
                    print(f"     {details}")
    
    print("\n" + "="*80)

def main():
    print("="*80)
    print("ADMIN PANEL BACKEND TEST - Iteration 23")
    print("="*80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Admin Token: {ADMIN_TOKEN[:50]}...")
    print("="*80 + "\n")
    
    # Create test user first
    if not create_test_user():
        print("❌ Failed to create test user. Aborting tests.")
        return
    
    print("\nStarting tests...\n")
    
    # Run all tests in order
    test_1_admin_dashboard()
    test_2_admin_users_search()
    test_3_non_admin_dashboard()
    test_4_admin_user_detail()
    test_5_account_status_suspend_restore()
    test_6_admin_role_grant_revoke()
    test_7_premium_grant_revoke()
    test_8_admin_notes()
    test_9_warn_user()
    test_10_reports_flow()
    test_11_post_remove_restore()
    test_12_audit_log()
    test_13_announcements()
    test_14_delete_account()
    
    # Print summary
    print_summary()

if __name__ == "__main__":
    main()
