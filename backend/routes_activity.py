from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, NO_ID, now_utc, new_id, get_current_user, author_summary, users_map, public_user, mingle_summaries

router = APIRouter(tags=["activity"])

# Pricing is intentionally undecided; plans are structural only until payments are wired.
PLANS = {
    "monthly": {"id": "monthly", "name": "Premium Monthly", "price": None, "price_note": "Pricing announced at launch",
                "perks": ["Single & Mingle", "Accountability Partners (soon)", "Trading Only room (soon)"]},
    "yearly": {"id": "yearly", "name": "Premium Yearly", "price": None, "price_note": "Pricing announced at launch", "badge": "Best value",
               "perks": ["Everything in Monthly", "Founding member badge", "Priority access to new rooms"]},
}

# Feature registry: flip `premium` to gate any feature behind membership, `available` when it ships.
FEATURES = {
    "single_mingle": {"key": "single_mingle", "name": "Single & Mingle", "premium": True, "available": True},
    "accountability": {"key": "accountability", "name": "Accountability Partners", "premium": True, "available": False},
    "trading_only": {"key": "trading_only", "name": "Trading Only", "premium": True, "available": False},
}


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
async def notify(recipient_id: str, actor_id: str, kind: str, post_id: Optional[str] = None,
                 comment_id: Optional[str] = None, text: Optional[str] = None):
    if not recipient_id or recipient_id == actor_id:
        return
    await db.notifications.insert_one({
        "notification_id": new_id("ntf"), "user_id": recipient_id, "actor_id": actor_id, "type": kind,
        "post_id": post_id, "comment_id": comment_id, "text": (text or "")[:120], "read": False, "created_at": now_utc(),
    })


@router.get("/notifications")
async def list_notifications(user=Depends(get_current_user)):
    cursor = db.notifications.find({"user_id": user["user_id"]}, NO_ID).sort("created_at", -1).limit(100)
    items = [n async for n in cursor]
    umap = await users_map([n["actor_id"] for n in items])
    post_ids = [n["post_id"] for n in items if n.get("post_id")]
    mingle_posts = {p["post_id"] async for p in db.posts.find({"post_id": {"$in": post_ids}, "space": "mingle"}, NO_ID)} if post_ids else set()
    for n in items:
        n["mingle"] = n["type"].startswith("mingle_") or n.get("post_id") in mingle_posts
    mmap = await mingle_summaries([n["actor_id"] for n in items if n["mingle"]])
    for n in items:
        n["actor"] = mmap[n["actor_id"]] if n["mingle"] else author_summary(umap.get(n["actor_id"]))
    return items


@router.get("/notifications/unread-count")
async def unread_count(user=Depends(get_current_user)):
    return {"count": await db.notifications.count_documents({"user_id": user["user_id"], "read": False})}


@router.post("/notifications/read-all")
async def read_all(user=Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Membership tiers (payments to be wired later; activation is free in preview)
# ---------------------------------------------------------------------------
class ActivateBody(BaseModel):
    plan: Literal["monthly", "yearly"]


def tier_of(user: dict) -> str:
    return (user.get("membership") or {}).get("tier", "free")


def has_access(user: dict, feature_key: str) -> bool:
    f = FEATURES[feature_key]
    return not f["premium"] or tier_of(user) == "premium"


def require_feature(feature_key: str):
    async def dep(user=Depends(get_current_user)) -> dict:
        if not FEATURES[feature_key]["available"]:
            raise HTTPException(status_code=403, detail=f"{FEATURES[feature_key]['name']} is not available yet")
        if not has_access(user, feature_key):
            raise HTTPException(status_code=402, detail=f"Premium membership required for {FEATURES[feature_key]['name']}")
        return user
    return dep


require_premium = require_feature("single_mingle")


@router.get("/membership")
async def membership(user=Depends(get_current_user)):
    m = user.get("membership") or {"tier": "free"}
    return {"tier": m.get("tier", "free"), "plan": m.get("plan"), "since": m.get("since"), "source": m.get("source"),
            "plans": list(PLANS.values()),
            "features": [{**f, "unlocked": has_access(user, k)} for k, f in FEATURES.items()]}


@router.post("/membership/activate")
async def activate(body: ActivateBody, user=Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"membership": {
        "tier": "premium", "plan": body.plan, "since": now_utc(), "source": "preview_activation"}}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, NO_ID)
    return public_user(fresh, include_private=True)


@router.post("/membership/cancel")
async def cancel(user=Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"membership": {"tier": "free", "cancelled_at": now_utc()}}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, NO_ID)
    return public_user(fresh, include_private=True)
