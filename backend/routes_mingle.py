from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core import db, NO_ID, now_utc, new_id, get_current_user, users_map, mingle_blocked_ids as blocked_ids
from routes_activity import notify, require_premium
from routes_posts import MediaItem, enrich_posts

router = APIRouter(prefix="/mingle", tags=["mingle"])

TRADER_TYPES = ["Futures", "Options", "Forex", "Stocks", "Crypto", "Multiple"]
TRADING_STYLES = ["Scalper", "Day Trader", "Swing Trader", "Position Trader", "Investor", "Algo Trader"]
LOOKING_FOR = ["Dating", "Friendship", "Trading Friends", "Networking", "Open to Anything"]
PROMPTS = {
    "red_flag": "My trading red flag is…",
    "dating_trader": "You know you're dating a trader when…",
    "market_free": "My perfect market-free day is…",
}
SAFETY_NOTICE = ("Level Up Trading Hub does not conduct background checks. Use normal precautions when "
                 "interacting with or meeting people you connect with here.")


class MingleProfileBody(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)
    age: int = Field(ge=18, le=99)
    location: str = Field(default="", max_length=60)
    trader_type: str = Field(default="Multiple")
    trading_style: Optional[str] = None
    looking_for: List[str] = []
    bio: str = Field(default="", max_length=300)
    favorite_instrument: str = Field(default="", max_length=40)
    interests: str = Field(default="", max_length=200)
    prompt_key: Optional[str] = None
    prompt_answer: str = Field(default="", max_length=200)
    photo_url: Optional[str] = None
    photos: List[str] = Field(default=[], max_length=4)


class StatusBody(BaseModel):
    active: Optional[bool] = None
    show_badge: Optional[bool] = None
    allow_hi_from: Optional[Literal["everyone", "connections"]] = None


class ActionBody(BaseModel):
    to_user_id: str
    action: Literal["interested", "hi", "pass"]


class TargetBody(BaseModel):
    user_id: str
    reason: str = Field(default="", max_length=500)


def public_profile(p: dict) -> dict:
    keys = ["user_id", "display_name", "age", "location", "trader_type", "trading_style", "looking_for", "bio",
            "favorite_instrument", "interests", "prompt_key", "prompt_answer", "photo_url", "photos", "created_at"]
    out = {k: p.get(k) for k in keys}
    out["photos"] = out.get("photos") or ([p["photo_url"]] if p.get("photo_url") else [])
    out["prompt_label"] = PROMPTS.get(p.get("prompt_key") or "")
    out["looking_for"] = out.get("looking_for") or []
    return out


async def my_profile(user_id: str) -> Optional[dict]:
    return await db.mingle_profiles.find_one({"user_id": user_id, "deleted_at": None}, NO_ID)


async def get_or_create_conversation(a: str, b: str) -> str:
    conv = await db.conversations.find_one({"participants": {"$all": [a, b], "$size": 2}}, NO_ID)
    if conv:
        return conv["conversation_id"]
    conv = {"conversation_id": new_id("conv"), "participants": [a, b], "last_message": None,
            "last_message_at": now_utc(), "last_read": {}, "created_at": now_utc()}
    await db.conversations.insert_one(conv)
    return conv["conversation_id"]


async def send_system_message(conversation_id: str, sender_id: str, text: str):
    msg = {"message_id": new_id("msg"), "conversation_id": conversation_id, "sender_id": sender_id, "text": text,
           "gif_url": None, "image_url": None, "created_at": now_utc()}
    await db.messages.insert_one(msg)
    await db.conversations.update_one({"conversation_id": conversation_id},
                                      {"$set": {"last_message": text, "last_message_at": msg["created_at"],
                                                f"last_read.{sender_id}": msg["created_at"]}})


@router.get("/meta")
async def meta():
    return {"trader_types": TRADER_TYPES, "trading_styles": TRADING_STYLES, "looking_for": LOOKING_FOR,
            "prompts": PROMPTS, "safety_notice": SAFETY_NOTICE}


@router.get("/me")
async def get_me(user=Depends(get_current_user)):
    p = await my_profile(user["user_id"])
    if not p:
        return {"profile": None}
    out = public_profile(p)
    out.update({"active": p.get("active", True), "show_badge": p.get("show_badge", True),
                "allow_hi_from": p.get("allow_hi_from", "everyone")})
    return {"profile": out}


