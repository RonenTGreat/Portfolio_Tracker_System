# System Requirements Specification
## Personal Portfolio Tracker Web Application

**Version:** 1.1
**Owner:** Single primary user (Admin role); additional accounts created by invite only
**Target stack:** Next.js (App Router) + Vercel Postgres + Prisma + Vercel hosting

---

## 1. Purpose

Replace the current spreadsheet-based portfolio tracker with a hosted web application that:
- Records quarterly holdings at the **individual fund/ticker level** (not aggregated buckets)
- Computes portfolio totals, growth, and allocation drift automatically
- Displays target vs. current allocation and portfolio trends visually
- Is accessible from any device via secure sign-in, with new accounts created only by an Admin (no public sign-up)

---

## 2. Scope

**In scope:**
- Quarterly data entry for each individual holding
- Target allocation management (by holding and by bucket)
- Dashboard with KPIs and charts
- Historical trend tracking
- Secure sign-in, invite-only account creation, and an Admin role that can track and deactivate accounts (Section 5, FR-8–FR-10)

**Out of scope (v1):**
- Public/open self-service sign-up — accounts exist only via Admin invite (Section 4.1, FR-9)
- Per-user data separation — this is a single-portfolio app; additional invited accounts (if any are ever created) access the same shared portfolio, not their own. This is an access-control feature, not a multi-tenant one
- Live price feeds or automatic valuation (GHS values are entered manually each quarter, as today)
- Mobile native app (responsive web only)
- Automated rebalancing execution (advisory only — the app tells you the drift, you act on it manually)

---

## 3. Holdings Data Model

The current spreadsheet tracks five **aggregated buckets** (Mutual Funds, Crypto, ETFs, Emergency Fund, T-Bills). This hid meaningful differences within each bucket — e.g., ArkFund (mostly fixed income) was lumped in with Epack (pure equity growth), and VOO/QQQM/SCHD (three very different risk profiles) were summed into one "ETFs" number.

**Requirement: track every individual holding as its own row**, rolled up into buckets only for reporting.

### 3.1 ETF Holdings (separated)

| Ticker | Name | Category | Notes |
|---|---|---|---|
| `VOO` | Vanguard S&P 500 ETF | Core / Broad Market | Diversified US large-cap |
| `QQQM` | Invesco NASDAQ 100 ETF | Growth | Tech-heavy, concentrated |
| `SCHD` | Schwab US Dividend Equity ETF | Dividend / Value | Income-oriented |

### 3.2 Mutual Fund Holdings (separated)

| Fund | Manager | Category | Notes |
|---|---|---|---|
| `Epack` | Databank | Ghana/African Equity | Growth-oriented, equity-only |
| `ArkFund` | Databank | Balanced | ~65-70% fixed income / 30-35% equity, ethically screened |
| `MFund` | Databank | Money Market | Cash-like, low risk |

### 3.3 Crypto Holdings

| Asset | Category | Notes |
|---|---|---|
| `BTC` | Long-term core | Buy-and-hold thesis |
| `ETH` | Long-term core | Buy-and-hold thesis |
| `SOL` | Long-term core | Buy-and-hold thesis |
| `Hot Narratives` | Speculative | Meme coins, AI/RWA/DePIN tokens, etc. — tracked as one line, or split per-token if desired later |

### 3.4 Cash / Safety Holdings

| Holding | Category | Notes |
|---|---|---|
| `T-Bill` | Government Fixed Income | Ghana Treasury Bills |
| `Achieve (DigiSave)` | Money Market | Plus Income Fund via Black Star Advisors, held at Stanbic |

---

## 4. Data Model (Schema-Level)

```
Holding {
  id            string (PK)
  ticker        string        // e.g. "VOO", "Epack", "BTC", "T-Bill"
  displayName   string        // e.g. "Vanguard S&P 500 ETF"
  assetClass    enum          // ETF | MUTUAL_FUND | CRYPTO | CASH_SAFETY
  bucket        enum          // ETFs | MutualFunds | Crypto | EmergencyFund | TBills
  isActive      boolean       // allows retiring a holding without deleting history
}

QuarterEntry {
  id            string (PK)
  quarterDate   date          // e.g. 2026-06-30
  holdingId     string (FK -> Holding)
  valueGHS      decimal
  createdAt     timestamp
  updatedAt     timestamp
}

TargetAllocation {
  id            string (PK)
  holdingId     string (FK -> Holding), nullable   // null = bucket-level target
  bucket        enum, nullable
  targetPct     decimal
  effectiveFrom date          // supports target changes over time
}
```

