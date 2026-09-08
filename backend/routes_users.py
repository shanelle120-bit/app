import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core import db, NO_ID, now_utc, get_current_user, public_user, author_summary, users_map
from routes_activity import notify

router = APIRouter(tags=["users"])

MARKETS = ["Futures", "Options", "Forex", "Stocks", "Crypto", "Indices", "Commodities"]
TRADING_STYLES = ["Scalper", "Day Trader", "Swing Trader", "Position Trader", "Investor", "Algo Trader"]
SESSIONS = ["Asia", "London", "New York", "London / NY Overlap", "24/7 Crypto"]


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    username: Optional[str] = Field(default=None, min_length=3, max_length=24)
    bio: Optional[str] = Field(default=None, max_length=240)
    avatar_url: Optional[str] = None
    cover_url: Optional[str] = None
    markets: Optional[List[str]] = None
    instruments: Optional[List[str]] = None
    trading_style: Optional[str] = None
    trading_session: Optional[str] = None
    onboarding_complete: Optional[bool] = None
    has_seen_trading_disclaimer: Optional[bool] = None
    has_seen_mingle_safety: Optional[bool] = None


async def with_follow_state(users: List[dict], viewer_id: str) -> List[dict]:
    ids = [u["user_id"] for u in users]
    following = set()
    if ids:
        cursor = db.follows.find({"follower_id": viewer_id, "following_id": {"$in": ids}}, NO_ID)
        following = {f["following_id"] async for f in cursor}
    out = []
    for u in users:
        pu = public_user(u)
        pu["is_following"] = u["user_id"] in following
        pu["is_me"] = u["user_id"] == viewer_id
        out.append(pu)
    return out


@router.get("/meta/options")
async def profile_options():
    return {"markets": MARKETS, "trading_styles": TRADING_STYLES, "sessions": SESSIONS}


@router.put("/me")
async def update_me(body: ProfileUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if "username" in updates:
        uname = re.sub(r"[^a-z0-9_]", "", updates["username"].lower())
        if len(uname) < 3:
            raise HTTPException(status_code=400, detail="Username must be at least 3 characters (a-z, 0-9, _)")
        exists = await db.users.find_one({"username": uname, "user_id": {"$ne": user["user_id"]}}, NO_ID)
        if exists:
            raise HTTPException(status_code=409, detail="Username is already taken")
        updates["username"] = uname
    if "display_name" in updates:
        updates["display_name"] = updates["display_name"].strip()
    if not updates:
        return public_user(user, include_private=True)
    updates["updated_at"] = now_utc()
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, NO_ID)
    return public_user(fresh, include_private=True)


@router.get("/users")
async def search_users(q: str = Query(default="", max_length=50), limit: int = Query(default=20, le=50),
                       user=Depends(get_current_user)):
    query = {"deleted_at": None, "user_id": {"$ne": user["user_id"]}}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"username": rx}, {"display_name": rx}]
    cursor = db.users.find(query, NO_ID).sort("followers_count", -1).limit(limit)
    users = [u async for u in cursor]
    return await with_follow_state(users, user["user_id"])


@router.get("/users/{user_id}")
async def get_user(user_id: str, user=Depends(get_current_user)):
    target = await db.users.find_one({"user_id": user_id, "deleted_at": None}, NO_ID)
    if not target:
        raise HTTPException(status_code=404, detail="Trader not found")
    result = (await with_follow_state([target], user["user_id"]))[0]
    if user_id == user["user_id"]:
        result["email"] = user.get("email")
    result["photos_count"] = await db.posts.count_documents(
        {"author_id": user_id, "deleted_at": None, "media.type": "image", "space": {"$nin": ["mingle", "trading"]}})
    result["videos_count"] = await db.posts.count_documents(
        {"author_id": user_id, "deleted_at": None, "media.type": "video", "space": {"$nin": ["mingle", "trading"]}})
    result["mingle_badge"] = bool(await db.mingle_profiles.find_one(
        {"user_id": user_id, "deleted_at": None, "active": True, "show_badge": True}, NO_ID))
    return result


@router.post("/users/{user_id}/follow")
async def toggle_follow(user_id: str, user=Depends(get_current_user)):
    if user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")
    target = await db.users.find_one({"user_id": user_id, "deleted_at": None}, NO_ID)
    if not target:
        raise HTTPException(status_code=404, detail="Trader not found")
    existing = await db.follows.find_one({"follower_id": user["user_id"], "following_id": user_id}, NO_ID)
    if existing:
        await db.follows.delete_one({"follower_id": user["user_id"], "following_id": user_id})
        delta = -1
        following = False
    else:
        await db.follows.insert_one({"follower_id": user["user_id"], "following_id": user_id, "created_at": now_utc()})
        delta = 1
        following = True
        await notify(user_id, user["user_id"], "follow")
    await db.users.update_one({"user_id": user_id}, {"$inc": {"followers_count": delta}})
    await db.users.update_one({"user_id": user["user_id"]}, {"$inc": {"following_count": delta}})
    fresh = await db.users.find_one({"user_id": user_id}, NO_ID)
    return {"following": following, "followers_count": max(0, fresh.get("followers_count", 0))}


@router.get("/users/{user_id}/followers")
async def followers(user_id: str, user=Depends(get_current_user)):
    cursor = db.follows.find({"following_id": user_id}, NO_ID).sort("created_at", -1).limit(100)
    ids = [f["follower_id"] async for f in cursor]
    umap = await users_map(ids)
    return await with_follow_state([umap[i] for i in ids if i in umap], user["user_id"])


@router.get("/users/{user_id}/following")
async def following(user_id: str, user=Depends(get_current_user)):
    cursor = db.follows.find({"follower_id": user_id}, NO_ID).sort("created_at", -1).limit(100)
    ids = [f["following_id"] async for f in cursor]
    umap = await users_map(ids)
    return await with_follow_state([umap[i] for i in ids if i in umap], user["user_id"])


@router.get("/stories")
async def stories(user=Depends(get_current_user)):
    """Traders the user follows, ordered by most recent post (used for the Stories row)."""
    cursor = db.follows.find({"follower_id": user["user_id"]}, NO_ID)
    ids = [f["following_id"] async for f in cursor]
    umap = await users_map(ids)
    latest = {}
    if ids:
        pipeline = [
            {"$match": {"author_id": {"$in": ids}, "deleted_at": None, "space": {"$nin": ["mingle", "trading"]}}},
            {"$sort": {"created_at": -1}},
            {"$group": {"_id": "$author_id", "latest": {"$first": "$created_at"}, "post_id": {"$first": "$post_id"}}},
        ]
        async for row in db.posts.aggregate(pipeline):
            latest[row["_id"]] = row
    items = []
    for uid in ids:
        u = umap.get(uid)
        if not u:
            continue
        info = author_summary(u)
        info["latest_post_at"] = latest.get(uid, {}).get("latest")
        info["latest_post_id"] = latest.get(uid, {}).get("post_id")
        items.append(info)
    items.sort(key=lambda x: (x["latest_post_at"] is None, -(x["latest_post_at"].timestamp() if x["latest_post_at"] else 0)))
    return items