@router.put("/me")
async def upsert_me(body: MingleProfileBody, user=Depends(require_premium)):
    if body.trader_type not in TRADER_TYPES:
        raise HTTPException(status_code=400, detail="Invalid trader type")
    if body.prompt_key and body.prompt_key not in PROMPTS:
        raise HTTPException(status_code=400, detail="Invalid prompt")
    data = body.model_dump()
    data["photos"] = [p for p in data["photos"] if p][:4]
    if data["photos"] and not data.get("photo_url"):
        data["photo_url"] = data["photos"][0]
    data["looking_for"] = [x for x in data["looking_for"] if x in LOOKING_FOR]
    data["display_name"] = data["display_name"].strip()
    existing = await db.mingle_profiles.find_one({"user_id": user["user_id"]}, NO_ID)
    if existing:
        data["updated_at"] = now_utc()
        data["deleted_at"] = None
        if existing.get("deleted_at"):
            data.update({"active": True})
        await db.mingle_profiles.update_one({"user_id": user["user_id"]}, {"$set": data})
    else:
        data.update({"user_id": user["user_id"], "active": True, "show_badge": True, "allow_hi_from": "everyone",
                     "created_at": now_utc(), "deleted_at": None})
        await db.mingle_profiles.insert_one(data)
    return await get_me(user)


@router.post("/me/status")
async def update_status(body: StatusBody, user=Depends(get_current_user)):
    if not await my_profile(user["user_id"]):
        raise HTTPException(status_code=404, detail="No Single & Mingle profile")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        await db.mingle_profiles.update_one({"user_id": user["user_id"]}, {"$set": updates})
    return await get_me(user)


@router.delete("/me")
async def leave(user=Depends(get_current_user)):
    await db.mingle_profiles.update_one({"user_id": user["user_id"]},
                                        {"$set": {"deleted_at": now_utc(), "active": False}})
    await db.mingle_connections.update_many({"participants": user["user_id"], "deleted_at": None},
                                            {"$set": {"deleted_at": now_utc()}})
    return {"left": True}


@router.get("/discover")
async def discover(min_age: int = Query(default=18, ge=18), max_age: int = Query(default=99, le=99),
                   location: str = "", trader_type: str = "", trading_style: str = "", looking_for: str = "",
                   limit: int = Query(default=30, le=50), user=Depends(require_premium)):
    me = user["user_id"]
    if not await my_profile(me):
        raise HTTPException(status_code=403, detail="Join Single & Mingle to discover members")
    exclude = {me} | await blocked_ids(me)
    async for a in db.mingle_actions.find({"from_id": me}, NO_ID):
        exclude.add(a["to_id"])
    query = {"deleted_at": None, "active": True, "user_id": {"$nin": list(exclude)},
             "age": {"$gte": min_age, "$lte": max_age}}
    if location.strip():
        query["location"] = {"$regex": location.strip(), "$options": "i"}
    if trader_type:
        query["trader_type"] = trader_type
    if trading_style:
        query["trading_style"] = trading_style
    if looking_for:
        query["looking_for"] = looking_for
    cursor = db.mingle_profiles.find(query, NO_ID).sort("created_at", -1).limit(limit)
    return [public_profile(p) async for p in cursor]


@router.post("/actions")
async def act(body: ActionBody, user=Depends(require_premium)):
    me = user["user_id"]
    if body.to_user_id == me:
        raise HTTPException(status_code=400, detail="That's you")
    if not await my_profile(me):
        raise HTTPException(status_code=403, detail="Join Single & Mingle first")
    target = await my_profile(body.to_user_id)
    if not target or not target.get("active", True) or body.to_user_id in await blocked_ids(me):
        raise HTTPException(status_code=404, detail="Member not available")
    await db.mingle_actions.update_one({"from_id": me, "to_id": body.to_user_id},
                                       {"$set": {"action": body.action, "created_at": now_utc()}}, upsert=True)
    result = {"action": body.action, "mingle": False}
    if body.action == "interested":
        reciprocal = await db.mingle_actions.find_one({"from_id": body.to_user_id, "to_id": me, "action": "interested"}, NO_ID)
        if reciprocal:
            conn = await db.mingle_connections.find_one({"participants": {"$all": [me, body.to_user_id]}, "deleted_at": None}, NO_ID)
            if not conn:
                conn = {"connection_id": new_id("mingle"), "participants": [me, body.to_user_id],
                        "created_at": now_utc(), "deleted_at": None}
                await db.mingle_connections.insert_one(conn)
            conversation_id = await get_or_create_conversation(me, body.to_user_id)
            result.update({"mingle": True, "connection_id": conn["connection_id"], "conversation_id": conversation_id,
                           "other": public_profile(target)})
            await notify(body.to_user_id, me, "mingle_match")
        else:
            await notify(body.to_user_id, me, "mingle_interested")
    elif body.action == "hi":
        their_interest = await db.mingle_actions.find_one({"from_id": body.to_user_id, "to_id": me, "action": "interested"}, NO_ID)
        if target.get("allow_hi_from", "everyone") != "everyone" and not their_interest:
            raise HTTPException(status_code=403, detail="This member only accepts messages from mutual Mingle connections")
        conversation_id = await get_or_create_conversation(me, body.to_user_id)
        await send_system_message(conversation_id, me, f"👋 Hi {target['display_name']}! Saying hi from Single & Mingle.")
        result["conversation_id"] = conversation_id
        await notify(body.to_user_id, me, "mingle_hi")
    return result


