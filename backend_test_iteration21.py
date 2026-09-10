#!/usr/bin/env python3
"""
Iteration 21 Bug Fix Verification - Stripe Webhook URL Fix
Testing affected user reconciliation and webhook signature enforcement
"""

import requests
import json
from typing import Dict, Any

# Backend URL from frontend/.env
BASE_URL = "https://navy-social-platform.preview.emergentagent.com/api"

# Test credentials
AFFECTED_USER_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzA5ZjIxNTcwYTBmNyIsImVtYWlsIjoic2hhbmVsbGUxMjBAZ21haWwuY29tIiwiYXV0aF9wcm92aWRlciI6InBhc3N3b3JkIiwiaWF0IjoxNzg5MDc0NzkyLCJleHAiOjE3OTE2NjY3OTJ9.d3dKlqyKXiDCkAF76VLkVnsE3m697ggsG-Mh1jeDkOY"
DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"

class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.total = 0
    
    def add_pass(self, test_name: str, details: str = ""):
        self.total += 1
        self.passed.append(f"✅ {test_name}" + (f" - {details}" if details else ""))
        print(f"✅ PASS: {test_name}")
        if details:
            print(f"   {details}")
    
    def add_fail(self, test_name: str, reason: str):
        self.total += 1
        self.failed.append(f"❌ {test_name} - {reason}")
        print(f"❌ FAIL: {test_name}")
        print(f"   Reason: {reason}")
    
    def print_summary(self):
        print("\n" + "="*80)
        print("ITERATION 21 BUG FIX VERIFICATION SUMMARY")
        print("="*80)
        print(f"Total Tests: {self.total}")
        print(f"Passed: {len(self.passed)}")
        print(f"Failed: {len(self.failed)}")
        print()
        
        if self.failed:
            print("FAILED TESTS:")
            for fail in self.failed:
                print(f"  {fail}")
            print()
        
        if self.passed:
            print("PASSED TESTS:")
            for pass_test in self.passed:
                print(f"  {pass_test}")
        
        print("="*80)

results = TestResults()

