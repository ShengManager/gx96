# TgGaming Project TODO

## Phase 1: Database Schema & Migration
- [x] Admin accounts table (master + sub-accounts with permissions)
- [x] Players table (Telegram-based registration, phone, country, invite code)
- [x] Telegram bots table (multi-bot management per admin)
- [x] Banks table (country-based, deposit/withdraw/both/internal types)
- [x] Deposits table (lifecycle: pending → processing → approved/rejected)
- [x] Withdrawals table (lifecycle with rollover/turnover validation)
- [x] Deposit cycles table (track active deposit cycle per player)
- [x] Bonus configs table (ClaimConfig JSON, type, images, display)
- [x] Player bonuses table (claimed bonuses with rollover/turnover progress)
- [x] Invite relations table (referral tracking)
- [x] Game logs cache table (synced from Middlewave)
- [x] Admin operation logs table (audit trail)
- [x] System settings table (key-value config per admin)
- [x] Telegram bot messages table (per-language welcome/menu messages)
- [x] Banners table (frontend carousel)
- [x] Player tags table
- [x] Sub-account permissions table

## Phase 2: Backend Core
- [x] Custom JWT auth system (access + refresh tokens, NOT Manus OAuth)
- [x] Admin login API (username/password)
- [x] Player auth via Telegram (phone-based registration)
- [x] Player token-based session with silent refresh
- [x] Middlewave API integration service (CreatePlayer, CheckBalance, Deposit, Withdrawal, LoginGame, GameList, SyncGameLog, KickPlayer, GetPlayerProviderAccounts, QueryGameLogs)
- [x] Deposit lifecycle engine (create → upload receipt → admin review → approve/reject → notify)
- [x] Withdrawal lifecycle engine (validate rollover/turnover → submit → admin review → approve/reject → notify)
- [x] Deposit cycle management (lock new deposits until cycle ends)
- [x] Bonus validation engine (time, claim limit, deposit conditions, eligibility, game-lock)
- [x] Bonus claim API with fail-fast reasons
- [x] Rollover/Turnover progress tracking from game logs
- [x] WebSocket server (Socket.IO) for real-time notifications
- [x] File upload to S3 (deposit receipts, bonus images, banners)

## Phase 3: Backend Business Routes
- [x] Player management CRUD (admin side)
- [x] Player tag management
- [x] Player VIP level management
- [x] Anomalous credit detection (multi-provider balance alert)
- [x] Deposit list + handle/approve/reject workflow (admin)
- [x] Withdrawal list + handle/approve/reject workflow (admin)
- [x] Bonus CRUD (admin create/edit/enable/disable)
- [x] Bank CRUD (country-based, type: deposit/withdraw/both/internal, status: active/closed/hidden)
- [x] Sub-account CRUD with permission matrix (view/edit/delete per module)
- [x] System settings CRUD (Middlewave token, language, timezone, deposit/withdraw limits, rollover/turnover defaults)
- [x] Telegram bot settings CRUD (token, welcome messages, menu config)
- [x] Frontend settings (layout template, custom CSS/HTML/JS, domains)
- [x] Report APIs (bank in/out, new users, deposit/withdraw/bonus summary, player rankings, date-to-date)
- [x] Banner CRUD
- [x] Admin operation log recording

## Phase 4: Admin Panel UI
- [x] Admin login page (custom username/password, NOT Manus OAuth)
- [x] Dashboard with charts (revenue trends, player stats, fund overview, bonus stats, game data)
- [x] Player list with search/filter
- [x] Player detail page (info, credits, game accounts, deposit/withdraw/bonus history, game logs, tags, IP/location)
- [x] Deposit management (list, handle, approve/reject, receipt viewer, real-time WS notification)
- [x] Withdrawal management (list, handle, approve/reject, rollover check, game log viewer, WS notification)
- [x] Bonus management (list, create/edit form with ClaimConfig, enable/disable, image upload)
- [x] Bank management (CRUD by country, type selection, status toggle)
- [x] Sub-account management (create, permission matrix editor)
- [x] Telegram bot settings page (token binding, test connection, message config per language)
- [x] Frontend settings page (template selection, custom CSS/HTML/JS, domain management)
- [x] System settings page (Middlewave token, language, timezone, deposit/withdraw limits)
- [x] Report pages (bank ledger, new users, deposit/withdraw/bonus reports, player rankings, date range filter)
- [x] Banner management (CRUD with image upload)
- [x] Admin operation log viewer
- [x] Dark theme for admin panel

## Phase 5: Player Web App (Frontend)
- [x] Player auto-login via encrypted token link from Telegram
- [x] Home page with banner carousel
- [x] Game lobby (GameList from Middlewave, Web/H5/Download types)
- [x] Game launch (LoginGame with time-limited single-use link)
- [x] Player balance display (CheckBalance)
- [x] Deposit entry from frontend
- [x] Withdrawal entry from frontend
- [x] Bonus page (card list with images, dialog detail, claim button, progress bar)
- [x] Transaction history (deposit/withdraw records + game logs)
- [x] Profile page (basic info, logout)
- [x] Bottom fixed navbar layout
- [x] Multi-language support (EN/ZH)
- [x] Share/invite code page
- [x] Mobile-first responsive design