**Key design decision:** `QuarterEntry` is one row per holding per quarter (not one row per quarter with five columns). This is what enables per-ticker tracking, per-ticker charts, and accurate bucket rollups computed on the fly rather than hand-maintained.

### 4.1 User & Access Model

```
User {
  id            string (PK)
  email         string (unique)
  passwordHash  string
  role          enum          // ADMIN | USER
  status        enum          // ACTIVE | DEACTIVATED
  createdAt     timestamp
  lastLoginAt   timestamp, nullable
  invitedById   string (FK -> User), nullable   // null only for the bootstrap Admin account
}

Invite {
  id            string (PK)
  email         string
  token         string (unique, random, single-use)
  role          enum          // role the new account will receive once accepted
  createdById   string (FK -> User)              // which Admin sent it
  expiresAt     timestamp
  acceptedAt    timestamp, nullable
}

LoginEvent {
  id            string (PK)
  userId        string (FK -> User)
  occurredAt    timestamp
  ipAddress     string, nullable
  outcome       enum          // SUCCESS | FAILED_PASSWORD | BLOCKED_DEACTIVATED
}
```

**Key design decisions:**
- There is no public sign-up form. A `User` row is only ever created two ways: (a) the one-time bootstrap Admin account, seeded from environment variables on first deploy, or (b) an Admin sending an `Invite` and the recipient completing it at a token-gated setup page (FR-9).
- `status = DEACTIVATED` must be checked on **every** authenticated request, not just at sign-in — otherwise someone with an already-open session could keep using the app after being deactivated. Deactivating a user should end their access immediately, not just block their next login attempt.
- `LoginEvent` is defined here but **not implemented in v1** — the decision (Open Question 4) came down in favor of `User.lastLoginAt` alone for now. The model stays in the schema so adding the full log later is a clean extension rather than a redesign, if a second account is ever invited or the threat model changes.

---

## 5. Functional Requirements

### FR-1: Data Entry
- User can add a new quarter and enter a GHS value for each active holding
- Form pre-populates the list of all active holdings, grouped by asset class (ETFs / Mutual Funds / Crypto / Cash)
- Validation: value must be a non-negative number; date must not duplicate an existing quarter
- User can edit or delete a past quarter's entries

### FR-2: Holdings Management
- User can add a new holding (e.g., a new ETF or crypto asset) at any time
- User can mark a holding inactive (stops appearing in new data-entry forms, but historical data is preserved)
- Editing a holding's name/category does not alter historical values

### FR-3: Target Allocation Management
- User can set/edit target % at two levels:
  - **Bucket level** (e.g., "ETFs: 40%") — matches current Strategy tab
  - **Holding level** (e.g., "VOO: 22%, QQQM: 12%, SCHD: 6%") — must sum to the bucket's target, validated on save
- Historical targets are preserved (`effectiveFrom`), so "what was my target on date X" is answerable later

### FR-4: Dashboard
- **KPI cards:** Total Portfolio Value (latest), QoQ Change (GHS and %), Crypto % (current vs. target), Safety Net % (current vs. target)
- **Line chart:** Total Portfolio Value over time
- **Stacked area/column chart:** Bucket composition over time
- **Pie chart:** Current allocation by bucket, with drill-down to individual holdings within each slice
- **Bar chart:** Target % vs. Current % by bucket, and by individual holding
- **Variance table:** current vs. target with a visual flag (e.g., color-coded) for anything more than a set threshold (e.g., ±5pp) off target

### FR-5: Individual Holding Trends
- User can view a single holding's value over time (e.g., "show me QQQM only") — not possible in the spreadsheet's aggregated columns

### FR-6: Quarter-over-Quarter Comparison
- User can select any two quarters (not just consecutive ones — e.g., Q2 2025 vs. Q2 2026) and see a side-by-side comparison:
  - Per-holding value in Quarter A vs. Quarter B, absolute change (GHS), and % change
  - Per-bucket value in Quarter A vs. Quarter B, absolute change, and % change
  - Total portfolio value change between the two quarters
