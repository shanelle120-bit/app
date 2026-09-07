import logging

from fastapi import APIRouter, FastAPI
from fastapi.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

from core import client, ensure_indexes, init_storage, logger
from seed import ensure_demo_premium, seed, seed_mingle
import routes_auth
import routes_users
import routes_posts
import routes_chat
import routes_media
import routes_mingle
import routes_activity

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

app = FastAPI(title="Level Up Trading Hub API")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"app": "Level Up Trading Hub", "tagline": "Where Traders Connect Beyond the Charts"}


api_router.include_router(routes_auth.router)
api_router.include_router(routes_users.router)
api_router.include_router(routes_posts.router)
api_router.include_router(routes_chat.router)
api_router.include_router(routes_media.router)
api_router.include_router(routes_mingle.router)
api_router.include_router(routes_activity.router)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await ensure_indexes()
    try:
        await seed()
        await seed_mingle()
        await ensure_demo_premium()
    except Exception:
        logger.exception("Seeding failed")
    try:
        await run_in_threadpool(init_storage)
        logger.info("Object storage ready")
    except Exception as exc:
        logger.warning("Object storage init failed: %s", exc)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