## Phase 6: Telegram Bot
- [x] Bot registration and webhook setup
- [x] Welcome message with buttons (Register, Bonus, Contact)
- [x] Registration flow (request_contact, phone validation by country code)
- [x] Country code whitelist validation
- [x] Bank info collection during registration
- [x] Invite code generation and sharing
- [x] Main menu after registration (Deposit, Withdrawal, Game, Bonus, Share, Contact, Setting)
- [x] Deposit flow in Telegram (amount selection, bank selection, receipt upload, cancel)
- [x] Withdrawal flow in Telegram (condition check, submit, status)
- [x] Game info display with frontend login link
- [x] Bonus list display (paginated, 10 per page)
- [x] Setting (view profile, language switch)
- [x] Message cleanup on menu navigation
- [x] Real-time notifications from WebSocket (deposit/withdraw status updates)
- [x] Admin push notifications to players

## Phase 7: Cross-cutting
- [x] Multi-language i18n (EN + ZH)
- [x] Timezone management (UTC+0 storage, configurable display timezone)
- [x] Multi-tenant data isolation (per admin account)
- [x] Domain ACL for admin login
- [x] Vitest unit tests for core business logic (62 tests passing)

## Phase 8: Gap Fixes & Hardening
- [x] Implement real Telegram webhook handler (verify bot, parse update, dispatch to bot service)
- [x] Add proper error handling and validation states for admin/player login pages
- [x] Implement frontend settings backend support (custom CSS/HTML/JS, domain ACL)
- [x] Add integration-level tests for deposit/withdraw/bonus workflows
- [x] Implement encrypted auto-login token flow (Telegram → player web app)
- [x] Add loading/empty/error states across dashboard, reports, and management pages
- [x] WebSocket-to-Telegram notification bridge implementation
- [x] Timezone management (UTC+0 storage, configurable display timezone)
- [x] Domain ACL for admin login

## Phase 9: Gap Resolution
- [x] Domain ACL enforcement middleware in admin auth login flow
- [x] Timezone-aware formatting in report/list API responses
- [x] Integration-level tests for deposit/withdraw/bonus workflows

## Phase 10: Polish & Enhancement
- [x] Fix stale sendTelegramNotification import in websocket.ts (was already resolved, error from 07:39 pre-restart)
- [x] Add Player Detail dialog/page in Admin Panel (view full player info, credits, history)
- [x] Add Country Config management page in Admin Settings (already existed)
- [x] Enhance Admin Dashboard with real-time WebSocket connection indicator
- [x] Improve Admin sidebar with active state highlighting and collapsible sections
- [x] Enhance Player Home page with proper banner carousel (auto-slide, indicators)
- [x] Add game category filtering with visual tabs on Player Games page
- [x] Improve Player Deposit page with step-by-step wizard flow
- [x] Add pull-to-refresh and refresh button on Player History page
- [x] Enhance Player Bonus cards with gradient backgrounds and claim progress animation
- [x] Add proper 404 page with dark theme and PlayerProtected route guard
- [x] Add admin password change functionality in Settings
- [x] Add player search by phone/username in admin panel (already in AdminPlayers)

## Phase 11: Final Gap Resolution
- [x] Add vitest tests for adminAuth.changePassword endpoint (7 tests passing)
- [x] Verify PlayerHistory refresh button works end-to-end (RefreshButton component in all 3 tabs)

## Phase 12: Bug Fixes
- [x] Fix "Admin authentication required" error on /admin/settings page - root cause: tRPC client not sending Authorization header, fixed in main.tsx httpBatchLink headers()

## Phase 13: Bug Fixes - Telegram Bot & Middlewave Verification
- [x] Fix Telegram Bot not responding to /start (bot added in admin, status Active, but no reply) - enhanced with getMe validation, deleteWebhook, robust polling
- [x] Add "Test Connection" button for Middlewave API Token verification (testMiddlewave endpoint + TestMiddlewaveButton UI already exist)
- [x] Add "Test Bot" button for Telegram Bot to verify it's working (testConnection procedure exists)
- [x] Add connection status indicators on Settings page
- [x] Bot startup: call getMe() to validate token and auto-save botUsername to DB
- [x] Bot startup: call deleteWebhook() to ensure clean polling mode
- [x] Add polling error auto-recovery with exponential backoff
- [x] Add bot diagnostic endpoint (getBotStatus) showing polling state, last message time, error count
- [x] Display bot username and polling status in admin Telegram settings
- [x] Add "Send Test Message" feature to verify bot can send messages (sendTestMessage endpoint added)

## Phase 14: Bug Fixes & New Features (User Report)
- [x] Fix frontend login - added playerLogin and playerRegister procedures to adminAuth router + passwordHash column
- [x] Telegram registration: add bank selection step with Malaysia banks
- [x] Seed all Malaysia banks into database (28 banks + eWallets in bank_catalog table)
- [x] Fix Middlewave API Token "not configured" error - now checks both 'middlewave_token' and 'middlewave_api_token' keys
- [x] Telegram: clear old messages on /start and menu navigation (cleanupMessages added to all major callbacks)
- [x] Integrate Middlewave API /api/gateway/ProjectInfo to get enabled game providers (dynamic provider discovery)
- [x] Integrate game list APIs - getActiveProviders() uses ProjectInfo with fallback to static list
- [x] Add admin setup guide / documentation page in the backend admin panel (8-step guide + FAQ)
