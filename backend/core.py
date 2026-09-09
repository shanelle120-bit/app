import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

import jwt
import requests
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pwdlib import PasswordHash

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger("leveluphub")

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

NO_ID = {"_id": 0}

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_MINUTES = int(os.environ.get("ACCESS_TOKEN_MINUTES", "43200"))
RESET_CODE_MINUTES = int(os.environ.get("RESET_CODE_MINUTES", "30"))
GIPHY_API_KEY = os.environ.get("GIPHY_API_KEY", "")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "level-up-trading-hub")
ADMIN_EMAILS = {e.strip().casefold() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()}

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"

password_hash = PasswordHash.recommended()
DUMMY_HASH = password_hash.hash("constant-dummy-password")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def normalized_email(email: str) -> str:
    return email.strip().casefold()


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------
def make_access_token(user_id: str, email: str, provider: str) -> str:
    now = now_utc()
    payload = {
        "sub": user_id,
        "email": email,
        "auth_provider": provider,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def resolve_token(token: str) -> Optional[dict]:
    """Accept either a local JWT (email/password) or an Emergent session token."""
    user_id = None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except Exception:
        session = await db.user_sessions.find_one({"session_token": token}, NO_ID)
        if session and aware(session["expires_at"]) > now_utc():
            user_id = session["user_id"]
    if not user_id:
        return None
    user = await db.users.find_one({"user_id": user_id, "deleted_at": None}, NO_ID)
    return user


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.query_params.get("token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await resolve_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


async def get_optional_user(request: Request) -> Optional[dict]:
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.query_params.get("token")
    if not token:
        return None
    return await resolve_token(token)


# ---------------------------------------------------------------------------
# Admin access (allowlisted by email, persisted as a one-way upgrade on the
# user document — authorization always reads the persisted `is_admin` flag,
# never a live email comparison, per standard JWT/role-gating practice).
# ---------------------------------------------------------------------------
def is_admin_email(email: Optional[str]) -> bool:
    return bool(email) and email.strip().casefold() in ADMIN_EMAILS


async def sync_admin_flag(user: dict) -> dict:
    """Idempotently promote a user to admin if their email is allowlisted.
    Upgrade-only: never revokes an existing is_admin flag automatically."""
    if not user.get("is_admin") and is_admin_email(user.get("email")):
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"is_admin": True}})
        user = {**user, "is_admin": True}
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("is_admin", False) is not True:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------
PUBLIC_USER_FIELDS = [
    "user_id", "display_name", "username", "bio", "avatar_url", "cover_url",
    "markets", "instruments", "trading_style", "trading_session",
    "followers_count", "following_count", "posts_count", "created_at",
    "onboarding_complete", "is_verified",
    "has_seen_trading_disclaimer", "has_seen_mingle_safety",
]


def public_user(doc: dict, include_private: bool = False) -> dict:
    out = {k: doc.get(k) for k in PUBLIC_USER_FIELDS}
    out["markets"] = out.get("markets") or []
    out["instruments"] = out.get("instruments") or []
    out["followers_count"] = out.get("followers_count") or 0
    out["following_count"] = out.get("following_count") or 0
    out["posts_count"] = out.get("posts_count") or 0
    out["has_seen_trading_disclaimer"] = bool(out.get("has_seen_trading_disclaimer"))
    out["has_seen_mingle_safety"] = bool(out.get("has_seen_mingle_safety"))
    if include_private:
        out["email"] = doc.get("email")
        out["auth_providers"] = doc.get("auth_providers", [])
        out["is_admin"] = bool(doc.get("is_admin"))
    out["tier"] = (doc.get("membership") or {}).get("tier", "free")
    return out


def author_summary(doc: Optional[dict]) -> dict:
    if not doc:
        return {"user_id": None, "display_name": "Unknown trader", "username": "unknown", "avatar_url": None}
    return {
        "user_id": doc["user_id"],
        "display_name": doc.get("display_name"),
        "username": doc.get("username"),
        "avatar_url": doc.get("avatar_url"),
        "trading_style": doc.get("trading_style"),
    }


async def users_map(user_ids: list) -> dict:
    ids = list({u for u in user_ids if u})
    if not ids:
        return {}
    cursor = db.users.find({"user_id": {"$in": ids}}, NO_ID)
    return {u["user_id"]: u async for u in cursor}


# ---------------------------------------------------------------------------
# Single & Mingle identity helpers (shared by posts, chat, notifications)
# ---------------------------------------------------------------------------
async def mingle_blocked_ids(user_id: str) -> set:
    ids = set()
    async for b in db.mingle_blocks.find({"$or": [{"blocker_id": user_id}, {"blocked_id": user_id}]}, NO_ID):
        ids.add(b["blocked_id"] if b["blocker_id"] == user_id else b["blocker_id"])
    return ids


def mingle_summary(p: Optional[dict], user_id: Optional[str] = None) -> dict:
    """Author-shaped summary built from a Mingle profile so Mingle content never exposes the main identity."""
    if not p:
        return {"user_id": user_id, "display_name": "Mingle member", "username": "", "avatar_url": None, "mingle": True}
    photos = p.get("photos") or []
    return {"user_id": p["user_id"], "display_name": p.get("display_name"), "username": "",
            "avatar_url": p.get("photo_url") or (photos[0] if photos else None), "trading_style": p.get("trading_style"),
            "age": p.get("age"), "location": p.get("location"), "mingle": True}


async def mingle_summaries(user_ids: list) -> dict:
    ids = list({u for u in user_ids if u})
    if not ids:
        return {}
    out = {}
    async for p in db.mingle_profiles.find({"user_id": {"$in": ids}}, NO_ID):
        out[p["user_id"]] = mingle_summary(p)
    return {i: out.get(i) or mingle_summary(None, i) for i in ids}


# ---------------------------------------------------------------------------
# Object storage
# ---------------------------------------------------------------------------
storage_key: Optional[str] = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    global storage_key
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503:
        storage_key = None
        key = init_storage()
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    if resp.status_code == 402:
        raise HTTPException(status_code=402, detail="Storage credits exhausted. Please add balance.")
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


async def ensure_indexes():
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("email_normalized", unique=True)
    await db.users.create_index("username", unique=True, sparse=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
    await db.posts.create_index([("created_at", -1)])
    await db.posts.create_index("author_id")
    await db.posts.create_index("post_id", unique=True)
    await db.likes.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.bookmarks.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.comments.create_index("post_id")
    await db.comment_likes.create_index([("comment_id", 1), ("user_id", 1)], unique=True)
    await db.follows.create_index([("follower_id", 1), ("following_id", 1)], unique=True)
    await db.follows.create_index("following_id")
    await db.conversations.create_index("participants")
    await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
    await db.mingle_profiles.create_index("user_id", unique=True)
    await db.mingle_actions.create_index([("from_id", 1), ("to_id", 1)], unique=True)
    await db.mingle_blocks.create_index([("blocker_id", 1), ("blocked_id", 1)], unique=True)
    await db.mingle_connections.create_index("participants")
    await db.billing_waitlist.create_index("user_id", unique=True)
