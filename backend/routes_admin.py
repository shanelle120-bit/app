"""Admin tools: user management, moderation queue, premium/founding grants, audit log,
announcements. Everything here is additive — it does not change how normal members post,
message, or use Premium/Mingle/Accountability/Trading Only.

Design notes:
- Suspend/unsuspend/ban/restore share one endpoint (`account-status`) since they are the
  same underlying field transition (active <-> suspended/banned); the audit log still
  records the precise action name for a clean history.
- Complimentary/Founding Premium is granted via `membership.source = "admin_grant"`
  (never touches `stripe_customer_id`/`stripe_subscription_id`) so it can never be
  confused with, or interfere with, a real Stripe subscription. Revoking is blocked
  if the member's current membership came from Stripe — that must be managed in Stripe,
  never overwritten here.
- Reports are a single `reports` collection shared by posts/comments/profiles/messages/
  Mingle users (Mingle's own existing `/mingle/report` endpoint now dual-writes here too).
"""
import re
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core import (
    db, NO_ID, now_utc, new_id, get_current_user, require_admin, author_summary, users_map,
    write_audit, aware,
)
from routes_activity import notify

router = APIRouter(tags=["admin"])

ReasonStr = Field(min_length=3, max_length=500)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@router.get("/admin/dashboard")
async def dashboard(_admin=Depends(require_admin)):
    since_7d = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    from datetime import timedelta
    since_7d = since_7d - timedelta(days=7)

    total_users = await db.users.count_documents({"deleted_at": None})
    active_users = await db.users.count_documents({"deleted_at": None, "account_status": {"$nin": ["suspended", "banned"]}})
    new_signups_7d = await db.users.count_documents({"deleted_at": None, "created_at": {"$gte": since_7d}})
    premium_users = await db.users.count_documents({"deleted_at": None, "membership.tier": "premium"})
    trial_users = await db.users.count_documents({"deleted_at": None, "subscription_status": "trialing"})
    complimentary_users = await db.users.count_documents({"deleted_at": None, "membership.source": "admin_grant", "membership.tier": "premium"})
    founding_members = await db.users.count_documents({"deleted_at": None, "is_founding_member": True})
    suspended = await db.users.count_documents({"deleted_at": None, "account_status": "suspended"})
    banned = await db.users.count_documents({"deleted_at": None, "account_status": "banned"})
    open_reports = await db.reports.count_documents({"status": "open"})

    return {
        "total_users": total_users,
        "active_users": active_users,
        "new_signups_7d": new_signups_7d,
        "free_users": max(0, total_users - premium_users),
        "premium_users": premium_users,
        "trial_users": trial_users,
        "complimentary_premium_users": complimentary_users,
        "founding_members": founding_members,
        "suspended_users": suspended,
        "banned_users": banned,
        "open_reports": open_reports,
    }


# ---------------------------------------------------------------------------
# User detail (profile + membership + moderation history + safety summary)
# ---------------------------------------------------------------------------
async def _user_or_404(user_id: str) -> dict:
    user = await db.users.find_one({"user_id": user_id}, NO_ID)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/admin/users/{user_id}")
async def admin_user_detail(user_id: str, _admin=Depends(require_admin)):
    u = await _user_or_404(user_id)
    membership = u.get("membership") or {}

    notes = [n async for n in db.admin_notes.find({"user_id": user_id}, NO_ID).sort("created_at", -1).limit(100)]
    history = [a async for a in db.audit_log.find({"target_id": user_id}, NO_ID).sort("created_at", -1).limit(50)]
    reports_filed = await db.reports.count_documents({"reporter_id": user_id})
    reports_received = await db.reports.count_documents({"target_id": user_id})
    blocks_given = await db.mingle_blocks.count_documents({"blocker_id": user_id})
    blocks_received = await db.mingle_blocks.count_documents({"blocked_id": user_id})

    return {
        "user_id": u["user_id"],
        "display_name": u.get("display_name"),
        "username": u.get("username"),
        "email": u.get("email"),
        "avatar_url": u.get("avatar_url"),
        "bio": u.get("bio"),
        "created_at": u.get("created_at").isoformat() if u.get("created_at") else None,
        "deleted": bool(u.get("deleted_at")),
        "is_admin": bool(u.get("is_admin")),
        "account_status": u.get("account_status", "active"),
        "account_status_reason": u.get("account_status_reason"),
        "account_status_at": u.get("account_status_at").isoformat() if u.get("account_status_at") else None,
        "membership": {
            "tier": membership.get("tier", "free"),
            "plan": membership.get("plan"),
            "source": membership.get("source"),
            "since": membership.get("since").isoformat() if membership.get("since") else None,
            "current_period_end": membership.get("current_period_end"),
            "cancel_at_period_end": membership.get("cancel_at_period_end", False),
        },
        "subscription_status": u.get("subscription_status"),
        "stripe_customer_id": u.get("stripe_customer_id"),
        "stripe_subscription_id": u.get("stripe_subscription_id"),
        "is_founding_member": bool(u.get("is_founding_member")),
        "is_complimentary_premium": membership.get("source") == "admin_grant",
        "notes": [{"note_id": n["note_id"], "text": n["text"], "author_name": n.get("author_name"),
                   "created_at": n["created_at"].isoformat()} for n in notes],
        "history": [{"action": h["action"], "admin_name": h.get("admin_name"), "reason": h.get("reason"),
                     "changes": h.get("changes"), "created_at": h["created_at"].isoformat()} for h in history],
        "safety": {
            "reports_filed": reports_filed,
            "reports_received": reports_received,
            "mingle_blocks_given": blocks_given,
            "mingle_blocks_received": blocks_received,
        },
    }


