import re
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, NO_ID, now_utc, new_id, get_current_user, require_admin, author_summary, users_map, public_user, mingle_summaries

router = APIRouter(tags=["activity"])

# Real pricing: $9.99/mo with a 14-day free trial, fulfilled via Stripe (see routes_billing.py).
PLANS = {
    "monthly": {"id": "monthly", "name": "Premium Monthly", "price": "$9.99/mo", "price_note": "14-day free trial, then $9.99/month",
                "perks": ["Single & Mingle", "Accountability Partners", "Trading Only room"]},
}

# Feature registry: flip `premium` to gate any feature behind membership, `available` when it ships.
FEATURES = {
    "single_mingle": {"key": "single_mingle", "name": "Single & Mingle", "premium": True, "available": True},
    "accountability": {"key": "accountability", "name": "Accountability Partners", "premium": True, "available": True},
    "trading_only": {"key": "trading_only", "name": "Trading Only", "premium": True, "available": True},
}


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
async def notify(recipient_id: str, actor_id: str, kind: str, post_id: Optional[str] = None,
                 comment_id: Optional[str] = None, text: Optional[str] = None, reaction: Optional[str] = None):
    if not recipient_id or recipient_id == actor_id:
        return
    await db.notifications.insert_one({
        "notification_id": new_id("ntf"), "user_id": recipient_id, "actor_id": actor_id, "type": kind,
        "post_id": post_id, "comment_id": comment_id, "text": (text or "")[:120], "reaction": reaction,
        "read": False, "created_at": now_utc(),
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
    waitlisted = await db.billing_waitlist.find_one({"user_id": user["user_id"]}, NO_ID)
    return {"tier": m.get("tier", "free"), "plan": m.get("plan"), "since": m.get("since"), "source": m.get("source"),
            "cancel_at_period_end": m.get("cancel_at_period_end", False),
            "current_period_end": m.get("current_period_end"),
            "subscription_status": user.get("subscription_status"),
            "plans": list(PLANS.values()),
            "features": [{**f, "unlocked": has_access(user, k)} for k, f in FEATURES.items()],
            "notified_billing": waitlisted is not None}


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


# ---------------------------------------------------------------------------
# Billing waitlist ("Notify me when billing launches")
# ---------------------------------------------------------------------------
class NotifyBillingBody(BaseModel):
    plan: Optional[Literal["monthly", "yearly"]] = None


@router.post("/membership/notify-billing")
async def notify_billing(body: NotifyBillingBody, user=Depends(get_current_user)):
    """Idempotent per-user signup for the billing-launch waitlist. Re-tapping the
    button just refreshes `updated_at`/plan instead of creating a duplicate entry."""
    await db.billing_waitlist.update_one(
        {"user_id": user["user_id"]},
        {
            "$set": {
                "email": user.get("email"),
                "display_name": user.get("display_name"),
                "plan": body.plan,
                "updated_at": now_utc(),
            },
            "$setOnInsert": {"user_id": user["user_id"], "created_at": now_utc()},
        },
        upsert=True,
    )
    return {"ok": True, "message": "You're on the list. We'll let you know."}


@router.get("/admin/billing-waitlist")
async def admin_billing_waitlist(_admin=Depends(require_admin)):
    cursor = db.billing_waitlist.find({}, NO_ID).sort("created_at", -1)
    items = [w async for w in cursor]
    for w in items:
        w["created_at"] = w["created_at"].isoformat()
        w["updated_at"] = w["updated_at"].isoformat() if w.get("updated_at") else None
    return {"items": items, "count": len(items)}


@router.get("/admin/users")
async def admin_users(q: Optional[str] = None, _admin=Depends(require_admin)):
    """All registered accounts, newest first — for the admin 'All Users' screen.
    Optional `q` searches display name, username and email (case-insensitive)."""
    projection = {
        "user_id": 1, "display_name": 1, "username": 1, "email": 1, "avatar_url": 1,
        "membership": 1, "is_founding_member": 1, "is_admin": 1, "created_at": 1, "deleted_at": 1,
        "account_status": 1, "subscription_status": 1,
    }
    query: dict = {}
    if q and q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"display_name": rx}, {"username": rx}, {"email": rx}]
    cursor = db.users.find(query, projection).sort("created_at", -1).limit(1000)
    items = []
    async for u in cursor:
        membership = u.get("membership") or {}
        items.append({
            "user_id": u["user_id"],
            "display_name": u.get("display_name"),
            "username": u.get("username"),
            "email": u.get("email"),
            "avatar_url": u.get("avatar_url"),
            "tier": membership.get("tier", "free"),
            "is_complimentary": membership.get("source") == "admin_grant",
            "is_founding_member": bool(u.get("is_founding_member")),
            "is_admin": bool(u.get("is_admin")),
            "account_status": u.get("account_status", "active"),
            "subscription_status": u.get("subscription_status"),
            "created_at": u["created_at"].isoformat() if u.get("created_at") else None,
            "deleted": bool(u.get("deleted_at")),
        })
    return {"items": items, "count": len(items)}
