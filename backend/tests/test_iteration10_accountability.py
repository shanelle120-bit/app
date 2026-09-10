"""
Iteration 10 - Accountability Partners (Premium) end-to-end backend tests.
All shared-state tests are in ONE class so pytest-xdist loadscope keeps them on
a single worker (sequential). Independent tests kept separate.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://navy-social-platform.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASS = "Trader123!"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["access_token"], d["user"]


def _signup(email, password, display_name, username):
    r = requests.post(f"{API}/auth/signup", json={
        "email": email, "password": password, "display_name": display_name, "username": username
    }, timeout=30)
    assert r.status_code in (200, 201), r.text
    d = r.json()
    return d["access_token"], d["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _activate_premium(tok):
    r = requests.post(f"{API}/membership/activate", json={"plan": "monthly"}, headers=_h(tok), timeout=30)
    assert r.status_code in (200, 201), r.text


PROFILE_A = {"markets": ["Futures"], "instruments": "NQ", "session": "NY",
             "timezone": "EST", "frequency": "Daily", "working_on": "x",
             "looking_for": ["Daily Check-ins"]}
PROFILE_B = {"markets": ["Futures"], "instruments": "ES", "session": "NY",
             "timezone": "EST", "frequency": "Daily", "working_on": "y",
             "looking_for": ["Daily Check-ins"]}


class TestAccountabilityE2E:
    """Sequential end-to-end run (loadscope pins to one worker)."""

    @classmethod
    def setup_class(cls):
        tag = uuid.uuid4().hex[:6]
        cls.a_tok, cls.a_user = _signup(f"TEST_iter10_a_{tag}@x.com", "Passw0rd!!", f"A Test {tag}", f"a_test_{tag}")
        cls.b_tok, cls.b_user = _signup(f"TEST_iter10_b_{tag}@x.com", "Passw0rd!!", f"B Test {tag}", f"b_test_{tag}")
        cls.free_tok, cls.free_user = _signup(f"TEST_iter10_free_{tag}@x.com", "Passw0rd!!", f"Free {tag}", f"free_{tag}")
        _activate_premium(cls.a_tok)
        _activate_premium(cls.b_tok)
        cls.demo_tok, cls.demo_user = _login(DEMO_EMAIL, DEMO_PASS)

    @classmethod
    def teardown_class(cls):
        try:
            requests.delete(f"{API}/accountability/partnership", headers=_h(cls.a_tok), timeout=10)
            requests.delete(f"{API}/accountability/partnership", headers=_h(cls.b_tok), timeout=10)
            requests.delete(f"{API}/mingle/blocks/{cls.b_user['user_id']}", headers=_h(cls.a_tok), timeout=10)
            requests.delete(f"{API}/mingle/blocks/{cls.a_user['user_id']}", headers=_h(cls.b_tok), timeout=10)
            # decline any pending outgoing requests
            for tok in (cls.a_tok, cls.b_tok, cls.demo_tok):
                r = requests.get(f"{API}/accountability/me", headers=_h(tok), timeout=10)
                if r.status_code == 200:
                    for out in r.json().get("outgoing_requests", []):
                        # can't decline own outgoing; only recipient can. skip.
                        pass
        except Exception:
            pass

    # ----- 01 demo + gating -----
    def test_01_demo_login_and_gating(self):
        assert self.demo_tok
        # Free user gated 402
        r = requests.get(f"{API}/accountability/me", headers=_h(self.free_tok), timeout=30)
        assert r.status_code == 402, r.text
        # A & B allowed after premium
        for tok in (self.a_tok, self.b_tok):
            r = requests.get(f"{API}/accountability/me", headers=_h(tok), timeout=30)
            assert r.status_code == 200

    # ----- 02 browse before profile -----
    def test_02_browse_before_profile_seeded(self):
        r = requests.get(f"{API}/accountability/partners", headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 200
        arr = r.json()
        usernames = [(p.get("user") or {}).get("username", "") for p in arr]
        assert any("marcus" in u for u in usernames), f"missing seeded marcus: {usernames}"
        assert any("ava" in u for u in usernames), f"missing seeded ava: {usernames}"
        for p in arr:
            u = p.get("user") or {}
            assert "display_name" in u and "username" in u
            for k in ("markets", "session", "frequency", "looking_for", "has_partner"):
                assert k in p
            assert "request_sent" in p and "request_received" in p

    # ----- 03 profile upsert + sharing defaults -----
    def test_03_profile_and_defaults(self):
        r = requests.put(f"{API}/accountability/profile", json=PROFILE_A, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 200
        me = r.json()
        assert me["profile"]["markets"] == ["Futures"]
        assert me["profile"]["session"] == "NY"
        assert me["sharing"] == {"plan": True, "discipline": True, "plan_followed": True, "pnl": True,
                                  "mood": False, "notes": False, "screenshots": False}

    def test_04_invalid_session_400(self):
        bad = dict(PROFILE_A, session="Mars")
        r = requests.put(f"{API}/accountability/profile", json=bad, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 400

    def test_05_b_profile(self):
        r = requests.put(f"{API}/accountability/profile", json=PROFILE_B, headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 200

    # ----- 06 request lifecycle -----
    def test_06_send_request_self_and_duplicate(self):
        a_uid = self.a_user["user_id"]
        b_uid = self.b_user["user_id"]
        # self
        r = requests.post(f"{API}/accountability/requests", json={"to_user_id": a_uid}, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 400
        # first request
        r = requests.post(f"{API}/accountability/requests", json={"to_user_id": b_uid}, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 201, r.text
        req = r.json()
        assert req["status"] == "pending"
        type(self).req_id = req["request_id"]
        # duplicate
        r = requests.post(f"{API}/accountability/requests", json={"to_user_id": b_uid}, headers=_h(self.a_tok), timeout=30)
        assert r.status_code in (200, 201)
        assert r.json()["request_id"] == self.req_id

    def test_07_incoming_outgoing_visible(self):
        r = requests.get(f"{API}/accountability/me", headers=_h(self.b_tok), timeout=30)
        assert any(x["status"] == "pending" for x in r.json()["incoming_requests"])
        r = requests.get(f"{API}/accountability/me", headers=_h(self.a_tok), timeout=30)
        assert any(x["status"] == "pending" for x in r.json()["outgoing_requests"])
        r = requests.get(f"{API}/accountability/partners", headers=_h(self.a_tok), timeout=30)
        b_card = next((p for p in r.json() if p["user_id"] == self.b_user["user_id"]), None)
        assert b_card is not None and b_card["request_sent"]

    def test_08_accept_creates_partnership(self):
        r = requests.post(f"{API}/accountability/requests/{self.req_id}/accept", headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "accepted"
        assert data["partnership"]["partnership_id"]
        for tok, other in ((self.a_tok, self.b_user), (self.b_tok, self.a_user)):
            r = requests.get(f"{API}/accountability/me", headers=_h(tok), timeout=30)
            p = r.json()["partner"]
            assert p is not None
            assert p["user"]["user_id"] == other["user_id"]
            assert p["user"].get("username")

    def test_09_second_request_blocked_when_paired(self):
        r = requests.get(f"{API}/accountability/partners", headers=_h(self.a_tok), timeout=30)
        arr = r.json()
        # B excluded
        assert not any(p["user_id"] == self.b_user["user_id"] for p in arr)
        marcus = next((p for p in arr if "marcus" in (p.get("user") or {}).get("username", "")), None)
        assert marcus
        r = requests.post(f"{API}/accountability/requests", json={"to_user_id": marcus["user_id"]}, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 400

    def test_10_end_partnership(self):
        r = requests.delete(f"{API}/accountability/partnership", headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/accountability/me", headers=_h(self.a_tok), timeout=30)
        assert r.json()["partner"] is None

    def test_11_decline_path(self):
        r = requests.post(f"{API}/accountability/requests", json={"to_user_id": self.b_user["user_id"]}, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 201
        rid = r.json()["request_id"]
        r = requests.post(f"{API}/accountability/requests/{rid}/decline", headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 200 and r.json()["status"] == "declined"
        r = requests.get(f"{API}/accountability/me", headers=_h(self.b_tok), timeout=30)
        assert not any(x.get("request_id") == rid for x in r.json()["incoming_requests"])
        assert r.json()["partner"] is None

    # ----- 12 blocking symmetric -----
    def test_12_block_prevents_requests_symmetric(self):
        a_uid = self.a_user["user_id"]
        b_uid = self.b_user["user_id"]
        r = requests.post(f"{API}/mingle/block", json={"user_id": b_uid}, headers=_h(self.a_tok), timeout=30)
        assert r.status_code in (200, 201)
        r = requests.post(f"{API}/accountability/requests", json={"to_user_id": b_uid}, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 404
        r = requests.post(f"{API}/accountability/requests", json={"to_user_id": a_uid}, headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 404
        # cleanup
        requests.delete(f"{API}/mingle/blocks/{b_uid}", headers=_h(self.a_tok), timeout=30)

    def test_13_partner_sessions_hidden_when_blocked_after_pairing(self):
        b_uid = self.b_user["user_id"]
        # pair
        r = requests.post(f"{API}/accountability/requests", json={"to_user_id": b_uid}, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 201
        rid = r.json()["request_id"]
        r = requests.post(f"{API}/accountability/requests/{rid}/accept", headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 200
        # A blocks B
        r = requests.post(f"{API}/mingle/block", json={"user_id": b_uid}, headers=_h(self.a_tok), timeout=30)
        assert r.status_code in (200, 201)
        # partner_sessions 404
        r = requests.get(f"{API}/accountability/partner/sessions", headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 404
        # partners list hides B
        r = requests.get(f"{API}/accountability/partners", headers=_h(self.a_tok), timeout=30)
        assert not any(p["user_id"] == b_uid for p in r.json())
        # cleanup
        requests.delete(f"{API}/mingle/blocks/{b_uid}", headers=_h(self.a_tok), timeout=30)
        requests.delete(f"{API}/accountability/partnership", headers=_h(self.a_tok), timeout=30)

    # ----- 14 plan + sessions + snapshot -----
    def test_14_plan_save_and_persist(self):
        plan = {"account_name": "Apex 50K", "account_type": "Prop Firm", "starting_balance": 50000,
                "market": "Futures", "instruments": "NQ", "position_size": "2", "strategy": "ORB",
                "session": "NY Open", "daily_target": 250, "daily_max_loss": 500, "max_trades": 3}
        r = requests.put(f"{API}/accountability/plan", json=plan, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/accountability/me", headers=_h(self.a_tok), timeout=30)
        assert r.json()["plan"]["daily_target"] == 250

    def test_15_session_bad_behaviour(self):
        body = {"pnl": 825, "trades": 6, "strategy_followed": False, "max_loss_respected": True,
                "stopped_when_done": False, "revenge_or_chase": True, "mood": "😤 Frustrated"}
        r = requests.post(f"{API}/accountability/sessions", json=body, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 201, r.text
        s = r.json()
        assert s["discipline_score"] == 20
        assert s["target_hit"] is True
        assert s["max_trades_respected"] is False
        assert s["plan_followed"] is False
        assert s["plan_snapshot"]["daily_target"] == 250

    def test_16_session_perfect_no_date(self):
        """Perfect session without date field (past-date field is broken -- see backend bug in report)."""
        body = {"pnl": -75, "trades": 2, "strategy_followed": True, "max_loss_respected": True,
                "stopped_when_done": True, "revenge_or_chase": False, "mood": "😌 Calm",
                "notes": "solid"}
        r = requests.post(f"{API}/accountability/sessions", json=body, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 201, r.text
        s = r.json()
        assert s["discipline_score"] == 100
        assert s["target_hit"] is False
        assert s["max_trades_respected"] is True

    def test_17_session_past_date_pydantic_bug(self):
        """BACKEND BUG: 'date: Optional[date] = None' — field name 'date' shadows type 'date' at
        pydantic annotation resolution → any non-None date value → 422 'Input should be None'.
        The problem statement expects this to accept '2026-06-01' and produce 201.
        """
        body = {"pnl": -75, "trades": 2, "strategy_followed": True, "max_loss_respected": True,
                "stopped_when_done": True, "revenge_or_chase": False, "mood": "😌 Calm",
                "date": "2026-06-01"}
        r = requests.post(f"{API}/accountability/sessions", json=body, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 201, (
            f"BACKEND BUG: past-date sessions rejected due to field-name/type shadow "
            f"in routes_accountability.SessionBody.date. Response: {r.status_code} {r.text}"
        )

    def test_18_invalid_mood_400(self):
        r = requests.post(f"{API}/accountability/sessions",
                          json={"pnl": 0, "trades": 1, "strategy_followed": True, "max_loss_respected": True,
                                "stopped_when_done": True, "revenge_or_chase": False, "mood": "bogus"},
                          headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 400

    def test_19_session_without_plan_400(self):
        # B has no plan yet
        r = requests.post(f"{API}/accountability/sessions",
                          json={"pnl": 0, "trades": 1, "strategy_followed": True, "max_loss_respected": True,
                                "stopped_when_done": True, "revenge_or_chase": False, "mood": "😌 Calm"},
                          headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 400

    def test_20_plan_edit_snapshots_preserved(self):
        plan = {"account_name": "Apex 50K", "account_type": "Prop Firm", "starting_balance": 50000,
                "market": "Futures", "instruments": "NQ", "position_size": "2", "strategy": "ORB",
                "session": "NY Open", "daily_target": 400, "daily_max_loss": 500, "max_trades": 2}
        r = requests.put(f"{API}/accountability/plan", json=plan, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/accountability/sessions", headers=_h(self.a_tok), timeout=30)
        sess = r.json()
        # Should have (at least) 2 existing sessions with snapshot 250
        assert len(sess) >= 2
        for s in sess:
            assert s["plan_snapshot"]["daily_target"] == 250, f"snapshot must be unchanged: {s['plan_snapshot']}"
        # New session uses 400
        r = requests.post(f"{API}/accountability/sessions",
                          json={"pnl": 300, "trades": 2, "strategy_followed": True, "max_loss_respected": True,
                                "stopped_when_done": True, "revenge_or_chase": False, "mood": "🔥 Locked In"},
                          headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 201
        news = r.json()
        assert news["target_hit"] is False
        assert news["plan_snapshot"]["daily_target"] == 400

    def test_21_get_session_and_cross_user_404(self):
        r = requests.get(f"{API}/accountability/sessions", headers=_h(self.a_tok), timeout=30)
        sid = r.json()[0]["session_id"]
        r = requests.get(f"{API}/accountability/sessions/{sid}", headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/accountability/sessions/{sid}", headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 404

    # ----- 22 progress -----
    def test_22_progress_metrics(self):
        r = requests.get(f"{API}/accountability/progress", headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 200
        p = r.json()
        # 4 sessions: 825, -75, -75 (past date), 300 → total 975
        assert p["sessions_logged"] == 4
        assert p["total_pnl"] == 975
        assert p["current_balance"] == 50975
        # target_hit_rate = 1/4 * 100 = 25 (only first session hit; s4 vs 400 target → miss)
        assert p["target_hit_rate"] == 25
        assert "target_hit_rate" in p and "win_rate" not in p
        assert len(p["history"]) == 4
        # discipline avg (20+100+100+100)/4 = 80
        assert p["avg_discipline"] == 80
        # accountability_streak >= 1 (today's session logged)
        assert p["accountability_streak"] >= 1

    # ----- 23 sharing/privacy -----
    def test_23_sharing_privacy(self):
        # Need partnership again + B has session
        a_uid = self.a_user["user_id"]
        b_uid = self.b_user["user_id"]
        # B plan
        plan_b = {"account_name": "B Plan", "account_type": "Personal", "starting_balance": 10000,
                  "market": "Futures", "instruments": "ES", "position_size": "1", "strategy": "trend",
                  "session": "NY Open", "daily_target": 100, "daily_max_loss": 200, "max_trades": 5}
        r = requests.put(f"{API}/accountability/plan", json=plan_b, headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 200
        r = requests.post(f"{API}/accountability/sessions",
                          json={"pnl": 150, "trades": 2, "strategy_followed": True, "max_loss_respected": True,
                                "stopped_when_done": True, "revenge_or_chase": False, "mood": "😌 Calm",
                                "notes": "private notes"},
                          headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 201
        # pair
        r = requests.post(f"{API}/accountability/requests", json={"to_user_id": b_uid}, headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 201
        rid = r.json()["request_id"]
        r = requests.post(f"{API}/accountability/requests/{rid}/accept", headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 200
        # default sharing: no mood/notes/screenshot
        r = requests.get(f"{API}/accountability/partner/sessions", headers=_h(self.a_tok), timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for it in items:
            assert "mood" not in it
            assert "notes" not in it
            assert "screenshot_url" not in it
            assert "pnl" in it or "discipline_score" in it
        # Toggle: mood+notes on, pnl off
        r = requests.put(f"{API}/accountability/sharing", json={"mood": True, "notes": True, "pnl": False},
                         headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/accountability/partner/sessions", headers=_h(self.a_tok), timeout=30)
        items = r.json()
        assert any("mood" in it for it in items)
        assert any("notes" in it for it in items)
        for it in items:
            assert "pnl" not in it and "target_hit" not in it
        # /me for A → partner.latest_session
        r = requests.get(f"{API}/accountability/me", headers=_h(self.a_tok), timeout=30)
        latest = r.json()["partner"]["latest_session"]
        assert "pnl" not in latest and "target_hit" not in latest
        assert "mood" in latest and "notes" in latest
        # plan off → shared_plan None
        r = requests.put(f"{API}/accountability/sharing", json={"plan": False}, headers=_h(self.b_tok), timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/accountability/me", headers=_h(self.a_tok), timeout=30)
        assert r.json()["partner"]["shared_plan"] is None

    # ----- 24 no leaks -----
    def test_24_no_leaks_public_feeds(self):
        for ep in ["/posts", "/mingle/posts", "/notifications"]:
            r = requests.get(f"{API}{ep}", headers=_h(self.demo_tok), timeout=30)
            assert r.status_code in (200, 403)
            if r.status_code == 200:
                blob = r.text.lower()
                for kw in ("discipline_score", "plan_snapshot", "accountability_streak"):
                    assert kw not in blob, f"leak of '{kw}' in {ep}"

    def test_25_user_posts_no_accountability(self):
        r = requests.get(f"{API}/users/{self.a_user['user_id']}/posts", headers=_h(self.demo_tok), timeout=30)
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            arr = r.json()
            for p in (arr if isinstance(arr, list) else arr.get("items", [])):
                assert "discipline_score" not in str(p).lower()

    # ----- 26 demo preserved -----
    def test_26_demo_plan_and_sessions_preserved(self):
        r = requests.get(f"{API}/accountability/me", headers=_h(self.demo_tok), timeout=30)
        assert r.status_code == 200
        me = r.json()
        assert me["plan"] is not None
        r = requests.get(f"{API}/accountability/sessions", headers=_h(self.demo_tok), timeout=30)
        assert r.status_code == 200
        assert len(r.json()) >= 1
