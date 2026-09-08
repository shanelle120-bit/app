"""Idempotent demo data so the feed is alive on first launch."""
from datetime import timedelta

from core import db, NO_ID, now_utc, new_id, password_hash, logger
from routes_activity import notify

AVATAR_1 = "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?crop=entropy&cs=srgb&fm=jpg&q=85&w=400"
AVATAR_2 = "https://images.unsplash.com/photo-1580489944761-15a19d654956?crop=entropy&cs=srgb&fm=jpg&q=85&w=400"
AVATAR_3 = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?crop=entropy&cs=srgb&fm=jpg&q=85&w=400"
AVATAR_4 = "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?crop=entropy&cs=srgb&fm=jpg&q=85&w=400"
CHART_1 = "https://images.unsplash.com/photo-1607799632518-da91dd151b38?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
CHART_2 = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
CHART_3 = "https://images.unsplash.com/photo-1642790106117-e829e14a795f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
COVER = "https://images.unsplash.com/photo-1688413708888-8368d1d99a15?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"

DEMO_EMAIL = "demo@leveluphub.com"
DEMO_PASSWORD = "Trader123!"

TRADERS = [
    dict(username="marcus_fx", display_name="Marcus Reyes", email="marcus@leveluphub.demo", avatar_url=AVATAR_1,
         bio="Full-time futures trader. NQ & ES scalps, London-NY overlap. Risk first, always.",
         markets=["Futures", "Indices"], instruments=["NQ", "ES", "CL"], trading_style="Scalper",
         trading_session="London / NY Overlap", is_verified=True),
    dict(username="sophia_swings", display_name="Sophia Chen", email="sophia@leveluphub.demo", avatar_url=AVATAR_2,
         bio="Swing trading large caps & options flow. Sharing setups, not signals.",
         markets=["Stocks", "Options"], instruments=["NVDA", "TSLA", "SPY"], trading_style="Swing Trader",
         trading_session="New York", is_verified=True),
    dict(username="devon_crypto", display_name="Devon Okafor", email="devon@leveluphub.demo", avatar_url=AVATAR_3,
         bio="On-chain nerd. BTC/ETH majors + alt rotations. Charts > opinions.",
         markets=["Crypto"], instruments=["BTC", "ETH", "SOL"], trading_style="Position Trader",
         trading_session="24/7 Crypto", is_verified=False),
    dict(username="ava_forex", display_name="Ava Lindqvist", email="ava@leveluphub.demo", avatar_url=AVATAR_4,
         bio="Forex day trader. GBPUSD + EURUSD. Session-based playbook, 2 setups a day max.",
         markets=["Forex"], instruments=["GBPUSD", "EURUSD", "XAUUSD"], trading_style="Day Trader",
         trading_session="London", is_verified=False),
]

POSTS = [
    ("marcus_fx", "NQ opening range break played out perfectly. Waited for the retest, 2R and done. "
                  "Patience pays more than prediction. #futures #NQ", [{"type": "image", "url": CHART_1}], 6),
    ("sophia_swings", "Unusual call flow on NVDA into next week. Not chasing, but this is on the watchlist. "
                      "Who else is watching semis? @marcus_fx", [], 5),
    ("devon_crypto", "BTC reclaimed the weekly level. Alts finally breathing. Scaling into SOL on pullbacks only. "
                     "Never FOMO the green candle.", [{"type": "image", "url": CHART_2}], 4),
    ("ava_forex", "GBPUSD London session recap: one clean sweep of Asia lows, displacement, and a full TP. "
                  "One trade. Closed the laptop.", [{"type": "image", "url": CHART_3}], 3),
    ("marcus_fx", "Reminder: your edge is worthless without execution discipline. Journal every trade this week. "
                  "Post your stats here Friday and let's compare.", [], 2),
    ("sophia_swings", "Weekend study: 30 charts, 3 setups, 0 trades taken. That IS the work.",
     [{"type": "gif", "url": "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif"}], 1),
]


