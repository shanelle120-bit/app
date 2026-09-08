import datetime as dt
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core import db, NO_ID, now_utc, new_id, get_current_user, author_summary, users_map, mingle_blocked_ids as blocked_ids
from routes_activity import require_feature

router = APIRouter(prefix="/accountability", tags=["accountability"])
require_acc = require_feature("accountability")

MARKETS = ["Futures", "Options", "Stocks", "Forex", "Crypto"]
SESSIONS = ["NY", "London", "Asia", "Flexible/Other"]
PLAN_SESSIONS = ["NY Open", "London", "Asia", "Other"]
FREQUENCIES = ["Daily", "Few times a week", "Casual"]
LOOKING_FOR = ["Daily Check-ins", "Occasional Check-ins", "Encouragement", "Discipline Support", "Trading Psychology", "Prop Firm Accountability"]
ACCOUNT_TYPES = ["Prop Firm", "Personal", "Sim"]
MOODS = ["🔥 Locked In", "💪 Confident", "😌 Calm", "😬 Anxious", "😤 Frustrated", "😴 Tired", "🤔 Uncertain"]
# Sensitive fields default OFF; the member controls each one individually.
DEFAULT_SHARING = {"plan": True, "discipline": True, "plan_followed": True, "pnl": True, "mood": False, "notes": False, "screenshots": False}
PLAN_SNAPSHOT_KEYS = ["account_name", "account_type", "starting_balance", "market", "instruments", "position_size", "strategy",
                      "session", "daily_target", "daily_max_loss", "max_trades"]


class ProfileBody(BaseModel):
    markets: List[str] = []
    instruments: str = Field(default="", max_length=120)
    session: str = "Flexible/Other"
    timezone: str = Field(default="", max_length=60)
    frequency: str = "Few times a week"
    working_on: str = Field(default="", max_length=200)
    looking_for: List[str] = []


class SharingBody(BaseModel):
    plan: Optional[bool] = None
    discipline: Optional[bool] = None
    plan_followed: Optional[bool] = None
    pnl: Optional[bool] = None
    mood: Optional[bool] = None
    notes: Optional[bool] = None
    screenshots: Optional[bool] = None


class RequestBody(BaseModel):
    to_user_id: str


class PlanBody(BaseModel):
    account_name: str = Field(min_length=1, max_length=60)
    account_type: str = "Personal"
    starting_balance: float = Field(ge=0)
    market: str = "Futures"
    instruments: str = Field(default="", max_length=120)
    position_size: str = Field(default="", max_length=60)
    strategy: str = Field(default="", max_length=500)
    session: str = "NY Open"
    daily_target: float = Field(ge=0)
    daily_max_loss: float = Field(ge=0)
    max_trades: int = Field(ge=1, le=500)


class SessionBody(BaseModel):
    pnl: float
    trades: int = Field(ge=0, le=500)
    strategy_followed: bool
    max_loss_respected: bool
    stopped_when_done: bool
    revenge_or_chase: bool
    mood: str
    notes: str = Field(default="", max_length=1000)
    screenshot_url: Optional[str] = None
    date: Optional[dt.date] = None


def profile_out(p: dict, u: Optional[dict]) -> dict:
    return {"user_id": p["user_id"], "user": author_summary(u), "markets": p.get("markets", []), "instruments": p.get("instruments", ""),
            "session": p.get("session"), "timezone": p.get("timezone", ""), "frequency": p.get("frequency"),
            "working_on": p.get("working_on", ""), "looking_for": p.get("looking_for", []), "created_at": p.get("created_at")}


def plan_out(p: Optional[dict]) -> Optional[dict]:
    if not p:
        return None
    return {k: p.get(k) for k in PLAN_SNAPSHOT_KEYS + ["updated_at", "created_at"]}


def session_out(s: dict) -> dict:
    s = dict(s)
    s.pop("_id", None)
    return s


async def active_partnership(user_id: str) -> Optional[dict]:
    return await db.acc_partnerships.find_one({"participants": user_id, "ended_at": None}, NO_ID)


def partner_of(p: dict, me: str) -> str:
    return next(x for x in p["participants"] if x != me)


def score_session(body: SessionBody, plan: dict) -> dict:
    """Discipline is behaviour only (5 × 20). P&L contributes zero points."""
    max_trades_respected = body.trades <= int(plan.get("max_trades") or 0) if plan.get("max_trades") else True
    factors = [body.strategy_followed, max_trades_respected, body.max_loss_respected, body.stopped_when_done, not body.revenge_or_chase]
    return {"target_hit": body.pnl >= float(plan.get("daily_target") or 0), "max_trades_respected": max_trades_respected,
            "plan_followed": body.strategy_followed, "discipline_score": 20 * sum(1 for f in factors if f)}