@router.get("/inbox")
async def inbox(user=Depends(require_premium)):
    """Members who said hi or marked me Interested and whom I haven't responded to yet."""
    me = user["user_id"]
    blocked = await blocked_ids(me)
    mine = {a["to_id"]: a["action"] async for a in db.mingle_actions.find({"from_id": me}, NO_ID)}
    incoming = [a async for a in db.mingle_actions.find({"to_id": me, "action": {"$in": ["hi", "interested"]}}, NO_ID).sort("created_at", -1)]
    ids = [a["from_id"] for a in incoming if a["from_id"] not in blocked and mine.get(a["from_id"]) not in ("interested", "pass")]
    profiles = {p["user_id"]: p async for p in db.mingle_profiles.find({"user_id": {"$in": ids}, "deleted_at": None, "active": True}, NO_ID)}
    out = []
    for a in incoming:
        p = profiles.get(a["from_id"])
        if not p:
            continue
        conv = await db.conversations.find_one({"participants": {"$all": [me, a["from_id"]], "$size": 2}}, NO_ID) if a["action"] == "hi" else None
        out.append({"action": a["action"], "created_at": a["created_at"], "profile": public_profile(p),
                    "conversation_id": conv["conversation_id"] if conv else None})
    return out


@router.get("/connections")
async def connections(user=Depends(get_current_user)):
    me = user["user_id"]
    blocked = await blocked_ids(me)
    conns = [c async for c in db.mingle_connections.find({"participants": me, "deleted_at": None}, NO_ID).sort("created_at", -1)]
    others = [next(p for p in c["participants"] if p != me) for c in conns]
    profiles = {p["user_id"]: p async for p in db.mingle_profiles.find({"user_id": {"$in": others}}, NO_ID)}
    out = []
    for c, other in zip(conns, others):
        if other in blocked or other not in profiles:
            continue
        conv = await db.conversations.find_one({"participants": {"$all": [me, other], "$size": 2}}, NO_ID)
        out.append({"connection_id": c["connection_id"], "created_at": c["created_at"], "other": public_profile(profiles[other]),
                    "conversation_id": conv["conversation_id"] if conv else None})
    return out


