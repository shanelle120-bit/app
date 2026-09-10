#!/usr/bin/env python3
"""
Scoped regression check for Trading Only backend after frontend-only header copy change.
Tests space isolation and premium gating.
"""
import requests
import sys
from datetime import datetime

# Backend URL from frontend/.env
BACKEND_URL = "https://navy-social-platform.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def test_trading_only_regression():
    """
    Scoped regression check:
    1. POST /api/posts with space=trading (as demo, Premium) → expect 201
    2. GET /api/posts?scope=all&limit=20 (main feed, as demo) → trading post should NOT appear
    3. GET /api/posts?space=trading&limit=20 (as demo) → trading post SHOULD appear
    4. DELETE the post to clean up
    5. Sign up a new FREE user → try GET /api/posts?space=trading → expect 402
    6. As free user, try POST /api/posts with space=trading → expect 402
    """
    
    results = {
        "passed": [],
        "failed": []
    }
    
    # ========== STEP 0: Login as demo (Premium) ==========
    log("STEP 0: Login as demo@leveluphub.com (Premium account)")
    resp = requests.post(f"{BACKEND_URL}/auth/login", json={
        "email": DEMO_EMAIL,
        "password": DEMO_PASSWORD
    })
    if resp.status_code != 200:
        log(f"❌ CRITICAL: Demo login failed with {resp.status_code}: {resp.text}")
        results["failed"].append("Demo login failed")
        return results
    
    demo_token = resp.json()["access_token"]
    demo_headers = {"Authorization": f"Bearer {demo_token}"}
    log(f"✅ Demo login successful, tier={resp.json()['user']['tier']}")
    
    # ========== STEP 1: POST /api/posts with space=trading (as demo, Premium) ==========
    log("\nSTEP 1: POST /api/posts with space=trading (as demo, Premium)")
    resp = requests.post(f"{BACKEND_URL}/posts", headers=demo_headers, json={
        "text": "trading-only regression check",
        "space": "trading"
    })
    if resp.status_code != 201:
        log(f"❌ FAILED: Expected 201, got {resp.status_code}: {resp.text}")
        results["failed"].append("Step 1: POST /api/posts with space=trading failed")
        return results
    
    trading_post = resp.json()
    trading_post_id = trading_post["post_id"]
    log(f"✅ PASSED: Created trading post {trading_post_id}")
    results["passed"].append("Step 1: POST /api/posts with space=trading → 201")
    
    # ========== STEP 2: GET /api/posts?scope=all&limit=20 (main feed) ==========
    log("\nSTEP 2: GET /api/posts?scope=all&limit=20 (main feed, as demo)")
    resp = requests.get(f"{BACKEND_URL}/posts?scope=all&limit=20", headers=demo_headers)
    if resp.status_code != 200:
        log(f"❌ FAILED: Expected 200, got {resp.status_code}: {resp.text}")
        results["failed"].append("Step 2: GET main feed failed")
    else:
        main_feed = resp.json()["items"]
        trading_post_in_main = any(p["post_id"] == trading_post_id for p in main_feed)
        if trading_post_in_main:
            log(f"❌ FAILED: Trading post {trading_post_id} APPEARED in main feed (should be isolated)")
            results["failed"].append("Step 2: Trading post appeared in main feed (space isolation broken)")
        else:
            log(f"✅ PASSED: Trading post NOT in main feed (space isolation working)")
            results["passed"].append("Step 2: Trading post NOT in main feed → space isolation working")
    
    # ========== STEP 3: GET /api/posts?space=trading&limit=20 (as demo) ==========
    log("\nSTEP 3: GET /api/posts?space=trading&limit=20 (as demo)")
    resp = requests.get(f"{BACKEND_URL}/posts?space=trading&limit=20", headers=demo_headers)
    if resp.status_code != 200:
        log(f"❌ FAILED: Expected 200, got {resp.status_code}: {resp.text}")
        results["failed"].append("Step 3: GET trading feed failed")
    else:
        trading_feed = resp.json()["items"]
        trading_post_in_trading = any(p["post_id"] == trading_post_id for p in trading_feed)
        if not trading_post_in_trading:
            log(f"❌ FAILED: Trading post {trading_post_id} NOT found in trading feed")
            results["failed"].append("Step 3: Trading post NOT in trading feed")
        else:
            log(f"✅ PASSED: Trading post found in trading feed")
            results["passed"].append("Step 3: Trading post found in trading feed")
    
    # ========== STEP 4: DELETE the post to clean up ==========
    log("\nSTEP 4: DELETE the post to clean up")
    resp = requests.delete(f"{BACKEND_URL}/posts/{trading_post_id}", headers=demo_headers)
    if resp.status_code != 200:
        log(f"⚠️  WARNING: Delete failed with {resp.status_code}: {resp.text}")
        results["failed"].append("Step 4: DELETE post failed")
    else:
        log(f"✅ PASSED: Post deleted successfully")
        results["passed"].append("Step 4: DELETE post → 200")
    
    # ========== STEP 5: Sign up a new FREE user ==========
    log("\nSTEP 5: Sign up a new FREE user")
    free_email = f"free_user_{datetime.now().timestamp()}@test.com"
    free_password = "FreeUser123!"
    resp = requests.post(f"{BACKEND_URL}/auth/signup", json={
        "email": free_email,
        "password": free_password,
        "display_name": "Free User",
        "username": f"free_{int(datetime.now().timestamp())}",
        "age_confirmed": True,
        "agreed_to_terms": True
    })
    if resp.status_code != 201:
        log(f"❌ FAILED: Signup failed with {resp.status_code}: {resp.text}")
        results["failed"].append("Step 5: Free user signup failed")
        return results
    
    free_token = resp.json()["access_token"]
    free_headers = {"Authorization": f"Bearer {free_token}"}
    log(f"✅ Free user created: {free_email}, tier={resp.json()['user']['tier']}")
    
    # ========== STEP 5a: GET /api/posts?space=trading (as free user) ==========
    log("\nSTEP 5a: GET /api/posts?space=trading (as free user) → expect 402")
    resp = requests.get(f"{BACKEND_URL}/posts?space=trading&limit=20", headers=free_headers)
    if resp.status_code != 402:
        log(f"❌ FAILED: Expected 402, got {resp.status_code}: {resp.text}")
        results["failed"].append("Step 5a: GET trading feed as free user did not return 402")
    else:
        log(f"✅ PASSED: Free user GET trading feed → 402 (premium gating working)")
        results["passed"].append("Step 5a: GET trading feed as free user → 402")
    
    # ========== STEP 5b: POST /api/posts with space=trading (as free user) ==========
    log("\nSTEP 5b: POST /api/posts with space=trading (as free user) → expect 402")
    resp = requests.post(f"{BACKEND_URL}/posts", headers=free_headers, json={
        "text": "free user trying trading",
        "space": "trading"
    })
    if resp.status_code != 402:
        log(f"❌ FAILED: Expected 402, got {resp.status_code}: {resp.text}")
        results["failed"].append("Step 5b: POST trading post as free user did not return 402")
    else:
        log(f"✅ PASSED: Free user POST trading post → 402 (premium gating working)")
        results["passed"].append("Step 5b: POST trading post as free user → 402")
    
    return results

if __name__ == "__main__":
    log("=" * 80)
    log("Trading Only Backend Regression Check")
    log("=" * 80)
    
    results = test_trading_only_regression()
    
    log("\n" + "=" * 80)
    log("SUMMARY")
    log("=" * 80)
    
    log(f"\n✅ PASSED ({len(results['passed'])} tests):")
    for test in results["passed"]:
        log(f"  - {test}")
    
    if results["failed"]:
        log(f"\n❌ FAILED ({len(results['failed'])} tests):")
        for test in results["failed"]:
            log(f"  - {test}")
        sys.exit(1)
    else:
        log("\n🎉 ALL TESTS PASSED - Trading Only space isolation and premium gating working correctly")
        sys.exit(0)