def visible_session(s: dict, sharing: dict) -> dict:
    """Concise partner-facing summary containing ONLY what the owner shares."""
    out = {"session_id": s["session_id"], "date": s["date"], "created_at": s["created_at"]}
    if sharing.get("pnl"):
        out["pnl"] = s["pnl"]
        out["target_hit"] = s["target_hit"]
    if sharing.get("discipline"):
        out["discipline_score"] = s["discipline_score"]
        out.update({k: s[k] for k in ["max_loss_respected", "stopped_when_done", "revenge_or_chase", "max_trades_respected"]})
    if sharing.get("plan_followed"):
        out["plan_followed"] = s["plan_followed"]
    if sharing.get("mood"):
        out["mood"] = s["mood"]
    if sharing.get("notes"):
        out["notes"] = s.get("notes", "")
    if sharing.get("screenshots"):
        out["screenshot_url"] = s.get("screenshot_url")
    if sharing.get("plan"):
        out["plan_snapshot"] = s.get("plan_snapshot")
    return out


@router.get("/meta")
async def meta():
    return {"markets": MARKETS, "sessions": SESSIONS, "plan_sessions": PLAN_SESSIONS, "frequencies": FREQUENCIES, "looking_for": LOOKING_FOR,
            "account_types": ACCOUNT_TYPES, "moods": MOODS, "sharing_fields": list(DEFAULT_SHARING.keys())}


@router.get("/me")
async def me(user=Depends(require_acc)):
    uid = user["user_id"]
    profile = await db.acc_profiles.find_one({"user_id": uid}, NO_ID)
    plan = await db.acc_plans.find_one({"user_id": uid}, NO_ID)
    partnership = await active_partnership(uid)
    partner = None
    if partnership:
        pid = partner_of(partnership, uid)
        pu = await db.users.find_one({"user_id": pid}, NO_ID)
        pp = await db.acc_profiles.find_one({"user_id": pid}, NO_ID)
        their_sharing = {**DEFAULT_SHARING, **((pp or {}).get("sharing") or {})}
        latest = await db.acc_sessions.find_one({"user_id": pid}, NO_ID, sort=[("date", -1), ("created_at", -1)])
        their_plan = await db.acc_plans.find_one({"user_id": pid}, NO_ID) if their_sharing.get("plan") else None
        partner = {"partnership_id": partnership["partnership_id"], "since": partnership["created_at"], "user": author_summary(pu),
                   "profile": profile_out(pp, pu) if pp else None, "shared_plan": plan_out(their_plan),
                   "latest_session": visible_session(latest, their_sharing) if latest else None}
    incoming = [r async for r in db.acc_requests.find({"to_id": uid, "status": "pending"}, NO_ID).sort("created_at", -1)]
    outgoing = [r async for r in db.acc_requests.find({"from_id": uid, "status": "pending"}, NO_ID)]
    umap = await users_map([r["from_id"] for r in incoming] + [r["to_id"] for r in outgoing])
    return {"profile": profile_out(profile, user) if profile else None,
            "sharing": {**DEFAULT_SHARING, **((profile or {}).get("sharing") or {})},
            "plan": plan_out(plan), "partner": partner,
            "incoming_requests": [{**r, "from_user": author_summary(umap.get(r["from_id"]))} for r in incoming],
            "outgoing_requests": [{**r, "to_user": author_summary(umap.get(r["to_id"]))} for r in outgoing]}


@router.put("/profile")
async def upsert_profile(body: ProfileBody, user=Depends(require_acc)):
    data = body.model_dump()
    data["markets"] = [m for m in data["markets"] if m in MARKETS]
    data["looking_for"] = [l for l in data["looking_for"] if l in LOOKING_FOR]
    if data["session"] not in SESSIONS or data["frequency"] not in FREQUENCIES:
        raise HTTPException(status_code=400, detail="Invalid option")
    existing = await db.acc_profiles.find_one({"user_id": user["user_id"]}, NO_ID)
    if existing:
        await db.acc_profiles.update_one({"user_id": user["user_id"]}, {"$set": {**data, "updated_at": now_utc()}})
    else:
        await db.acc_profiles.insert_one({**data, "user_id": user["user_id"], "sharing": dict(DEFAULT_SHARING), "created_at": now_utc()})
    return await me(user)


@router.put("/sharing")
async def update_sharing(body: SharingBody, user=Depends(require_acc)):
    updates = {f"sharing.{k}": v for k, v in body.model_dump().items() if v is not None}
    if not await db.acc_profiles.find_one({"user_id": user["user_id"]}, NO_ID):
        await db.acc_profiles.insert_one({"user_id": user["user_id"], "markets": [], "looking_for": [], "sharing": dict(DEFAULT_SHARING), "created_at": now_utc()})
    if updates:
        await db.acc_profiles.update_one({"user_id": user["user_id"]}, {"$set": updates})
    return await me(user)