@router.delete("/connections/{connection_id}")
async def unmatch(connection_id: str, user=Depends(get_current_user)):
    res = await db.mingle_connections.update_one({"connection_id": connection_id, "participants": user["user_id"], "deleted_at": None},
                                                 {"$set": {"deleted_at": now_utc()}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"removed": True}


@router.post("/block")
async def block(body: TargetBody, user=Depends(get_current_user)):
    me = user["user_id"]
    await db.mingle_blocks.update_one({"blocker_id": me, "blocked_id": body.user_id},
                                      {"$set": {"created_at": now_utc()}}, upsert=True)
    await db.mingle_connections.update_many({"participants": {"$all": [me, body.user_id]}, "deleted_at": None},
                                            {"$set": {"deleted_at": now_utc()}})
    return {"blocked": True}


@router.post("/report")
async def report(body: TargetBody, user=Depends(get_current_user)):
    await db.mingle_reports.insert_one({"report_id": new_id("rep"), "reporter_id": user["user_id"],
                                        "reported_id": body.user_id, "reason": body.reason, "created_at": now_utc()})
    return {"reported": True}


async def badge_for(user_id: str) -> bool:
    p = await db.mingle_profiles.find_one({"user_id": user_id, "deleted_at": None, "active": True, "show_badge": True}, NO_ID)
    return bool(p)


# ---------------------------------------------------------------------------
# Blocked members
# ---------------------------------------------------------------------------
@router.get("/blocks")
async def list_blocks(user=Depends(get_current_user)):
    me = user["user_id"]
    blocks = [b async for b in db.mingle_blocks.find({"blocker_id": me}, NO_ID).sort("created_at", -1)]
    ids = [b["blocked_id"] for b in blocks]
    profiles = {p["user_id"]: p async for p in db.mingle_profiles.find({"user_id": {"$in": ids}}, NO_ID)}
    users = await users_map([i for i in ids if i not in profiles])
    out = []
    for b in blocks:
        p = profiles.get(b["blocked_id"])
        u = users.get(b["blocked_id"])
        out.append({"user_id": b["blocked_id"], "blocked_at": b["created_at"],
                    "display_name": (p or u or {}).get("display_name") or "Former member",
                    "photo_url": (p or {}).get("photo_url") or ((p or {}).get("photos") or [None])[0]})
    return out


@router.delete("/blocks/{user_id}")
async def unblock(user_id: str, user=Depends(get_current_user)):
    """Lift the block only. Past connection, Interested status and conversation are intentionally not restored."""
    res = await db.mingle_blocks.delete_one({"blocker_id": user["user_id"], "blocked_id": user_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Member is not blocked")
    return {"unblocked": True}


# ---------------------------------------------------------------------------
# Member profile view (Mingle identity only) + Mingle Feed
# ---------------------------------------------------------------------------
async def require_member(user: dict) -> dict:
    p = await my_profile(user["user_id"])
    if not p:
        raise HTTPException(status_code=403, detail="Join Single & Mingle first")
    return p


@router.get("/members/{user_id}")
async def member(user_id: str, user=Depends(require_premium)):
    me = user["user_id"]
    await require_member(user)
    target = await db.mingle_profiles.find_one({"user_id": user_id, "deleted_at": None}, NO_ID)
    if not target or user_id in await blocked_ids(me):
        raise HTTPException(status_code=404, detail="Member not available")
    mine = await db.mingle_actions.find_one({"from_id": me, "to_id": user_id}, NO_ID)
    theirs = await db.mingle_actions.find_one({"from_id": user_id, "to_id": me}, NO_ID)
    conn = await db.mingle_connections.find_one({"participants": {"$all": [me, user_id]}, "deleted_at": None}, NO_ID)
    conv = await db.conversations.find_one({"participants": {"$all": [me, user_id], "$size": 2}}, NO_ID)
    return {"profile": public_profile(target), "is_me": user_id == me,
            "my_action": (mine or {}).get("action"), "their_action": (theirs or {}).get("action"),
            "connection_id": (conn or {}).get("connection_id"),
            "conversation_id": conv["conversation_id"] if conv and (conn or (mine or {}).get("action") == "hi" or (theirs or {}).get("action") == "hi") else None}


class MinglePostBody(BaseModel):
    text: str = Field(default="", max_length=2000)
    media: List[MediaItem] = []


@router.get("/posts")
async def mingle_feed(before: Optional[datetime] = None, limit: int = Query(default=20, le=50), user=Depends(require_premium)):
    me = user["user_id"]
    await require_member(user)
    query = {"space": "mingle", "deleted_at": None, "author_id": {"$nin": list(await blocked_ids(me))}}
    if before:
        query["created_at"] = {"$lt": before}
    posts = [p async for p in db.posts.find(query, NO_ID).sort("created_at", -1).limit(limit)]
    return {"items": await enrich_posts(posts, me), "next_cursor": posts[-1]["created_at"].isoformat() if len(posts) == limit else None}


@router.post("/posts", status_code=201)
async def create_mingle_post(body: MinglePostBody, user=Depends(require_premium)):
    """Posts live in the `mingle` space: same posts/likes/comments machinery, never shown on the main feed or profile."""
    await require_member(user)
    text = body.text.strip()
    if not text and not body.media:
        raise HTTPException(status_code=400, detail="Add some text, a photo or a video")
    doc = {"post_id": new_id("post"), "author_id": user["user_id"], "text": text, "media": [m.model_dump() for m in body.media],
           "mentions": [], "likes_count": 0, "comments_count": 0, "shares_count": 0, "space": "mingle",
           "created_at": now_utc(), "deleted_at": None}
    await db.posts.insert_one(doc)
    doc.pop("_id", None)
    return (await enrich_posts([doc], user["user_id"]))[0]
