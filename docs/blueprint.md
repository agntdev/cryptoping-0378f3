# Crypto Watchlist & Alerts — Bot specification

**Archetype:** finance

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Personal Telegram bot that lets each user maintain a private crypto watchlist, create two alert types (absolute USD thresholds and percent moves over a lookback window), fetch on‑demand prices, receive an optional configurable morning summary, and suppress alerts during quiet hours. The owner receives daily aggregated usage and top-fired-alerts to a single admin chat.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Individual crypto traders
- Crypto holders who want lightweight private price alerts in Telegram

## Success criteria

- User can add/remove tickers to a private watchlist and see confirmation toasts
- User can create threshold and percent alerts and receive alerts in their private chat when conditions are met
- Alerts respect user quiet hours and cooldown settings; suppressed alerts are summarized once after quiet hours
- Users can request /price for single tickers or their list and receive current price plus percent change over the lookback window
- Owner receives a daily aggregate report (total users, active users last 30 days, top N fired tickers) to ADMIN_CHAT_ID and can request an on‑demand report

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu and onboarding; explains privacy and shows quick actions
- **Add coin** (button, actor: user, callback: watchlist:add) — Open add-coin menu with quick-add options (BTC, ETH, TON, USDT, Other) and a free-text option
  - inputs: button tap, optional free-text ticker
  - outputs: confirmation toast, updated watchlist
- **View list** (button, actor: user, callback: watchlist:view) — Show current watchlist with per-item inline controls to Add Alert / Remove
  - inputs: button tap
  - outputs: watchlist message with inline delete & add-alert buttons
- **Settings** (button, actor: user, callback: settings:open) — Open settings for quiet hours, morning summary time, cooldown length, and timezone
  - inputs: button tap, form replies for time values
  - outputs: updated settings confirmation
- **/price** (command, actor: user, command: /price) — Get current price(s). Usage: /price BTC or /price mylist
  - inputs: slash command with ticker or 'mylist'
  - outputs: current price(s) and percent move over lookback window or unknown-ticker help
- **Add via deep link (optional)** (deep_link, actor: user, callback: deep:add) — Start a pre-filled /start flow to add a ticker passed in the deep-link
  - inputs: deep link param ticker
  - outputs: add coin dialog or unknown-ticker help

## Flows

### Onboarding
_Trigger:_ /start

1. Present brief privacy statement and what is stored
2. Show quick-action inline keyboard: Add coin, View list, Settings, /price help
3. Offer optional guided tour (single tap) explaining alerts, quiet hours, morning summary

_Data touched:_ User profile

### Add coin (quick-add)
_Trigger:_ callback watchlist:add

1. User taps one of quick-add coins (BTC/ETH/TON/USDT) or chooses Other
2. If Other, bot prompts with ForceReply for free-text ticker
3. On ticker input, validate ticker canonicalization (if available) or accept as-is
4. Add watchlist item with default empty alerts and fetch initial price
5. Send short toast confirmation and offer 'Create alert' button

_Data touched:_ Watchlist item, Price snapshot

### Remove coin
_Trigger:_ callback watchlist:view -> delete

1. User opens View List; each item has Delete button
2. On delete tap show 'Are you sure?' confirmation (inline yes/no)
3. On confirm remove watchlist item and its alerts, return toast confirmation

_Data touched:_ Watchlist item

### Create alert — Threshold
_Trigger:_ callback watchlist:item -> add_alert -> Threshold

1. Bot prompts direction (Above / Below) via inline buttons
2. Bot prompts for USD value via ForceReply
3. Bot shows summary: ticker, direction, USD threshold, cooldown preview
4. User confirms via inline button; bot saves alert and acknowledges

_Data touched:_ Alert, Watchlist item, User profile

### Create alert — Percent
_Trigger:_ callback watchlist:item -> add_alert -> Percent

1. Bot prompts direction (Rise / Fall) via inline buttons
2. Bot prompts for percent value via ForceReply (e.g. 5 for 5%)
3. Bot prompts for lookback window via inline choices (15m, 1h (default), 4h, 24h) or free-text
4. Bot shows summary and confirmation; on confirm save alert and acknowledge

_Data touched:_ Alert, Watchlist item, User profile

### Price query
_Trigger:_ /price <ticker>|/price mylist

1. If argument is 'mylist' fetch current prices for user's watchlist
2. If single ticker, look up canonical mapping; if unknown reply with help and quick-add suggestion
3. Return current price (USD) and percent change over the user-specified or default lookback window
4. If price feed error, reply with a short error message and suggest retry

_Data touched:_ Price snapshot, Watchlist item

### Morning summary setup & send
_Trigger:_ settings -> morning_summary or scheduled daily at user's local time

1. User sets local time (timezone inferred or asked once during onboarding)
2. If enabled: at user local time compute list of watchlist prices and day moves and send concise summary message
3. If price feed failures occur for items, mark them in the summary and notify owner once per failure class

_Data touched:_ User profile, Price snapshot

### Quiet hours & queued alerts
_Trigger:_ alert condition met during quiet hours

1. Detect user quiet hours from profile and suppress immediate alert delivery during interval
2. Queue a single summary notification per user at quiet-hours end listing relevant suppressed alerts (coalesced)
3. If quiet end overlaps with cooldown, ensure deduplication per alert id

_Data touched:_ Queued alert, User profile, Alert cooldown timestamps

### Cooldown enforcement
_Trigger:_ alert condition repeatedly met

1. On alert firing, persist a cooldown timestamp for user+alert (default 60m unless user set otherwise)
2. Suppress any subsequent notifications for that exact alert until cooldown expires
3. Allow other alerts on same ticker or different alerts to fire independently