- Default comparison is "latest quarter vs. previous quarter" (one click, no need to pick dates)
- Sortable by largest mover (GHS or %), so it's fast to spot "what actually moved the needle this quarter"
- Visual treatment: up/down indicator or color per row (e.g., green for growth, red for decline), consistent with the variance color-scale already used for target comparison
- **Each quarter in the comparison gets its own visualization, shown side-by-side, not just the numeric delta table:**
  - A pie chart of that quarter's allocation by bucket (Quarter A pie next to Quarter B pie), so the shape of the portfolio is visible at a glance, not just the numbers
  - Same chart type/scale/color-mapping used for both quarters, so the two pies are visually comparable (e.g., "Crypto" is always the same color in both)
  - Applies to the default latest-vs-previous view as well as any two custom quarters selected

### FR-7: Target vs. Actual Comparison Across Time
- The existing variance table (target % vs. current %) should not be locked to "latest quarter only" — user can pick any past quarter and see what the variance was *at that point in time*, using the target that was effective on that date (via `TargetAllocation.effectiveFrom`)
- Enables answering: "was I already overweight crypto a year ago, or did this happen recently?"
- A trend view of variance over time per bucket (e.g., a line chart of "Crypto variance from target" across all quarters) is valuable here — it turns drift into something visible before it becomes a 42%-vs-20% surprise, rather than only being caught when reviewed
- Same effective-target logic applies to the holding-level target comparison, not just bucket-level
- **When viewing variance for a selected quarter, show that quarter's actual-allocation pie chart overlaid or paired with a target-allocation pie chart**, so the gap is visible as a shape difference, not only as numbers in a table

### FR-8: Authentication (Sign In)
- A **Sign In** page (email + password) is the only way into the app — there is no public **Sign Up** page (see FR-9)
- Session persists via a secure, HTTP-only, `SameSite` cookie
- Failed sign-in attempts are rate-limited (e.g., a short lockout after 5 failed attempts) — this now gates real financial data behind a password rather than an obscure URL, so brute-force protection matters more than it did for the single-shared-password model
- A deactivated account (Section 4.1) is rejected at sign-in with a clear message, and any of its existing sessions are cut off on the next request, not just blocked from future logins
- Password reset: since accounts are invite-only and few in number, an Admin manually re-inviting/resetting a user is sufficient for v1, rather than building a full self-service "forgot password" email flow

### FR-9: Invite-Only Account Creation
- There is no public sign-up form or route. Accounts are created in exactly two ways:
  1. **Bootstrap:** on first deployment, one Admin account is created from environment variables (email + initial password), so there's always at least one account able to sign in and invite others
  2. **Admin invite:** an Admin enters an email address and a role (Admin or standard User) in the Admin panel (FR-10); the system generates a single-use, time-limited invite token and a corresponding setup link (e.g., valid 7 days)
- **Invite delivery is manual for v1:** the Admin panel displays the generated link with a copy button; the Admin sends it to the invitee however they choose (WhatsApp, email, etc.). No email-sending service (Resend, SendGrid, etc.) is part of the stack for v1 — this keeps the stack smaller and avoids setting up transactional email infrastructure for what is, today, a rare action performed by one person
- The invited person visits the link, which opens a token-gated account-setup page (name + password) — reachable only with a valid, unexpired, unused token; never a discoverable or independently-usable page
- An expired or already-used invite link shows a clear error and creates no account
- Practically: since the answer today is "no one else needs access," this is infrastructure built ahead of need — the bootstrap Admin account (you) is sufficient on day one, and the invite flow simply exists for whenever that changes

