from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core import db, NO_ID, now_utc, new_id, get_current_user, author_summary, users_map, mingle_blocked_ids

router = APIRouter(tags=["chat"])


class ConversationCreate(BaseModel):
    user_id: str


class MessageCreate(BaseModel):
    text: str = Field(default="", max_length=2000)
    gif_url: Optional[str] = None
    image_url: Optional[str] = None


def other_participant(conv: dict, me: str) -> str:
    return next((p for p in conv["participants"] if p != me), me)


async def get_conversation_or_404(conversation_id: str, me: str) -> dict:
    conv = await db.conversations.find_one({"conversation_id": conversation_id, "participants": me}, NO_ID)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.get("/conversations")
async def list_conversations(user=Depends(get_current_user)):
    me = user["user_id"]
    cursor = db.conversations.find({"participants": me}, NO_ID).sort("last_message_at", -1).limit(100)
    convs = [c async for c in cursor]
    umap = await users_map([other_participant(c, me) for c in convs])
    out = []
    for c in convs:
        other = other_participant(c, me)
        unread = await db.messages.count_documents({
            "conversation_id": c["conversation_id"], "sender_id": {"$ne": me},
            "created_at": {"$gt": c.get("last_read", {}).get(me, datetime(1970, 1, 1))},
        })
        out.append({
            "conversation_id": c["conversation_id"],
            "other_user": author_summary(umap.get(other)),
            "last_message": c.get("last_message"),
            "last_message_at": c.get("last_message_at"),
            "unread_count": unread,
        })
    return out


@router.post("/conversations", status_code=201)
async def create_conversation(body: ConversationCreate, user=Depends(get_current_user)):
    me = user["user_id"]
    if body.user_id == me:
        raise HTTPException(status_code=400, detail="You cannot message yourself")
    other = await db.users.find_one({"user_id": body.user_id, "deleted_at": None}, NO_ID)
    if not other:
        raise HTTPException(status_code=404, detail="Trader not found")
    conv = await db.conversations.find_one({"participants": {"$all": [me, body.user_id], "$size": 2}}, NO_ID)
    if not conv:
        conv = {
            "conversation_id": new_id("conv"),
            "participants": [me, body.user_id],
            "last_message": None,
            "last_message_at": now_utc(),
            "last_read": {},
            "created_at": now_utc(),
        }
        await db.conversations.insert_one(conv)
        conv.pop("_id", None)
    return {
        "conversation_id": conv["conversation_id"],
        "other_user": author_summary(other),
        "last_message": conv.get("last_message"),
        "last_message_at": conv.get("last_message_at"),
        "unread_count": 0,
    }


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user=Depends(get_current_user)):
    me = user["user_id"]
    conv = await get_conversation_or_404(conversation_id, me)
    other = await db.users.find_one({"user_id": other_participant(conv, me)}, NO_ID)
    return {"conversation_id": conv["conversation_id"], "other_user": author_summary(other)}


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(conversation_id: str, after: Optional[datetime] = None,
                        limit: int = Query(default=100, le=200), user=Depends(get_current_user)):
    me = user["user_id"]
    await get_conversation_or_404(conversation_id, me)
    query = {"conversation_id": conversation_id}
    if after:
        query["created_at"] = {"$gt": after}
    cursor = db.messages.find(query, NO_ID).sort("created_at", -1).limit(limit)
    msgs = [m async for m in cursor]
    msgs.reverse()
    for m in msgs:
        m["is_mine"] = m["sender_id"] == me
    await db.conversations.update_one({"conversation_id": conversation_id},
                                      {"$set": {f"last_read.{me}": now_utc()}})
    return msgs


@router.post("/conversations/{conversation_id}/messages", status_code=201)
async def send_message(conversation_id: str, body: MessageCreate, user=Depends(get_current_user)):
    me = user["user_id"]
    conv = await get_conversation_or_404(conversation_id, me)
    if other_participant(conv, me) in await mingle_blocked_ids(me):
        raise HTTPException(status_code=403, detail="You can't message this member")
    text = body.text.strip()
    if not text and not body.gif_url and not body.image_url:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    msg = {
        "message_id": new_id("msg"),
        "conversation_id": conversation_id,
        "sender_id": me,
        "text": text,
        "gif_url": body.gif_url,
        "image_url": body.image_url,
        "created_at": now_utc(),
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    preview = text or ("GIF" if body.gif_url else "Photo")
    await db.conversations.update_one(
        {"conversation_id": conversation_id},
        {"$set": {"last_message": preview, "last_message_at": msg["created_at"], f"last_read.{me}": msg["created_at"]}},
    )
    msg["is_mine"] = True
    return msg