_Data touched:_ Alert cooldown timestamps, Alert

### Owner daily report & on-demand
_Trigger:_ daily cron OR owner requests report

1. Aggregate total users, active users last 30 days, active watchlists, and top N tickers by alert-fire count
2. Send aggregated report to ADMIN_CHAT_ID once per day and on-demand
3. Ensure no per-user PII is included in the aggregated report

_Data touched:_ Owner stats, Alert fire counts, User profile (counts only)

### Price feed failure handling
_Trigger:_ price fetch fails

1. Retry fetch up to N times with backoff (implementation detail)
2. If still failing, suppress alerts that depend on the failing feed and do not notify users
3. Send one owner notification per failure class per day with error details

_Data touched:_ Error log, Owner stats

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram chat id where daily owner reports and failure notifications are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **User profile** _(retention: persistent)_ — Per-user settings and preferences
  - fields: chat_id (telegram id), timezone (IANA string), quiet_hours_start (HH:MM), quiet_hours_end (HH:MM), morning_summary_enabled (bool), morning_summary_time (HH:MM), cooldown_minutes (integer), created_at, last_active_at
- **Watchlist item** _(retention: persistent)_ — A ticker the user is tracking
  - fields: id, owner_chat_id, ticker (user-provided string), canonical_symbol (optional normalized symbol), friendly_name (optional), last_known_price_usd, last_price_timestamp
- **Alert** _(retention: persistent)_ — Per-watchlist alert configuration
  - fields: id, watchlist_item_id, type (threshold|percent), direction (above|below|rise|fall), threshold_value (USD or percent), lookback_window_minutes (for percent alerts), active (bool), created_at
- **Alert cooldown timestamp** _(retention: persistent)_ — Tracks last fired time to enforce cooldown per user+alert
  - fields: alert_id, chat_id, last_fired_at
- **Queued alert summary** _(retention: session)_ — Alerts suppressed during quiet hours queued for single delivery after quiet end
  - fields: chat_id, alert_ids, suppressed_at, delivered_at
- **Owner stats** _(retention: persistent)_ — Daily aggregated owner metrics and top-fired tickers
  - fields: date, total_users, active_users_30d, active_watchlists, top_tickers_by_alert_count
- **Price snapshot (transient)** _(retention: persistent)_ — Latest fetched price for a ticker used for comparisons and /price responses
  - fields: ticker, price_usd, timestamp

## Integrations

- **Telegram** (required) — Bot API messaging and inline/callback interactions
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Set ADMIN_CHAT_ID (required env)
- Request on-demand owner report via private chat command (owner only)
- Adjust global defaults (top-N in owner report, default cooldown, default lookback window) — note: requires owner confirmation; not exposed to end users in v1

## Notifications

- User alert messages (private chat) when a threshold or percent condition is met
- Single coalesced queued notification after quiet hours listing suppressed alerts
- Optional daily morning summary per user at user local time
- Owner daily aggregated report to ADMIN_CHAT_ID (total users, active users 30d, top N tickers)
- Owner error/failure notifications for price-feed failures (one per failure class per day)

## Permissions & privacy

- All user watchlists and alert settings are private and delivered only to the user's private Telegram chat
- Owner receives only aggregated, non-identifying metrics (counts and top tickers); no per-user message content or PII in owner reports
- Stored fields: chat id and timezone (necessary for delivery); owner must be informed at onboarding
- Data retention follows stored entity retention policies; owner should confirm any longer retention or export requirements

## Edge cases

- Ambiguous or unknown ticker strings — bot suggests common tickers and offers 'add as-is' fallback
- Price feed partial failures (some tickers fail) — deliver available data and mark failed items in summary; owner notified once per failure class
- User sets quiet hours that span midnight — ensure suppression logic correctly handles wrap-around intervals
- Multiple alerts on same ticker firing simultaneously — send separate alert entries but coalesce if suppressed by quiet hours
- Cooldown and quiet-hours interaction — alerts fired before quiet start should still follow cooldown rules; suppressed alerts still respect cooldown when summarizing
- Timezone changes or daylight saving transitions — ensure scheduled morning summaries and quiet-hours adapt to updated timezone stored on profile
- Invalid ADMIN_CHAT_ID or owner chat blocked bot — owner reports will fail; system should surface a setup error to the build/deploy logs and not attempt silent retries forever
- Exceeded rate limits from price provider — backoff and owner notification once per failure class

## Required tests

- Dialog-level acceptance: Add a quick-add coin, create threshold and percent alerts, simulate price crossing and verify alert delivered
- Quiet hours test: create alert, simulate condition during quiet hours, verify no immediate alert and a single queued summary after quiet end
- Cooldown test: fire same alert twice within cooldown and confirm second notification suppressed
- /price tests: valid ticker, mylist, and unknown ticker behaviors including help messages
- Owner report test: aggregate counts and top-N tickers generated and delivered to ADMIN_CHAT_ID
- Price feed failure test: simulate transient and persistent failures; verify retry behavior and owner's single daily failure notification
- Persistence tests: verify user profile, watchlist, alerts, last prices, and cooldown timestamps survive restarts

## Assumptions

- Price data will be available via an external crypto price feed (not specified in brief); USD-only pricing is acceptable
- Default lookback window is 1 hour for percent alerts unless user changes it
- Default cooldown is 60 minutes unless the user sets a different value
- Seed quick-add coins: BTC, ETH, TON, USDT plus an Other free-text option
- Owner expects top 10 tickers by default in daily report unless they ask to change top-N
