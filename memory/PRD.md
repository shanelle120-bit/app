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
- 2026-06 fix: native photo/video upload failed in Expo Go ("Unsupported FormDataPart implementation" — Expo SDK 57 fetch polyfill rejects `{uri}` FormData parts). `uploadFile` now uses `expo-file-system/legacy` `uploadAsync` (multipart) on iOS/Android; web unchanged. iteration_2 — 33/33 backend + frontend regression pass.
- 2026-06 fix: videos didn't play on iOS because `/api/files` lacked HTTP Range support → added 206/416/HEAD handling + in-process object cache; upload cap 150MB; picker exports H.264-compatible video. Feed videos autoplay muted when visible (viewability tracking), pause off-screen, VIDEO badge + play indicator, tap → sound + native controls.
- 2026-06 feature: real @mentions — composer autocomplete (name/username search), tap inserts handle, only selected valid accounts stored (`mentions` field), posts return `mentioned_users`, tapping a mention opens the profile; unselected @text stays plain. iteration_3 — 51/51 backend + frontend pass.
- 2026-06 feature: **Single & Mingle** (opt-in social discovery, 18+). Backend `routes_mingle.py` (collections: mingle_profiles, mingle_actions, mingle_connections, mingle_blocks, mingle_reports; separate from main account, soft-delete on leave). Screens under `app/mingle/` (welcome → profile form → card Discover with Pass/Say Hi/Interested, filters sheet, "It's a Mingle!" celebration → existing chat, connections list w/ remove/report/block, settings w/ hide profile, badge toggle, who-can-say-hi, leave). Entry via Premium tab card; optional badge on main profile (`mingle_badge`). Seeded 4 members. iteration_6 — 13/13 backend + full frontend flow pass.
- 2026-06 UI: landing/welcome screen replaced with client-supplied artwork (`assets/images/landing-hero.jpg`, cropped from the provided design) + native Create account / Log in / Apple (coming soon toast) / Google / Email buttons and footer taglines. Routing to existing auth flows unchanged. Verified by testing agent.
- 2026-06 stabilization: fixed feed scroll glitch (visibility Provider was recreated per scroll → FlatList remount; now stable `VisiblePostsProvider`, only video blocks subscribe). Native upload: `uploadAsync` + XMLHttpRequest fallback (RN networking, bypasses Expo fetch polyfill). Added Edit Post (PUT /api/posts/{id}, author-only, `edited_at`, mention-aware sheet) alongside Delete. @mention autocomplete in comments/replies (comments store `mentions`, return `mentioned_users`). Shared `useMentions` hook + `MentionSuggestions`. iteration_4 — 62/62 backend + full frontend flow pass.
- 2026-06 feature: **Activity inbox, Premium infrastructure, Mingle inbox + galleries.** Backend `routes_activity.py`: `notifications` collection (`notify()` called on like/comment/mention/follow/mingle hi/interested/match), `GET /notifications`, `/notifications/unread-count`, `POST /notifications/read-all`; membership (`users.membership.tier`), `GET /membership` (plans **without pricing** — intentionally TBD — plus a `FEATURES` registry: flip `premium`/`available` to gate a feature), `POST /membership/activate|cancel` (free preview, no payments), `require_feature(key)` dependency (402 when locked) guarding Mingle `PUT /me`, `/discover`, `/actions`, `/inbox`. `GET /mingle/inbox` = who said hi / marked me Interested and I haven't answered. Mingle profiles hold `photos[]` (≤4, `photo_url` = first). Demo account is kept Premium by `ensure_demo_premium()` at startup (also seeds Ava→hi, Marcus→interested for the demo inbox). Frontend: bell + unread badge on Home → `app/notifications.tsx` (deep-links to post/profile/mingle inbox/connections, marks read); `useMembership` hook + `PremiumPaywall`/`PlanPicker` (`src/components/premium-gate.tsx`); Premium tab shows status, plan picker, Activate/Cancel preview; `/mingle` renders the paywall for free users; Discover cards use swipeable `MinglePhotos` carousel; header inbox button with count → `app/mingle/inbox.tsx` (expand profile, Interested back / Pass / Open chat, match → chat); Mingle editor has a 4-slot photo grid (add / remove / make main) using the proven native `uploadFile`.

- P0: Email delivery for password reset codes (Emergent Resend) — currently code shown in-app.
- P1: Real payments for Premium (RevenueCat) + pricing decision; Mingle: verification.
- P1: Real-time chat (websockets) instead of polling; typing indicators; read receipts.
- P2: Stories as ephemeral 24h media (currently links to latest post/profile).
- P2: Hashtag pages, trending topics, post search.
- P2: Video thumbnails/transcoding, multi-image carousel.
- P2: Report/block users, moderation tools.