async def seed():
    if await db.users.find_one({"email_normalized": DEMO_EMAIL}, NO_ID):
        return
    logger.info("Seeding demo data...")
    now = now_utc()
    ids = {}
    for t in TRADERS:
        doc = {
            "user_id": new_id("user"), "email": t["email"], "email_normalized": t["email"], "password_hash": None,
            "auth_providers": ["seed"], "display_name": t["display_name"], "username": t["username"], "bio": t["bio"],
            "avatar_url": t["avatar_url"], "cover_url": COVER, "markets": t["markets"], "instruments": t["instruments"],
            "trading_style": t["trading_style"], "trading_session": t["trading_session"],
            "followers_count": 0, "following_count": 0, "posts_count": 0, "onboarding_complete": True,
            "is_verified": t["is_verified"], "created_at": now - timedelta(days=40), "password_changed_at": None,
            "deleted_at": None,
        }
        await db.users.insert_one(doc)
        ids[t["username"]] = doc["user_id"]

    demo = {
        "user_id": new_id("user"), "email": DEMO_EMAIL, "email_normalized": DEMO_EMAIL,
        "password_hash": password_hash.hash(DEMO_PASSWORD), "auth_providers": ["password"],
        "display_name": "Demo Trader", "username": "demo_trader",
        "bio": "Exploring Level Up Trading Hub. Options + futures, learning every day.",
        "avatar_url": None, "cover_url": None, "markets": ["Options", "Futures"], "instruments": ["SPX", "ES"],
        "trading_style": "Day Trader", "trading_session": "New York", "followers_count": 0,
        "following_count": 0, "posts_count": 0, "onboarding_complete": True, "is_verified": False,
        "created_at": now - timedelta(days=3), "password_changed_at": now, "deleted_at": None,
    }
    await db.users.insert_one(demo)

    for username in ids:
        await db.follows.insert_one({"follower_id": demo["user_id"], "following_id": ids[username], "created_at": now})
        await db.users.update_one({"user_id": ids[username]}, {"$inc": {"followers_count": 1}})
    await db.users.update_one({"user_id": demo["user_id"]}, {"$set": {"following_count": len(ids)}})
    # traders follow each other a bit
    await db.follows.insert_one({"follower_id": ids["sophia_swings"], "following_id": ids["marcus_fx"], "created_at": now})
    await db.follows.insert_one({"follower_id": ids["devon_crypto"], "following_id": ids["marcus_fx"], "created_at": now})
    await db.users.update_one({"user_id": ids["marcus_fx"]}, {"$inc": {"followers_count": 2}})
    await db.users.update_one({"user_id": ids["sophia_swings"]}, {"$inc": {"following_count": 1}})
    await db.users.update_one({"user_id": ids["devon_crypto"]}, {"$inc": {"following_count": 1}})

    for username, text, media, hours_ago in POSTS:
        mentions = [ids["marcus_fx"]] if "@marcus_fx" in text else []
        post = {
            "post_id": new_id("post"), "author_id": ids[username], "text": text, "media": media,
            "mentions": mentions, "likes_count": 0, "comments_count": 0, "shares_count": 0,
            "created_at": now - timedelta(hours=hours_ago), "deleted_at": None,
        }
        await db.posts.insert_one(post)
        await db.users.update_one({"user_id": ids[username]}, {"$inc": {"posts_count": 1}})
        likers = [ids[u] for u in ids if u != username]
        for liker in likers:
            await db.likes.insert_one({"post_id": post["post_id"], "user_id": liker, "created_at": now})
        await db.posts.update_one({"post_id": post["post_id"]}, {"$set": {"likes_count": len(likers)}})

    first_post = await db.posts.find_one({"author_id": ids["marcus_fx"]}, NO_ID, sort=[("created_at", 1)])
    await db.comments.insert_one({
        "comment_id": new_id("cmt"), "post_id": first_post["post_id"], "author_id": ids["sophia_swings"],
        "parent_id": None, "text": "Clean execution. That retest entry is textbook.", "gif_url": None,
        "likes_count": 1, "created_at": now - timedelta(hours=5), "deleted_at": None,
    })
    await db.posts.update_one({"post_id": first_post["post_id"]}, {"$inc": {"comments_count": 1}})

    conv = {
        "conversation_id": new_id("conv"), "participants": [demo["user_id"], ids["marcus_fx"]],
        "last_message": "Welcome to the hub! What markets are you trading?",
        "last_message_at": now - timedelta(hours=1), "last_read": {}, "created_at": now - timedelta(hours=1),
    }
    await db.conversations.insert_one(conv)
    await db.messages.insert_one({
        "message_id": new_id("msg"), "conversation_id": conv["conversation_id"], "sender_id": ids["marcus_fx"],
        "text": "Welcome to the hub! What markets are you trading?", "gif_url": None, "image_url": None,
        "created_at": now - timedelta(hours=1),
    })
    logger.info("Seed complete")


