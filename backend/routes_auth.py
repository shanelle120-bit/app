import re
import secrets
from hashlib import sha256
from datetime import timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from core import (
    db, NO_ID, now_utc, new_id, aware, normalized_email, password_hash, DUMMY_HASH,
    make_access_token, get_current_user, public_user, RESET_CODE_MINUTES, logger, sync_admin_flag,
    enforce_account_status,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class SignupBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=60)
    age_confirmed: bool = False
    agreed_to_terms: bool = False


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotBody(BaseModel):
    email: EmailStr


class ResetBody(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8, max_length=128)


class SessionBody(BaseModel):
    session_id: str = Field(min_length=1)


def _hash_code(code: str) -> str:
    return sha256(code.encode()).hexdigest()


async def unique_username(base: str) -> str:
    slug = re.sub(r"[^a-z0-9_]", "", base.lower().replace(" ", "_"))[:20] or "trader"
    candidate = slug
    i = 0
    while await db.users.find_one({"username": candidate}, NO_ID):
        i += 1
        candidate = f"{slug}{secrets.randbelow(9000) + 1000 if i > 3 else i}"
    return candidate


def base_user(email: str, display_name: str, providers: list, avatar_url: Optional[str] = None) -> dict:
    now = now_utc()
    return {
        "user_id": new_id("user"),
        "email": email,
        "email_normalized": email,
        "password_hash": None,
        "auth_providers": providers,
        "display_name": display_name,
        "username": None,
        "bio": "",
        "avatar_url": avatar_url,
        "cover_url": None,
        "markets": [],
        "instruments": [],
        "trading_style": None,
        "trading_session": None,
        "followers_count": 0,
        "following_count": 0,
        "posts_count": 0,
        "onboarding_complete": False,
        "is_verified": False,
        "is_founding_member": False,
        "created_at": now,
        "password_changed_at": None,
        "deleted_at": None,
        "age_confirmed": False,
        "agreed_to_terms": False,
        "consent_at": None,
        "has_seen_trading_disclaimer": False,
        "has_seen_mingle_safety": False,
        "is_admin": False,
        "account_status": "active",
        "account_status_reason": None,
        "account_status_at": None,
    }


@router.post("/signup", status_code=201)
async def signup(body: SignupBody):
    if not body.age_confirmed or not body.agreed_to_terms:
        raise HTTPException(
            status_code=422,
            detail="You must confirm you are 18+ and agree to the Terms of Service and Privacy Policy",
        )
    email = normalized_email(str(body.email))
    if await db.users.find_one({"email_normalized": email}, NO_ID):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    doc = base_user(email, body.display_name.strip(), ["password"])
    doc["password_hash"] = password_hash.hash(body.password)
    doc["password_changed_at"] = now_utc()
    doc["username"] = await unique_username(body.display_name)
    doc["age_confirmed"] = True
    doc["agreed_to_terms"] = True
    doc["consent_at"] = now_utc()
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    doc = await sync_admin_flag(doc)
    return {
        "access_token": make_access_token(doc["user_id"], email, "password"),
        "token_type": "bearer",
        "user": public_user(doc, include_private=True),
    }


@router.post("/login")
async def login(body: LoginBody):
    email = normalized_email(str(body.email))
    user = await db.users.find_one({"email_normalized": email, "deleted_at": None}, NO_ID)
    stored = user.get("password_hash") if user else None
    if not password_hash.verify(body.password, stored or DUMMY_HASH) or not stored:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    enforce_account_status(user)
    user = await sync_admin_flag(user)
    return {
        "access_token": make_access_token(user["user_id"], user["email"], "password"),
        "token_type": "bearer",
        "user": public_user(user, include_private=True),
    }


@router.post("/forgot-password")
async def forgot_password(body: ForgotBody):
    email = normalized_email(str(body.email))
    user = await db.users.find_one({"email_normalized": email, "deleted_at": None}, NO_ID)
    response = {"message": "If an account exists for this email, a reset code has been sent."}
    if user:
        code = f"{secrets.randbelow(1000000):06d}"
        await db.password_resets.delete_many({"user_id": user["user_id"]})
        await db.password_resets.insert_one({
            "user_id": user["user_id"],
            "code_hash": _hash_code(code),
            "expires_at": now_utc() + timedelta(minutes=RESET_CODE_MINUTES),
            "created_at": now_utc(),
        })
        # No email provider is configured yet: surface the code so the flow is usable in preview.
        logger.info("Password reset code issued for %s", email)
        response["dev_code"] = code
    return response


@router.post("/reset-password")
async def reset_password(body: ResetBody):
    email = normalized_email(str(body.email))
    user = await db.users.find_one({"email_normalized": email, "deleted_at": None}, NO_ID)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    token_doc = await db.password_resets.find_one(
        {"user_id": user["user_id"], "code_hash": _hash_code(body.code)}, NO_ID
    )
    if not token_doc or aware(token_doc["expires_at"]) <= now_utc():
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "password_hash": password_hash.hash(body.new_password),
            "password_changed_at": now_utc(),
        }, "$addToSet": {"auth_providers": "password"}},
    )
    await db.password_resets.delete_many({"user_id": user["user_id"]})
    return {"message": "Password reset successfully"}


@router.post("/session")
async def exchange_session(body: SessionBody):
    """Exchange an Emergent Google-auth session_id for our own session token."""
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    data = resp.json()
    email = normalized_email(data.get("email", ""))
    if not email:
        raise HTTPException(status_code=401, detail="Google account has no email")

    user = await db.users.find_one({"email_normalized": email}, NO_ID)
    if user:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$addToSet": {"auth_providers": "google"},
             "$set": {"avatar_url": user.get("avatar_url") or data.get("picture"), "deleted_at": None}},
        )
        user = await db.users.find_one({"user_id": user["user_id"]}, NO_ID)
    else:
        user = base_user(email, data.get("name") or email.split("@")[0], ["google"], data.get("picture"))
        user["username"] = await unique_username(user["display_name"])
        await db.users.insert_one(user)
        user.pop("_id", None)

    user = await sync_admin_flag(user)
    enforce_account_status(user)
    session_token = data["session_token"]
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(days=7),
    })
    return {"session_token": session_token, "user": public_user(user, include_private=True)}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return public_user(user, include_private=True)


@router.delete("/me", status_code=200)
async def delete_account(user=Depends(get_current_user)):
    """Soft-delete the account: marks deleted_at (matching the app's existing soft-delete
    convention already used everywhere users are looked up), and drops any active Google
    session tokens. JWTs stop working immediately because `resolve_token` re-fetches the
    user filtered by deleted_at=None on every request."""
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"deleted_at": now_utc()}})
    await db.user_sessions.delete_many({"user_id": user["user_id"]})
    return {"message": "Your account has been deleted."}


@router.post("/logout")
async def logout(request: Request, user=Depends(get_current_user)):
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    return {"message": "Logged out"}