@router.get("/partners")
async def browse(user=Depends(require_acc)):
    """Simple cards of members open to accountability — normal Level Up identity, no swipe behaviour."""
    uid = user["user_id"]
    exclude = {uid} | await blocked_ids(uid)
    partnership = await active_partnership(uid)
    if partnership:
        exclude.add(partner_of(partnership, uid))
    profiles = [p async for p in db.acc_profiles.find({"user_id": {"$nin": list(exclude)}}, NO_ID).sort("created_at", -1).limit(100)]
    ids = [p["user_id"] for p in profiles]
    umap = await users_map(ids)
    partnered = set()
    async for x in db.acc_partnerships.find({"participants": {"$in": ids}, "ended_at": None}, NO_ID):
        partnered.update(x["participants"])
    pending = {r["to_id"]: r["request_id"] async for r in db.acc_requests.find({"from_id": uid, "status": "pending"}, NO_ID)}
    incoming = {r["from_id"]: r["request_id"] async for r in db.acc_requests.find({"to_id": uid, "status": "pending"}, NO_ID)}
    out = []
    for p in profiles:
        if p["user_id"] not in umap:
            continue
        out.append({**profile_out(p, umap[p["user_id"]]), "has_partner": p["user_id"] in partnered,
                    "request_sent": pending.get(p["user_id"]), "request_received": incoming.get(p["user_id"])})
    return out


@router.post("/requests", status_code=201)
async def send_request(body: RequestBody, user=Depends(require_acc)):
    uid = user["user_id"]
    if body.to_user_id == uid:
        raise HTTPException(status_code=400, detail="That's you")
    if body.to_user_id in await blocked_ids(uid):
        raise HTTPException(status_code=404, detail="Member not available")
    if not await db.acc_profiles.find_one({"user_id": body.to_user_id}, NO_ID):
        raise HTTPException(status_code=404, detail="Member not available")
    if await active_partnership(uid):
        raise HTTPException(status_code=400, detail="End your current partnership before connecting with someone new")
    if await active_partnership(body.to_user_id):
        raise HTTPException(status_code=400, detail="This member already has an accountability partner")
    existing = await db.acc_requests.find_one({"from_id": uid, "to_id": body.to_user_id, "status": "pending"}, NO_ID)
    if existing:
        return existing
    req = {"request_id": new_id("accreq"), "from_id": uid, "to_id": body.to_user_id, "status": "pending", "created_at": now_utc()}
    await db.acc_requests.insert_one(req)
    req.pop("_id", None)
    return req


@router.post("/requests/{request_id}/{decision}")
async def answer_request(request_id: str, decision: Literal["accept", "decline"], user=Depends(require_acc)):
    uid = user["user_id"]
    req = await db.acc_requests.find_one({"request_id": request_id, "to_id": uid, "status": "pending"}, NO_ID)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if decision == "decline":
        await db.acc_requests.update_one({"request_id": request_id}, {"$set": {"status": "declined", "answered_at": now_utc()}})
        return {"status": "declined"}
    if req["from_id"] in await blocked_ids(uid):
        raise HTTPException(status_code=404, detail="Member not available")
    if await active_partnership(uid) or await active_partnership(req["from_id"]):
        raise HTTPException(status_code=400, detail="One of you already has an accountability partner")
    await db.acc_requests.update_one({"request_id": request_id}, {"$set": {"status": "accepted", "answered_at": now_utc()}})
    # Other pending requests involving either member are superseded.
    await db.acc_requests.update_many({"status": "pending", "$or": [{"from_id": {"$in": [uid, req["from_id"]]}}, {"to_id": {"$in": [uid, req["from_id"]]}}]},
                                      {"$set": {"status": "declined", "answered_at": now_utc()}})
    partnership = {"partnership_id": new_id("accp"), "participants": [uid, req["from_id"]], "created_at": now_utc(), "ended_at": None}
    await db.acc_partnerships.insert_one(partnership)
    partnership.pop("_id", None)
    return {"status": "accepted", "partnership": partnership}