MINGLE_SEED = {
    "marcus_fx": dict(age=31, location="Miami, FL", trader_type="Futures", looking_for=["Dating", "Trading Friends"],
                      bio="Scalper by day, sunset chaser by night. Looking for someone who gets the grind.",
                      favorite_instrument="NQ", interests="Boxing, jazz bars, road trips", prompt_key="red_flag",
                      prompt_answer="I check the futures open on vacation."),
    "sophia_swings": dict(age=29, location="Austin, TX", trader_type="Options", looking_for=["Friendship", "Networking"],
                          bio="Swing trader, weekend hiker, terrible at poker. Here for good people and better conversations.",
                          favorite_instrument="NVDA", interests="Hiking, wine, indie films", prompt_key="market_free",
                          prompt_answer="No screens, a trail, and tacos after."),
    "devon_crypto": dict(age=27, location="Los Angeles, CA", trader_type="Crypto", looking_for=["Open to Anything"],
                         bio="On-chain nerd who also touches grass. Ask me about SOL or sourdough.",
                         favorite_instrument="ETH", interests="Baking, basketball, synths", prompt_key="dating_trader",
                         prompt_answer="They say 'let me just check one thing' at 3am."),
    "ava_forex": dict(age=33, location="London, UK", trader_type="Forex", looking_for=["Dating"],
                      bio="London session trader. Two setups a day, then I close the laptop and live.",
                      favorite_instrument="GBPUSD", interests="Yoga, galleries, cooking", prompt_key="red_flag",
                      prompt_answer="I name my plants after currency pairs."),
}


async def seed_mingle():
    """Opt the seeded demo traders into Single & Mingle so discovery has members."""
    if await db.mingle_profiles.count_documents({}) > 0:
        return
    now = now_utc()
    async for u in db.users.find({"username": {"$in": list(MINGLE_SEED)}}, NO_ID):
        s = MINGLE_SEED[u["username"]]
        await db.mingle_profiles.insert_one({
            "user_id": u["user_id"], "display_name": u["display_name"].split(" ")[0], "photo_url": u.get("avatar_url"),
            "photos": [p for p in [u.get("avatar_url"), COVER] if p],
            "trading_style": u.get("trading_style"), **s, "active": True, "show_badge": True,
            "allow_hi_from": "everyone", "created_at": now, "deleted_at": None,
        })
    logger.info("Mingle seed complete")


async def ensure_demo_premium():
    """Keep the demo account on Premium (preview) and give its Mingle inbox something to show."""
    demo = await db.users.find_one({"email_normalized": DEMO_EMAIL}, NO_ID)
    if not demo:
        return
    if (demo.get("membership") or {}).get("tier") != "premium":
        await db.users.update_one({"user_id": demo["user_id"]}, {"$set": {"membership": {
            "tier": "premium", "plan": "yearly", "since": now_utc(), "source": "demo_seed"}}})
        logger.info("Demo account set to Premium")
    if await db.mingle_actions.count_documents({"to_id": demo["user_id"]}) == 0:
        now = now_utc()
        seeds = {"ava_forex": "hi", "marcus_fx": "interested"}
        async for u in db.users.find({"username": {"$in": list(seeds)}}, NO_ID):
            await db.mingle_actions.update_one({"from_id": u["user_id"], "to_id": demo["user_id"]},
                                               {"$set": {"action": seeds[u["username"]], "created_at": now}}, upsert=True)
            await notify(demo["user_id"], u["user_id"], f"mingle_{seeds[u['username']]}")


ACC_SEED = {
    "ava_forex": {"markets": ["Forex"], "instruments": "GBPUSD, EURUSD", "session": "London", "timezone": "GMT", "frequency": "Daily",
                  "working_on": "Two setups a day, then close the laptop.", "looking_for": ["Daily Check-ins", "Discipline Support"]},
    "marcus_fx": {"markets": ["Futures"], "instruments": "NQ, ES", "session": "NY", "timezone": "EST", "frequency": "Few times a week",
                  "working_on": "Respecting my max loss on red days.", "looking_for": ["Prop Firm Accountability", "Trading Psychology"]},
}


async def seed_accountability():
    """A couple of seeded members open to accountability so Find Your Partner isn't empty."""
    async for u in db.users.find({"username": {"$in": list(ACC_SEED)}}, NO_ID):
        if not await db.acc_profiles.find_one({"user_id": u["user_id"]}, NO_ID):
            await db.acc_profiles.insert_one({**ACC_SEED[u["username"]], "user_id": u["user_id"], "created_at": now_utc(),
                                              "sharing": {"plan": True, "discipline": True, "plan_followed": True, "pnl": True, "mood": False, "notes": False, "screenshots": False}})
