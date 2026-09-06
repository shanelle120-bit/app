# Level Up Trading Hub — PRD

**Tagline:** Where Traders Connect Beyond the Charts

## Original problem statement
Build a polished mobile-first social networking app for financial traders (futures, options, forex, stocks, crypto). Premium dark theme (near-black/navy, electric purple, cyan, blue, silver, white). Three core experiences for v1: (1) social feed with text/chart screenshots/photos/short videos/GIFs + likes, comments, sharing, saving; (2) trader profiles (photo, name, bio, markets, instruments, style, session, followers/following, posts/photos/videos/mentions/saved); (3) bottom navigation Home / Chat / Create Post / Premium / Profile with a Stories row on Home. Auth screens (sign up, login, forgot password, onboarding). Premium is a teaser hub for Single & Mingle, Accountability Partners, Trading Only — no payments yet.

## User choices
- Auth: email/password (JWT) **and** Emergent-managed Google login
- Media storage: Emergent Managed Object Storage
- Chat: basic 1:1 DMs (working)
- Premium: teaser/landing hub, structured for later gating
- GIFs: GIPHY search in posts, comments/replies and chat (key provided, in backend .env)

## Architecture
- **Frontend:** Expo SDK 57 / expo-router (file routing), react-query, react-native-keyboard-controller, expo-image, expo-video, expo-image-picker, @react-native-vector-icons/ionicons, theme tokens in `src/theme.ts` (dark-only).
  - Routes: `(auth)/{welcome,login,signup,forgot-password,reset-password}`, `onboarding`, `(tabs)/{index,chat,create,premium,profile}`, `post/[id]`, `user/[id]`, `chat/[id]`, `edit-profile`, `search`, `connections`.
  - Root layout gate: `Stack.Protected` on auth state (AuthProvider in `src/auth-context.tsx`).
- **Backend:** FastAPI modular (`core.py`, `routes_auth.py`, `routes_users.py`, `routes_posts.py`, `routes_chat.py`, `routes_media.py`, `seed.py`). All routes under `/api`. Unified token verifier (local JWT for password users, `user_sessions` tokens for Google).
- **DB (MongoDB):** users, user_sessions, password_resets, posts, likes, bookmarks, comments, comment_likes, follows, conversations, messages, media_files. Custom string ids (`user_*`, `post_*`…), `_id` excluded, soft deletes via `deleted_at`.
- **Integrations:** Emergent Google Auth, Emergent Object Storage (`/api/upload`, `/api/files/{path}`), GIPHY proxy (`/api/gifs/search|trending`).

## Personas
- Active retail trader sharing setups and wins, wants a trader-only social space.
- Learner following experienced traders, saving posts, asking questions.
- Community builder wanting DMs and (later) premium rooms.

## Implemented (2026-06)
- Auth: signup, login, forgot/reset password (6-digit code; `dev_code` returned because no email provider is connected yet), Google login, logout, onboarding profile setup.
- Feed: For you / Following, infinite scroll, pull-to-refresh, Stories row (followed traders, ring = posted in 48h), Discover shortcut.
- Posts: text with @mention/#tag highlighting, images, videos, GIFs (up to 4 attachments), like/bookmark/share/delete, detail with threaded comments (text + GIF, replies, comment likes).
- Profiles: cover, avatar, bio, markets, instruments, style, session, stats, follow/unfollow, followers/following lists, tabs Posts/Photos(grid)/Videos(grid)/Mentions/Saved, edit profile with avatar/cover upload.
- Chat: conversation list with unread badges, 1:1 messages with text, GIF, image; 3s polling.
- Premium: teaser hub with 3 locked cards + Notify me.
- Search: traders by name/handle, suggested traders, follow/message from row.
- Seeded demo data (4 traders, posts, a comment, a DM). Test credentials in `/app/memory/test_credentials.md`.
- Testing: iteration_1 — backend 21/21, all frontend flows pass.

## Backlog (prioritized)
- P0: Email delivery for password reset codes (Emergent Resend) — currently code shown in-app.
- P1: Premium gating model (roles/entitlements) + RevenueCat subscriptions; Single & Mingle / Accountability Partners / Trading Only rooms.
- P1: Real-time chat (websockets) instead of polling; typing indicators; read receipts.
- P1: Notifications inbox (likes, comments, follows, mentions).
- P2: Stories as ephemeral 24h media (currently links to latest post/profile).
- P2: Hashtag pages, trending topics, post search.
- P2: Video thumbnails/transcoding, multi-image carousel.
- P2: Report/block users, moderation tools.