def _guard_not_self(admin: dict, user_id: str, message: str):
    if admin["user_id"] == user_id:
        raise HTTPException(status_code=400, detail=message)


# ---------------------------------------------------------------------------
# Suspend / unsuspend / ban / restore (one field transition, four verbs for the audit log)
# ---------------------------------------------------------------------------
class AccountStatusBody(BaseModel):
    status: Literal["active", "suspended", "banned"]
    reason: str = ReasonStr


@router.post("/admin/users/{user_id}/account-status")
async def set_account_status(user_id: str, body: AccountStatusBody, admin=Depends(require_admin)):
    _guard_not_self(admin, user_id, "You cannot suspend, ban, or restore your own account.")
    u = await _user_or_404(user_id)
    before = u.get("account_status", "active")
    if before == body.status:
        raise HTTPException(status_code=400, detail=f"Account is already {body.status}")

    action = body.status if before == "active" else ("restore" if body.status == "active" and before == "banned" else "unsuspend" if body.status == "active" else body.status)
    await db.users.update_one({"user_id": user_id}, {"$set": {
        "account_status": body.status,
        "account_status_reason": body.reason,
        "account_status_at": now_utc(),
    }})
    if body.status != "active":
        await db.user_sessions.delete_many({"user_id": user_id})  # kill active Google sessions immediately
    await write_audit(admin, action, "user", user_id, u.get("display_name"), body.reason, {"from": before, "to": body.status})
    return {"user_id": user_id, "account_status": body.status}


# ---------------------------------------------------------------------------
# Admin roles
# ---------------------------------------------------------------------------
class AdminRoleBody(BaseModel):
    grant: bool
    reason: str = ReasonStr


@router.post("/admin/users/{user_id}/admin-role")
async def set_admin_role(user_id: str, body: AdminRoleBody, admin=Depends(require_admin)):
    if not body.grant:
        _guard_not_self(admin, user_id, "You cannot revoke your own admin access.")
    u = await _user_or_404(user_id)
    await db.users.update_one({"user_id": user_id}, {"$set": {"is_admin": body.grant}})
    await write_audit(admin, "grant_admin" if body.grant else "revoke_admin", "user", user_id, u.get("display_name"), body.reason)
    return {"user_id": user_id, "is_admin": body.grant}


# ---------------------------------------------------------------------------
# Premium / Founding grants (never touches Stripe fields)
# ---------------------------------------------------------------------------
class PremiumGrantBody(BaseModel):
    plan: Literal["complimentary", "founding"]
    reason: str = ReasonStr


@router.post("/admin/users/{user_id}/premium-grant")
async def grant_premium(user_id: str, body: PremiumGrantBody, admin=Depends(require_admin)):
    u = await _user_or_404(user_id)
    existing_membership = u.get("membership") or {}
    since = aware(existing_membership.get("since")) or now_utc()
    updates = {
        "membership": {
            "tier": "premium",
            "plan": "complimentary",
            "since": since,
            "source": "admin_grant",
            "current_period_end": None,
            "cancel_at_period_end": False,
        }
    }
    if body.plan == "founding":
        updates["is_founding_member"] = True
    await db.users.update_one({"user_id": user_id}, {"$set": updates})
    await write_audit(admin, f"premium_grant_{body.plan}", "user", user_id, u.get("display_name"), body.reason)
    return {"user_id": user_id, "membership": updates["membership"], "is_founding_member": updates.get("is_founding_member", bool(u.get("is_founding_member")))}


class PremiumRevokeBody(BaseModel):
    reason: str = ReasonStr
    revoke_founding: bool = False