@router.delete("/partnership")
async def end_partnership(user=Depends(require_acc)):
    res = await db.acc_partnerships.update_one({"participants": user["user_id"], "ended_at": None}, {"$set": {"ended_at": now_utc()}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="No active partnership")
    return {"ended": True}


@router.get("/partner/sessions")
async def partner_sessions(user=Depends(require_acc)):
    uid = user["user_id"]
    partnership = await active_partnership(uid)
    if not partnership:
        raise HTTPException(status_code=404, detail="No active partnership")
    pid = partner_of(partnership, uid)
    if pid in await blocked_ids(uid):
        raise HTTPException(status_code=404, detail="No active partnership")
    pp = await db.acc_profiles.find_one({"user_id": pid}, NO_ID)
    sharing = {**DEFAULT_SHARING, **((pp or {}).get("sharing") or {})}
    sessions = [s async for s in db.acc_sessions.find({"user_id": pid}, NO_ID).sort([("date", -1), ("created_at", -1)]).limit(60)]
    return [visible_session(s, sharing) for s in sessions]


@router.put("/plan")
async def save_plan(body: PlanBody, user=Depends(require_acc)):
    """The plan persists until edited; edits only affect FUTURE sessions (past sessions keep their snapshot)."""
    if body.account_type not in ACCOUNT_TYPES or body.market not in MARKETS or body.session not in PLAN_SESSIONS:
        raise HTTPException(status_code=400, detail="Invalid option")
    data = body.model_dump()
    existing = await db.acc_plans.find_one({"user_id": user["user_id"]}, NO_ID)
    if existing:
        await db.acc_plans.update_one({"user_id": user["user_id"]}, {"$set": {**data, "updated_at": now_utc()}})
    else:
        await db.acc_plans.insert_one({**data, "user_id": user["user_id"], "created_at": now_utc(), "updated_at": now_utc()})
    return plan_out(await db.acc_plans.find_one({"user_id": user["user_id"]}, NO_ID))


@router.post("/sessions", status_code=201)
async def save_session(body: SessionBody, user=Depends(require_acc)):
    plan = await db.acc_plans.find_one({"user_id": user["user_id"]}, NO_ID)
    if not plan:
        raise HTTPException(status_code=400, detail="Save your Trading Plan before logging a session")
    if body.mood not in MOODS:
        raise HTTPException(status_code=400, detail="Pick a mood")
    if body.screenshot_url and not body.screenshot_url.startswith("/api/files/"):
        raise HTTPException(status_code=400, detail="Invalid screenshot")
    day = (body.date or now_utc().date()).isoformat()
    doc = {"session_id": new_id("sess"), "user_id": user["user_id"], "date": day, **body.model_dump(exclude={"date"}),
           **score_session(body, plan), "plan_snapshot": {k: plan.get(k) for k in PLAN_SNAPSHOT_KEYS}, "created_at": now_utc()}
    await db.acc_sessions.insert_one(doc)
    return session_out(doc)


@router.get("/sessions")
async def list_sessions(user=Depends(require_acc)):
    return [session_out(s) async for s in db.acc_sessions.find({"user_id": user["user_id"]}, NO_ID).sort([("date", -1), ("created_at", -1)]).limit(500)]


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, user=Depends(require_acc)):
    s = await db.acc_sessions.find_one({"session_id": session_id, "user_id": user["user_id"]}, NO_ID)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return session_out(s)


def streak(days: List[str], predicate) -> int:
    """Consecutive logged session days (most recent backwards) satisfying predicate; gaps in logging end the streak."""
    count = 0
    for d in days:
        if not predicate(d):
            break
        count += 1
    return count


@router.get("/progress")
async def progress(user=Depends(require_acc)):
    plan = await db.acc_plans.find_one({"user_id": user["user_id"]}, NO_ID)
    sessions = [s async for s in db.acc_sessions.find({"user_id": user["user_id"]}, NO_ID).sort([("date", -1), ("created_at", -1)])]
    n = len(sessions)
    total_pnl = round(sum(s["pnl"] for s in sessions), 2)
    starting = float((plan or {}).get("starting_balance") or 0)
    rate = lambda key: round(100 * sum(1 for s in sessions if s.get(key)) / n) if n else 0  # noqa: E731
    # One entry per calendar day (latest wins) for streaks.
    by_day: dict = {}
    for s in sessions:
        by_day.setdefault(s["date"], s)
    days_desc = sorted(by_day.keys(), reverse=True)
    # Accountability streak: consecutive logged days ending today or yesterday.
    acc_streak = 0
    if days_desc:
        cursor = dt.date.fromisoformat(days_desc[0])
        if (dt.date.today() - cursor).days <= 1:
            for d in days_desc:
                if dt.date.fromisoformat(d) == cursor:
                    acc_streak += 1
                    cursor -= dt.timedelta(days=1)
                else:
                    break
    no_revenge_streak = streak(days_desc, lambda d: not by_day[d]["revenge_or_chase"])
    return {"has_plan": bool(plan), "starting_balance": starting, "current_balance": round(starting + total_pnl, 2), "total_pnl": total_pnl,
            "days_logged": len(by_day), "sessions_logged": n, "target_hit_rate": rate("target_hit"),
            "avg_discipline": round(sum(s["discipline_score"] for s in sessions) / n) if n else 0,
            "plan_followed_rate": rate("plan_followed"), "max_loss_respected_rate": rate("max_loss_respected"),
            "accountability_streak": acc_streak, "no_revenge_streak": no_revenge_streak,
            "history": [session_out(s) for s in sessions[:200]]}