### FR-10: Admin — User Management & Tracking
- A dedicated **Admin** area, visible only to accounts with `role = ADMIN`, lists every account: email, role, status (active/deactivated), date created, and last login
- Admin can **invite** a new user (triggers FR-9)
- Admin can **deactivate** an active user, which immediately blocks that account from authenticating or continuing any open session (Section 4.1)
- Admin can **reactivate** a previously deactivated user
- Admin cannot deactivate their own account, to prevent accidentally locking out the only account able to undo it — if more than one Admin exists, one Admin can still deactivate another Admin, just never themselves
- "Tracking" is satisfied at minimum by the last-login and status columns above; a fuller login-history view (Section 4.1's `LoginEvent` log) is a reasonable v1.1 addition if you later want visibility into repeated failed attempts or sign-in patterns, but isn't required to meet the core request

---

## 6. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| **Hosting** | Vercel (frontend + API routes) |
| **Database** | Vercel Postgres / Neon |
| **Performance** | Dashboard loads in <2s with up to ~10 years of quarterly data |
| **Responsiveness** | Usable on mobile browser, not just desktop |
| **Data integrity** | All monetary values stored as decimal (not float) to avoid rounding errors |
| **Backup** | Database should support point-in-time restore (native to most managed Postgres providers) |
| **Currency** | All values in GHS; no multi-currency support in v1 |
| **Password security** | Passwords hashed with bcrypt or argon2 — never stored in plaintext, never logged |
| **Session security** | Sessions invalidated immediately on deactivation, not just at next sign-in (Section 4.1) |
| **Brute-force protection** | Rate limiting / lockout on repeated failed sign-in attempts (FR-8) |

---

## 7. API Endpoints (indicative)

```
GET    /api/holdings                  -- list all holdings
POST   /api/holdings                  -- create a holding
PATCH  /api/holdings/:id               -- update / deactivate a holding

GET    /api/quarters                  -- list all quarters with entries
POST   /api/quarters                  -- create a new quarter's entries
PATCH  /api/quarters/:date             -- edit a quarter's entries
DELETE /api/quarters/:date             -- delete a quarter

GET    /api/targets                   -- current target allocations
POST   /api/targets                   -- set new targets (bucket + holding level)

GET    /api/dashboard/summary         -- computed KPIs + latest allocation
GET    /api/dashboard/history         -- time series for charts

GET    /api/compare/quarters?from=:date&to=:date
                                       -- per-holding and per-bucket delta between two quarters
                                          (defaults to latest vs. previous if no params given);
                                          response includes each quarter's full bucket breakdown
                                          (not just deltas), so the frontend can render a pie
                                          chart per quarter alongside the delta table

GET    /api/compare/target?quarter=:date
                                       -- target vs. actual variance as of a given quarter,
                                          using the target effective at that date; response
                                          includes both the actual-allocation breakdown and the
                                          target-allocation breakdown, so both can be charted
                                          side-by-side (actual pie vs. target pie)
GET    /api/compare/target/history    -- variance-from-target per bucket, across all quarters
                                          (feeds the "drift over time" trend chart)

POST   /api/auth/sign-in              -- email + password -> session cookie
POST   /api/auth/sign-out             -- clear session
GET    /api/auth/session              -- current signed-in user (id, email, role)

GET    /api/invite/:token             -- validate an invite token (used by the setup page)
POST   /api/invite/:token/accept      -- complete account setup (name + password) with a valid token

GET    /api/admin/users               -- Admin-only: list all users with role/status/last login
POST   /api/admin/invite              -- Admin-only: create an Invite for an email + role
PATCH  /api/admin/users/:id           -- Admin-only: deactivate / reactivate a user
```

---

## 8. Migration Note (from spreadsheet)

The existing spreadsheet's six historical quarters (Mar 2025 – Jun 2026) used aggregated bucket values only, since it never tracked individual tickers. When migrating:
- Historical quarters can be imported at the **bucket level only** (there is no way to retroactively know, e.g., what portion of the old "Mutual Funds" total was Epack vs. ArkFund vs. MFund)
- Going forward from the first quarter entered in the new app, all entries should be at the **individual holding level**
- Recommend seeding the database with the six historical bucket totals as a one-time import, clearly flagged as "aggregated / pre-migration" data, so the dashboard's historical chart still shows continuous history even though granularity improves from that point onward

---

## 9. Open Questions for Implementation

1. Should "Hot Narratives" crypto be tracked as a single line, or should each token (e.g., CREPE) be its own holding? (Recommendation: individual holdings, since you've already seen how much one token can move the total.)
2. Should target allocation changes require a "reason" note, to build a decision log over time?
3. Should the app send any reminder (email/notification) each quarter to prompt data entry, or is that out of scope for v1?
4. ~~Login audit log — full history, or just `lastLoginAt`?~~ **Resolved:** Option A — `User.lastLoginAt` only (Section 4.1). No `LoginEvent` table in v1; the model stays specified in the schema for a clean later add-on if a second account is ever invited or the threat model changes.
5. ~~If an Admin invites a new user, should the app handle emailing the invite link...~~ **Resolved:** manual copy-paste by the Admin for v1 (FR-9) — no email-sending service needed.
