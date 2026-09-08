#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
## Iteration 7 (2026-06) — Activity inbox, Premium infra, Mingle inbox + 4 photos
- Backend: routes_activity.py (notifications CRUD, membership w/ FEATURES registry & no pricing, activate/cancel preview), routes_mingle.py gated by require_feature("single_mingle") on PUT /me, /discover, /actions, /inbox; GET /mingle/inbox; photos[] ≤4. seed.ensure_demo_premium keeps demo Premium + seeds Ava(hi)/Marcus(interested) into demo inbox.
- Frontend: Home bell + unread badge → app/notifications.tsx; Premium tab (status pill, plan picker, Activate/Cancel preview); /mingle paywall for free tier (src/components/premium-gate.tsx); Discover card MinglePhotos carousel; header inbox button → app/mingle/inbox.tsx; app/mingle/edit.tsx 4-slot photo grid.
- Credentials: demo@leveluphub.com / Trader123! (Premium). Create a fresh account via signup to test free-tier paywall.
- needs_retesting: true (backend + frontend)

## Iteration 8 (2026-06) — Mingle Feed, Blocked members/Unblock, Your Mingles layout fix
- Backend: posts carry `space` ("main" default / "mingle"). Main queries (GET /posts, /users/{id}/posts, /me/saved, stories, photo/video counts) exclude mingle. GET/POST /api/mingle/posts (premium + Mingle profile required; blocked authors excluded). get_post_or_404 now enforces access: mingle posts → 403 for non-members, 404 between blocked pairs (applies to detail/like/comments/share/bookmark). Mingle posts & comments render Mingle identities (mingle_summaries in core.py), mentions disabled. GET /api/mingle/members/{id} (Mingle profile + relation), GET /api/mingle/blocks, DELETE /api/mingle/blocks/{id} (lifts block only; connection/interest/conversation NOT restored). Chat send_message → 403 between Mingle-blocked pairs. Notifications for mingle posts / mingle_* types show Mingle identity (`mingle: true`).
- Frontend: MingleNav bottom bar (Discover | Mingle Feed | Your Mingles | Inbox w/ badge) on index/feed/connections/inbox; app/mingle/feed.tsx, compose.tsx (text + photo + short video via uploadFile), member/[id].tsx (Mingle profile + Say Hi / Interested / Message), blocked.tsx; settings → SAFETY & PRIVACY → Blocked members; PostCard mingle mode (Mingle tag, age/location, author → /mingle/member, no share/bookmark, "Say hi · Interested" shortcut); post detail mingle mode (no @handles/mentions). connections.tsx row: identity column flex:1/minWidth:0 + numberOfLines so long names truncate.
- Credentials: demo@leveluphub.com / Trader123! (Premium, has Mingle profile).
- needs_retesting: true (backend + frontend, plus regression of existing Mingle flows)

## Iteration 9 (2026-06) — Post reactions (8 emojis) + 60s voice messages
- Backend: `POST /api/posts/{id}/react {reaction: emoji|null}` (REACTIONS = 😂 🩷 🤑 🥳 🔥 🗣️ 🤗 🤬; 400 on unknown). One reaction per member (db.likes gets `reaction`; legacy likes = 🩷). Posts return `my_reaction`, `reactions` {emoji:count}, `likes_count` = total. `/like` kept as 🩷 toggle. Notification: only first reaction notifies (type like, `reaction` field); changing emoji updates the existing alert; removing doesn't notify. Mingle posts keep Mingle identities (get_post_or_404 access rules apply to /react). Chat: MessageCreate accepts `audio_url` (must start /api/files/) + `audio_duration` (0..60); preview "🎤 Voice message"; block check unchanged (403). Upload accepts audio/* (type "audio").
- Frontend: `ReactionControl` (src/components/reaction-control.tsx) replaces heart in PostCard (feed + detail, main + Mingle): tap/long-press → picker modal (reaction-picker, reaction-option-<emoji>, reaction-remove); control testID post-react-<id>, post-my-reaction-<id>, post-reaction-summary-<id>. Activity copy "reacted 🔥 to your post". Chat composer: mic button (message-voice-button) when text empty → VoiceRecorder bar (voice-recorder, voice-record, voice-timer "0:07 / 1:00", voice-stop, voice-cancel, voice-preview-play, voice-send); auto-stop at 60s; permission flow w/ Open Settings (voice-open-settings). Voice bubbles (voice-message, voice-message-play, voice-message-duration) via expo-audio. app.json: NSMicrophoneUsageDescription + RECORD_AUDIO.
- needs_retesting: true

## Iteration 10 (2026-06) — Accountability Partners V1
- Backend `routes_accountability.py` (prefix /api/accountability, premium-gated via FEATURES.accountability now available): GET /meta, GET /me (profile, sharing, plan, partner w/ shared latest session, incoming/outgoing requests), PUT /profile, PUT /sharing (defaults: plan/discipline/plan_followed/pnl ON, mood/notes/screenshots OFF), GET /partners (browse; excludes self, Mingle-blocked, current partner), POST /requests, POST /requests/{id}/accept|decline (accept → acc_partnerships, one active partner each), DELETE /partnership, GET /partner/sessions (only shared fields), PUT /plan (persists, edits affect future only), POST /sessions (stores plan_snapshot + auto target_hit / max_trades_respected / plan_followed / discipline_score = 20×5 behaviour factors, P&L excluded), GET /sessions, GET /sessions/{id}, GET /progress (current_balance = starting + Σpnl, target_hit_rate, avg_discipline, rates, accountability_streak (consecutive days ending today/yesterday), no_revenge_streak, history). Messaging reuses POST /api/conversations (existing chat). Report/block reuse /api/mingle/report + /api/mingle/block. Seed: Ava + Marcus acc_profiles.
- Frontend `app/accountability/*`: index (paywall → landing: Find Your Partner / My Accountability Partner, My Accountability, My Progress), partners (browse cards + Connect for Accountability / accept), profile (preferences), sharing (toggles), plan (SAVE MY PLAN), session (How'd you do today? check-in w/ plan reference, SAVE SESSION → detail), progress (stats incl. Target-Hit Rate + history), session/[id] (detail w/ snapshot), partner (shared sessions, Message Partner → existing chat, end/report/block). Premium tab card routes to /accountability.
- needs_retesting: true

## Iteration 11 (2026-06) — Trading Only feed
- Backend: posts `space` now main|trading|mingle. `POST /api/posts` accepts `space:"trading"` (402 unless Premium via FEATURES.trading_only, now available). `GET /api/posts?space=trading` (Premium only) lists trading posts; main feed/user posts/stories/photo counts exclude trading (MAIN_SPACE $nin). get_post_or_404 → 402 for trading posts when not Premium. Saved list keeps trading posts (private). Normal identity everywhere.
- Frontend: `app/trading/index.tsx` (paywall for free tier; header TRADING ONLY / tagline / description; PostCard list; empty state "Start the conversation."; FAB + empty CTA → `/(tabs)/create?space=trading`). create.tsx reads `space` param: title "New Trading Only post", posts with space trading, returns to /trading and clears the param. Premium tab Trading Only card → /trading.
- needs_retesting: true