def test_affected_user_membership():
    """
    TEST 1: AFFECTED USER RECONCILIATION CHECK
    Verify shanelle120@gmail.com account shows Premium tier with all features unlocked
    """
    print("\n" + "="*80)
    print("TEST 1: AFFECTED USER RECONCILIATION CHECK")
    print("="*80)
    
    headers = {
        "Authorization": f"Bearer {AFFECTED_USER_JWT}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(f"{BASE_URL}/membership", headers=headers, timeout=10)
        
        if response.status_code != 200:
            results.add_fail(
                "GET /api/membership (affected user)",
                f"Expected 200, got {response.status_code}. Response: {response.text[:200]}"
            )
            return
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Check tier
        if data.get("tier") != "premium":
            results.add_fail(
                "GET /api/membership - tier check",
                f"Expected tier='premium', got '{data.get('tier')}'"
            )
            return
        
        # Check subscription_status
        if data.get("subscription_status") != "trialing":
            results.add_fail(
                "GET /api/membership - subscription_status check",
                f"Expected subscription_status='trialing', got '{data.get('subscription_status')}'"
            )
            return
        
        # Check features array
        features = data.get("features", [])
        if not isinstance(features, list):
            results.add_fail(
                "GET /api/membership - features array",
                f"Expected features to be a list, got {type(features)}"
            )
            return
        
        # Expected features: single_mingle, accountability, trading_only
        expected_features = {"single_mingle", "accountability", "trading_only"}
        found_features = {}
        
        for feature in features:
            # Features use "key" field, not "id"
            feature_key = feature.get("key")
            if feature_key in expected_features:
                found_features[feature_key] = feature.get("unlocked", False)
        
        # Check all 3 features are present and unlocked
        missing_features = expected_features - set(found_features.keys())
        if missing_features:
            results.add_fail(
                "GET /api/membership - features presence",
                f"Missing features: {missing_features}. Found: {list(found_features.keys())}"
            )
            return
        
        locked_features = [fid for fid, unlocked in found_features.items() if not unlocked]
        if locked_features:
            results.add_fail(
                "GET /api/membership - features unlocked",
                f"Features still locked: {locked_features}"
            )
            return
        
        results.add_pass(
            "GET /api/membership (affected user)",
            f"tier=premium, subscription_status=trialing, all 3 features unlocked: {list(found_features.keys())}"
        )
        
    except Exception as e:
        results.add_fail("GET /api/membership (affected user)", f"Exception: {str(e)}")

def test_affected_user_auth_me():
    """
    TEST 2: AFFECTED USER AUTH/ME CHECK
    Verify GET /api/auth/me returns correct email and tier
    """
    print("\n" + "="*80)
    print("TEST 2: AFFECTED USER AUTH/ME CHECK")
    print("="*80)
    
    headers = {
        "Authorization": f"Bearer {AFFECTED_USER_JWT}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(f"{BASE_URL}/auth/me", headers=headers, timeout=10)
        
        if response.status_code != 200:
            results.add_fail(
                "GET /api/auth/me (affected user)",
                f"Expected 200, got {response.status_code}. Response: {response.text[:200]}"
            )
            return
        
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Check email
        if data.get("email") != "shanelle120@gmail.com":
            results.add_fail(
                "GET /api/auth/me - email check",
                f"Expected email='shanelle120@gmail.com', got '{data.get('email')}'"
            )
            return
        
        # Check tier
        if data.get("tier") != "premium":
            results.add_fail(
                "GET /api/auth/me - tier check",
                f"Expected tier='premium', got '{data.get('tier')}'"
            )
            return
        
        results.add_pass(
            "GET /api/auth/me (affected user)",
            f"email=shanelle120@gmail.com, tier=premium"
        )
        
    except Exception as e:
        results.add_fail("GET /api/auth/me (affected user)", f"Exception: {str(e)}")

def test_webhook_signature_enforcement():
    """
    TEST 3: WEBHOOK SIGNATURE REGRESSION CHECK
    Verify POST /api/stripe/webhook still enforces signature validation
    """
    print("\n" + "="*80)
    print("TEST 3: WEBHOOK SIGNATURE REGRESSION CHECK")
    print("="*80)
    
    # Test with no signature header
    payload = {"type": "checkout.session.completed", "data": {"object": {"id": "test"}}}
    
    try:
        response = requests.post(
            f"{BASE_URL}/stripe/webhook",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text[:200]}")
        
        if response.status_code != 400:
            results.add_fail(
                "POST /api/stripe/webhook (no signature)",
                f"Expected 400, got {response.status_code}. Signature validation may be broken!"
            )
            return
        
        # Check response message indicates signature issue
        response_text = response.text.lower()
        if "signature" not in response_text and "invalid" not in response_text:
            results.add_fail(
                "POST /api/stripe/webhook (signature message)",
                f"Expected error message about signature, got: {response.text[:200]}"
            )
            return
        
        results.add_pass(
            "POST /api/stripe/webhook (signature enforcement)",
            "Returns 400 with signature error message as expected"
        )
        
    except Exception as e:
        results.add_fail("POST /api/stripe/webhook (signature enforcement)", f"Exception: {str(e)}")

def test_demo_account_login():
    """
    TEST 4: GENERAL REGRESSION - Demo Account Login
    """
    print("\n" + "="*80)
    print("TEST 4: GENERAL REGRESSION - Demo Account Login")
    print("="*80)
    
    payload = {
        "email": DEMO_EMAIL,
        "password": DEMO_PASSWORD
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        if response.status_code != 200:
            results.add_fail(
                "POST /api/auth/login (demo account)",
                f"Expected 200, got {response.status_code}. Response: {response.text[:200]}"
            )
            return
        
        data = response.json()
        
        # Store token for next tests
        global demo_token
        demo_token = data.get("access_token")
        
        # Check tier in user object
        user = data.get("user", {})
        if user.get("tier") != "premium":
            results.add_fail(
                "POST /api/auth/login - tier check",
                f"Expected user.tier='premium', got '{user.get('tier')}'"
            )
            return
        
        if not demo_token:
            results.add_fail(
                "POST /api/auth/login - token check",
                "No access_token in response"
            )
            return
        
        results.add_pass(
            "POST /api/auth/login (demo account)",
            f"user.tier=premium, access_token received"
        )
        
    except Exception as e:
        results.add_fail("POST /api/auth/login (demo account)", f"Exception: {str(e)}")

def test_demo_account_posts():
    """
    TEST 5: GENERAL REGRESSION - Demo Account Posts Feed
    """
    print("\n" + "="*80)
    print("TEST 5: GENERAL REGRESSION - Demo Account Posts Feed")
    print("="*80)
    
    if not demo_token:
        results.add_fail("GET /api/posts (demo account)", "No demo token available (login failed)")
        return
    
    headers = {
        "Authorization": f"Bearer {demo_token}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(
            f"{BASE_URL}/posts?scope=all&limit=5",
            headers=headers,
            timeout=10
        )
        
        if response.status_code != 200:
            results.add_fail(
                "GET /api/posts (demo account)",
                f"Expected 200, got {response.status_code}. Response: {response.text[:200]}"
            )
            return
        
        data = response.json()
        
        # Posts endpoint returns paginated response with "posts" array
        if isinstance(data, dict):
            posts = data.get("posts", [])
        else:
            posts = data
        
        if not isinstance(posts, list):
            results.add_fail(
                "GET /api/posts - response format",
                f"Expected posts list, got {type(posts)}"
            )
            return
        
        results.add_pass(
            "GET /api/posts (demo account)",
            f"Returns 200 with {len(posts)} posts"
        )
        
    except Exception as e:
        results.add_fail("GET /api/posts (demo account)", f"Exception: {str(e)}")

def test_demo_account_membership():
    """
    TEST 6: GENERAL REGRESSION - Demo Account Membership
    """
    print("\n" + "="*80)
    print("TEST 6: GENERAL REGRESSION - Demo Account Membership")
    print("="*80)
    
    if not demo_token:
        results.add_fail("GET /api/membership (demo account)", "No demo token available (login failed)")
        return
    
    headers = {
        "Authorization": f"Bearer {demo_token}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.get(f"{BASE_URL}/membership", headers=headers, timeout=10)
        
        if response.status_code != 200:
            results.add_fail(
                "GET /api/membership (demo account)",
                f"Expected 200, got {response.status_code}. Response: {response.text[:200]}"
            )
            return
        
        data = response.json()
        
        # Check tier
        if data.get("tier") != "premium":
            results.add_fail(
                "GET /api/membership (demo) - tier check",
                f"Expected tier='premium', got '{data.get('tier')}'"
            )
            return
        
        # Check features array
        features = data.get("features", [])
        expected_features = {"single_mingle", "accountability", "trading_only"}
        found_features = {}
        
        for feature in features:
            # Features use "key" field, not "id"
            feature_key = feature.get("key")
            if feature_key in expected_features:
                found_features[feature_key] = feature.get("unlocked", False)
        
        locked_features = [fid for fid, unlocked in found_features.items() if not unlocked]
        if locked_features:
            results.add_fail(
                "GET /api/membership (demo) - features unlocked",
                f"Features locked: {locked_features}"
            )
            return
        
        results.add_pass(
            "GET /api/membership (demo account)",
            f"tier=premium, all 3 features unlocked"
        )
        
    except Exception as e:
        results.add_fail("GET /api/membership (demo account)", f"Exception: {str(e)}")

# Global variable for demo token
demo_token = None

if __name__ == "__main__":
    print("="*80)
    print("ITERATION 21 BUG FIX VERIFICATION")
    print("Stripe Webhook URL Fix - Affected User Reconciliation")
    print("="*80)
    print(f"Backend URL: {BASE_URL}")
    print()
    
    # Run tests in order
    test_affected_user_membership()
    test_affected_user_auth_me()
    test_webhook_signature_enforcement()
    test_demo_account_login()
    test_demo_account_posts()
    test_demo_account_membership()
    
    # Print summary
    results.print_summary()
    
    # Exit with appropriate code
    exit(0 if len(results.failed) == 0 else 1)