@router.post("/admin/users/{user_id}/premium-revoke")
async def revoke_premium(user_id: str, body: PremiumRevokeBody, admin=Depends(require_admin)):
    u = await _user_or_404(user_id)
    membership = u.get("membership") or {}
    if membership.get("tier") == "premium" and membership.get("source") == "stripe":
        raise HTTPException(status_code=400, detail="This member has a real Stripe subscription. Manage it in Stripe, not here.")
    updates = {"membership": {"tier": "free", "plan": None, "since": membership.get("since"),
                               "source": "admin_grant_revoked", "current_period_end": None, "cancel_at_period_end": False}}
    if body.revoke_founding:
        updates["is_founding_member"] = False
    await db.users.update_one({"user_id": user_id}, {"$set": updates})
    await write_audit(admin, "premium_revoke", "user", user_id, u.get("display_name"), body.reason, {"revoke_founding": body.revoke_founding})
    return {"user_id": user_id, "membership": updates["membership"]}


# ---------------------------------------------------------------------------
# Admin notes (private, internal)
# ---------------------------------------------------------------------------
class NoteBody(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("/admin/users/{user_id}/notes", status_code=201)
async def add_note(user_id: str, body: NoteBody, admin=Depends(require_admin)):
    await _user_or_404(user_id)
    note = {"note_id": new_id("note"), "user_id": user_id, "author_admin_id": admin["user_id"],
            "author_name": admin.get("display_name") or admin.get("email"), "text": body.text.strip(), "created_at": now_utc()}
    await db.admin_notes.insert_one(note)
    await write_audit(admin, "add_note", "user", user_id, None, None, {"note_preview": body.text.strip()[:80]})
    note.pop("_id", None)
    note["created_at"] = note["created_at"].isoformat()
    return note


# ---------------------------------------------------------------------------
# Warn a user (standalone, or via report resolution below)
# ---------------------------------------------------------------------------
class WarnBody(BaseModel):
    message: str = Field(min_length=3, max_length=1000)
    reason: str = ReasonStr


@router.post("/admin/users/{user_id}/warn")
async def warn_user(user_id: str, body: WarnBody, admin=Depends(require_admin)):
    u = await _user_or_404(user_id)
    await notify(user_id, admin["user_id"], "admin_warning", text=body.message)
    await write_audit(admin, "warn_user", "user", user_id, u.get("display_name"), body.reason, {"message": body.message})
    return {"warned": True}


# ---------------------------------------------------------------------------
# Account deletion (admin-initiated, per Account & Data Deletion Policy)
# ---------------------------------------------------------------------------
class DeleteAccountBody(BaseModel):
    reason: str = ReasonStr


@router.post("/admin/users/{user_id}/delete-account")
async def admin_delete_account(user_id: str, body: DeleteAccountBody, admin=Depends(require_admin)):
    _guard_not_self(admin, user_id, "You cannot delete your own account from here — use Profile settings.")
    u = await _user_or_404(user_id)
    if u.get("deleted_at"):
        raise HTTPException(status_code=400, detail="This account is already deleted")
    await db.users.update_one({"user_id": user_id}, {"$set": {"deleted_at": now_utc()}})
    await db.user_sessions.delete_many({"user_id": user_id})
    await write_audit(admin, "delete_account", "user", user_id, u.get("display_name"), body.reason)
    return {"user_id": user_id, "deleted": True}


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------
@router.get("/admin/audit-log")
async def audit_log(limit: int = Query(default=200, le=500), _admin=Depends(require_admin)):
    items = [a async for a in db.audit_log.find({}, NO_ID).sort("created_at", -1).limit(limit)]
    for a in items:
        a["created_at"] = a["created_at"].isoformat()
    return {"items": items, "count": len(items)}


# ---------------------------------------------------------------------------
# Reports & moderation queue
# ---------------------------------------------------------------------------
class ReportCreateBody(BaseModel):
    target_type: Literal["post", "comment", "profile", "message", "mingle_user"]
    target_id: str
    reason: str = ReasonStr
    details: Optional[str] = Field(default=None, max_length=1000)


@router.post("/reports", status_code=201)
async def create_report(body: ReportCreateBody, user=Depends(get_current_user)):
    """User-facing: report a post, comment, profile, message, or Mingle member. Feeds the admin moderation queue."""
    doc = {
        "report_id": new_id("rpt"), "reporter_id": user["user_id"], "target_type": body.target_type,
        "target_id": body.target_id, "reason": body.reason, "details": body.details,
        "status": "open", "resolution": None, "resolution_note": None,
        "resolved_by": None, "resolved_at": None, "created_at": now_utc(),
    }
    await db.reports.insert_one(doc)
    return {"reported": True, "report_id": doc["report_id"]}


async def _content_preview(target_type: str, target_id: str) -> dict:
    if target_type == "post":
        p = await db.posts.find_one({"post_id": target_id}, NO_ID)
        if not p:
            return {"summary": "Post not found (may already be removed)", "removed": True}
        author = await db.users.find_one({"user_id": p["author_id"]}, NO_ID)
        return {"summary": (p.get("text") or "(media only)")[:200], "author": author_summary(author), "removed": bool(p.get("deleted_at"))}
    if target_type == "comment":
        c = await db.comments.find_one({"comment_id": target_id}, NO_ID)
        if not c:
            return {"summary": "Comment not found (may already be removed)", "removed": True}
        author = await db.users.find_one({"user_id": c["author_id"]}, NO_ID)
        return {"summary": (c.get("text") or "(GIF only)")[:200], "author": author_summary(author), "post_id": c.get("post_id"), "removed": bool(c.get("deleted_at"))}
    if target_type == "message":
        m = await db.messages.find_one({"message_id": target_id}, NO_ID)
        if not m:
            return {"summary": "Message not found (may already be removed)", "removed": True}
        sender = await db.users.find_one({"user_id": m["sender_id"]}, NO_ID)
        return {"summary": (m.get("text") or "(media message)")[:200], "author": author_summary(sender), "conversation_id": m.get("conversation_id"), "removed": bool(m.get("deleted_at"))}
    if target_type in ("profile", "mingle_user"):
        u = await db.users.find_one({"user_id": target_id}, NO_ID)
        return {"summary": (u or {}).get("bio") or "", "author": author_summary(u), "removed": bool((u or {}).get("deleted_at"))}
    return {"summary": ""}


@router.get("/admin/reports")
async def list_reports(status: Optional[Literal["open", "resolved"]] = None,
                        target_type: Optional[Literal["post", "comment", "profile", "message", "mingle_user"]] = None,
                        _admin=Depends(require_admin)):
    query: dict = {}
    if status:
        query["status"] = status
    if target_type:
        query["target_type"] = target_type
    items = [r async for r in db.reports.find(query, NO_ID).sort("created_at", -1).limit(300)]
    reporter_map = await users_map([r["reporter_id"] for r in items])
    out = []
    for r in items:
        preview = await _content_preview(r["target_type"], r["target_id"])
        out.append({
            "report_id": r["report_id"],
            "target_type": r["target_type"],
            "target_id": r["target_id"],
            "reason": r["reason"],
            "details": r.get("details"),
            "status": r["status"],
            "resolution": r.get("resolution"),
            "resolution_note": r.get("resolution_note"),
            "reporter": author_summary(reporter_map.get(r["reporter_id"])),
            "content": preview,
            "created_at": r["created_at"].isoformat(),
            "resolved_at": r["resolved_at"].isoformat() if r.get("resolved_at") else None,
        })
    return {"items": out, "count": len(out)}


class ReportResolveBody(BaseModel):
    action: Literal["dismiss", "remove_content", "warn_user"]
    note: Optional[str] = Field(default=None, max_length=1000)
    warn_message: Optional[str] = Field(default=None, max_length=1000)


@router.post("/admin/reports/{report_id}/resolve")
async def resolve_report(report_id: str, body: ReportResolveBody, admin=Depends(require_admin)):
    r = await db.reports.find_one({"report_id": report_id}, NO_ID)
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    if r["status"] == "resolved":
        raise HTTPException(status_code=400, detail="Report already resolved")

    if body.action == "remove_content":
        if r["target_type"] == "post":
            await db.posts.update_one({"post_id": r["target_id"]}, {"$set": {"deleted_at": now_utc(), "moderated_by": admin["user_id"], "moderation_reason": body.note}})
        elif r["target_type"] == "comment":
            await db.comments.update_one({"comment_id": r["target_id"]}, {"$set": {"deleted_at": now_utc(), "moderated_by": admin["user_id"], "moderation_reason": body.note}})
        elif r["target_type"] == "message":
            await db.messages.update_one({"message_id": r["target_id"]}, {"$set": {"deleted_at": now_utc(), "moderated_by": admin["user_id"], "moderation_reason": body.note}})
        # profile/mingle_user: no direct content to remove — use account-status actions on the user instead.
    elif body.action == "warn_user":
        author_id = (await _content_preview(r["target_type"], r["target_id"])).get("author", {}).get("user_id")
        if author_id:
            await notify(author_id, admin["user_id"], "admin_warning", text=body.warn_message or "Please review our community guidelines.")

    await db.reports.update_one({"report_id": report_id}, {"$set": {
        "status": "resolved", "resolution": body.action, "resolution_note": body.note,
        "resolved_by": admin["user_id"], "resolved_at": now_utc(),
    }})
    await write_audit(admin, f"report_{body.action}", r["target_type"], r["target_id"], None, body.note, {"report_id": report_id})
    return {"report_id": report_id, "status": "resolved", "resolution": body.action}


# ---------------------------------------------------------------------------
# Direct content moderation (remove/restore without going through a report)
# ---------------------------------------------------------------------------
class ModerateBody(BaseModel):
    reason: str = ReasonStr


@router.post("/admin/posts/{post_id}/remove")
async def admin_remove_post(post_id: str, body: ModerateBody, admin=Depends(require_admin)):
    res = await db.posts.update_one({"post_id": post_id, "deleted_at": None},
                                     {"$set": {"deleted_at": now_utc(), "moderated_by": admin["user_id"], "moderation_reason": body.reason}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Post not found or already removed")
    await write_audit(admin, "remove_post", "post", post_id, None, body.reason)
    return {"post_id": post_id, "removed": True}


@router.post("/admin/posts/{post_id}/restore")
async def admin_restore_post(post_id: str, body: ModerateBody, admin=Depends(require_admin)):
    res = await db.posts.update_one({"post_id": post_id}, {"$set": {"deleted_at": None, "moderated_by": None, "moderation_reason": None}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Post not found")
    await write_audit(admin, "restore_post", "post", post_id, None, body.reason)
    return {"post_id": post_id, "removed": False}


@router.post("/admin/comments/{comment_id}/remove")
async def admin_remove_comment(comment_id: str, body: ModerateBody, admin=Depends(require_admin)):
    res = await db.comments.update_one({"comment_id": comment_id, "deleted_at": None},
                                        {"$set": {"deleted_at": now_utc(), "moderated_by": admin["user_id"], "moderation_reason": body.reason}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Comment not found or already removed")
    await write_audit(admin, "remove_comment", "comment", comment_id, None, body.reason)
    return {"comment_id": comment_id, "removed": True}


@router.post("/admin/comments/{comment_id}/restore")
async def admin_restore_comment(comment_id: str, body: ModerateBody, admin=Depends(require_admin)):
    res = await db.comments.update_one({"comment_id": comment_id}, {"$set": {"deleted_at": None, "moderated_by": None, "moderation_reason": None}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Comment not found")
    await write_audit(admin, "restore_comment", "comment", comment_id, None, body.reason)
    return {"comment_id": comment_id, "removed": False}


# ---------------------------------------------------------------------------
# Announcements — a single official pinned post, kept separate from normal posting.
# ---------------------------------------------------------------------------
class AnnouncementBody(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=2000)


@router.get("/announcements/active")
async def active_announcement(user=Depends(get_current_user)):
    a = await db.announcements.find_one({"active": True}, NO_ID, sort=[("created_at", -1)])
    if not a:
        return None
    return {"announcement_id": a["announcement_id"], "title": a["title"], "body": a["body"], "created_at": a["created_at"].isoformat()}


@router.get("/admin/announcements")
async def list_announcements(_admin=Depends(require_admin)):
    items = [a async for a in db.announcements.find({}, NO_ID).sort("created_at", -1).limit(100)]
    for a in items:
        a["created_at"] = a["created_at"].isoformat()
    return {"items": items, "count": len(items)}


@router.post("/admin/announcements", status_code=201)
async def create_announcement(body: AnnouncementBody, admin=Depends(require_admin)):
    # Only one pinned announcement at a time — retire any previously-active one.
    await db.announcements.update_many({"active": True}, {"$set": {"active": False}})
    doc = {
        "announcement_id": new_id("ann"), "title": body.title.strip(), "body": body.body.strip(),
        "pinned": True, "active": True, "created_by": admin["user_id"],
        "created_by_name": admin.get("display_name") or admin.get("email"), "created_at": now_utc(),
    }
    await db.announcements.insert_one(doc)
    await write_audit(admin, "create_announcement", "announcement", doc["announcement_id"], body.title, None)
    doc.pop("_id", None)
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


@router.post("/admin/announcements/{announcement_id}/unpin")
async def unpin_announcement(announcement_id: str, admin=Depends(require_admin)):
    res = await db.announcements.update_one({"announcement_id": announcement_id}, {"$set": {"active": False}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Announcement not found")
    await write_audit(admin, "unpin_announcement", "announcement", announcement_id, None, None)
    return {"announcement_id": announcement_id, "active": False}
