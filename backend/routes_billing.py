"""Real Stripe billing: hosted Payment Link checkout + webhook sync + Customer Portal.

Replaces the old free/mocked "preview activation" tier gate. The Payment Link itself
(pricing, 14-day trial, card requirement) is configured in the Stripe Dashboard; this
module only correlates checkouts back to our users and keeps `users.membership` in sync
via verified webhooks (never trusting the client-side redirect as the source of truth).
"""
import os
from datetime import datetime, timezone
from urllib.parse import urlencode

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pymongo.errors import DuplicateKeyError

from core import db, NO_ID, now_utc, new_id, get_current_user, aware, logger

router = APIRouter(tags=["billing"])

STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PAYMENT_LINK = os.environ.get("STRIPE_PAYMENT_LINK", "")
BACKEND_PUBLIC_URL = os.environ.get("BACKEND_PUBLIC_URL", "")
stripe.api_key = STRIPE_SECRET_KEY

ACTIVE_STATUSES = {"trialing", "active"}

# "Founding Member" — permanent, one-way badge for anyone whose FIRST premium
# activation lands on or before this cutoff. Never revoked, even if they later cancel.
FOUNDING_MEMBER_CUTOFF = datetime(2026, 10, 15, 23, 59, 59, tzinfo=timezone.utc)


@router.post("/billing/checkout-link")
async def checkout_link(user=Depends(get_current_user)):
    """Return a one-time, user-bound URL to our existing Stripe Payment Link
    (monthly plan, 14-day free trial, card required — configured in Stripe)."""
    if not STRIPE_PAYMENT_LINK:
        raise HTTPException(status_code=503, detail="Billing is not configured yet")
    token = new_id("cktok")
    await db.checkout_tokens.insert_one({"token": token, "user_id": user["user_id"], "used": False, "created_at": now_utc()})
    params = urlencode({"client_reference_id": token, "prefilled_email": user.get("email") or ""})
    sep = "&" if "?" in STRIPE_PAYMENT_LINK else "?"
    return {"url": f"{STRIPE_PAYMENT_LINK}{sep}{params}"}


@router.post("/billing/portal")
async def billing_portal(user=Depends(get_current_user)):
    """Open the Stripe Customer Portal so the member can view invoices, update their
    card, or cancel — including cancelling free with zero charge during the trial."""
    fresh = await db.users.find_one({"user_id": user["user_id"]}, NO_ID)
    customer_id = fresh.get("stripe_customer_id") if fresh else None
    if not customer_id:
        raise HTTPException(status_code=400, detail="No subscription found to manage yet")
    try:
        session = await run_in_threadpool(
            stripe.billing_portal.Session.create, customer=customer_id, return_url=BACKEND_PUBLIC_URL
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"url": session.url}


async def _set_subscription(user_id: str, *, customer_id: str, subscription_id: str, status: str,
                             current_period_end=None, cancel_at_period_end: bool = False):
    tier = "premium" if status in ACTIVE_STATUSES else "free"
    existing = await db.users.find_one({"user_id": user_id}, {"membership": 1, "is_founding_member": 1})
    existing_membership = (existing or {}).get("membership") or {}
    # Preserve the very first time this user went premium — later renewals/updates
    # must not push this date forward, since it also anchors Founding Member eligibility.
    since = aware(existing_membership.get("since")) if tier == "premium" else existing_membership.get("since")

    updates = {
        "stripe_customer_id": customer_id,
        "stripe_subscription_id": subscription_id,
        "subscription_status": status,
    }

    if tier == "premium":
        if not since:
            since = now_utc()
        if not (existing or {}).get("is_founding_member") and since <= FOUNDING_MEMBER_CUTOFF:
            updates["is_founding_member"] = True

    updates["membership"] = {
        "tier": tier,
        "plan": "monthly" if tier == "premium" else None,
        "since": since,
        "source": "stripe",
        "current_period_end": current_period_end,
        "cancel_at_period_end": cancel_at_period_end,
    }
    await db.users.update_one({"user_id": user_id}, {"$set": updates})


async def _apply_checkout_completed(session_obj: dict):
    token = session_obj.get("client_reference_id")
    if not token:
        logger.warning("Stripe checkout.session.completed with no client_reference_id")
        return
    record = await db.checkout_tokens.find_one_and_update(
        {"token": token, "used": False}, {"$set": {"used": True, "used_at": now_utc()}}
    )
    if not record:
        return  # unknown or already-processed token — ignore (idempotent, no other user affected)

    customer_id = session_obj.get("customer")
    subscription_id = session_obj.get("subscription")
    if not customer_id or not subscription_id:
        return

    sub = await run_in_threadpool(stripe.Subscription.retrieve, subscription_id)
    await _set_subscription(
        record["user_id"], customer_id=customer_id, subscription_id=sub["id"], status=sub["status"],
        current_period_end=sub.get("current_period_end"), cancel_at_period_end=sub.get("cancel_at_period_end", False),
    )


async def _apply_subscription_event(sub_obj: dict, deleted: bool = False):
    customer_id = sub_obj.get("customer")
    if not customer_id:
        return
    user = await db.users.find_one({"stripe_customer_id": customer_id}, NO_ID)
    if not user:
        logger.warning("Stripe subscription event for unknown customer %s", customer_id)
        return
    if deleted:
        await _set_subscription(user["user_id"], customer_id=customer_id, subscription_id=sub_obj.get("id"), status="canceled")
    else:
        await _set_subscription(
            user["user_id"], customer_id=customer_id, subscription_id=sub_obj.get("id"), status=sub_obj.get("status"),
            current_period_end=sub_obj.get("current_period_end"), cancel_at_period_end=sub_obj.get("cancel_at_period_end", False),
        )


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature")

    try:
        await db.stripe_events.insert_one({"event_id": event["id"], "type": event["type"], "received_at": now_utc()})
    except DuplicateKeyError:
        return JSONResponse({"received": True})  # already processed — Stripe retried delivery

    obj = event["data"]["object"]
    etype = event["type"]
    if etype == "checkout.session.completed":
        await _apply_checkout_completed(obj)
    elif etype == "customer.subscription.updated":
        await _apply_subscription_event(obj)
    elif etype == "customer.subscription.deleted":
        await _apply_subscription_event(obj, deleted=True)

    return JSONResponse({"received": True})
