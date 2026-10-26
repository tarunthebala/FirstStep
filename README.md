# FirstStep

**Take the first step toward financial confidence.** FirstStep helps college students and recent graduates understand their student loans, practice their budget, and prepare for repayment before their grace period ends.

Core journey (enforced server-side): **graduation date → upload StudentAid.gov loan data → connect supported accounts (optional) → review and confirm the financial summary → generate a personalized plan → dashboard and Money Lab.** Every step also works with manual entry.

---

## Quick start

```bash
npm install
cp .env.example .env          # defaults run fully locally
npm start                     # builds the browser bundle, starts http://localhost:3000
```

- `npm run dev` — rebuilds the bundle on change and restarts the server.
- `npm test` — unit + API acceptance tests (Node’s built-in test runner).
- `npm run e2e` — browser acceptance test with Playwright (`npx playwright install chromium` first).
- `npm run typecheck` — TypeScript check of server and shared code.

Try it without an account: **“Explore a demo with fictional data”** on the landing page creates a throwaway account with clearly labeled sample data. It works with both data drivers. Each demo account gets a random email and a random one-time password that is never stored or shown, so there are no demo credentials anywhere in the code or config. With Supabase, demo mode needs `SUPABASE_SERVICE_ROLE_KEY` on the server, and demo accounts older than 24 hours are deleted automatically. Set `DEMO_MODE=false` to turn it off.

Sample upload file: `fixtures/MyStudentData.sample.txt` (fictional, in Federal Student Aid’s published layout).

---

## Brand: WACODE 2026 palette

Colors were read from the live CSS of https://www.wacode2026.com/ on 2026-10-23. The site declares these `:root` variables; FirstStep uses them as its palette.

| Token | Value | Source on wacode2026.com |
|---|---|---|
| Primary | `#143e29` | `--forest` |
| Text | `#20271e` | `--ink` |
| Page background | `#f3f2ed` | `--paper` |
| Accent (soft) | `#c8dfb5` | `--sage` |
| Border | `#d4d7cb` | `--line` |
| Secondary text | `#596052` | `--muted` |
| Secondary / accent | `#19522f`, `#3b773f`, `#a5bf8f`, `#0c2e1c` | hero gradient stops |
| Muted surface | `#dfe6d8` | card background |

**Interface style (Apple-inspired).** The colors stay WACODE's, but form and motion follow Apple's design guidance (WWDC *Designing Fluid Interfaces* and related talks), translated for the web:

- **Type:** the system font (SF Pro on Apple devices, Segoe UI on Windows) with optical sizing; tracking tightens as size grows (−0.038em on display text, near 0 on body), and leading tightens on large headings. Sizes are in `rem`, so the layout scales with the user's text size.
- **Shape and depth:** capsule buttons, continuous rounded corners, soft layered shadows instead of hard rules.
- **Materials:** headers, the sidebar, the mobile tab bar, dialog footers and toasts are translucent (`backdrop-filter`) with content scrolling underneath. A soft edge appears only once content actually scrolls under the header.
- **Response:** every pressable element reacts on pointer-down, instantly; segmented controls select on pointer-down.
- **Springs** (`src/client/lib/spring.ts`): critically damped by default, interruptible (always animate from the current value and velocity), with Apple's damping/response parameters. They drive the segmented-control thumb (independent X and width springs), dialog presentation, and toasts (enter and exit along the same path).
- **Sheets on phones:** dialogs become bottom sheets that track the finger 1:1 after a 10px threshold, rubber-band when pulled up, hand off release velocity, project a flick's momentum to decide dismiss vs. return, and bounce only when the gesture carried momentum. Dismissal releases the modal lock immediately, so the page is never blocked during the exit animation.
- **Accessibility preferences:** `prefers-reduced-motion` (no travel, cross-fades only), `prefers-reduced-transparency` (solid materials), and `prefers-contrast: more` (solid backgrounds, defined borders).

Additions (the reference has no status palette): white surface, and success/warning/error colors in the same earth-green family, chosen for AA contrast on paper. Tokens live in `src/shared/theme.ts` and are mirrored as CSS variables in `src/client/styles/tokens.css`.

**Logo.** No logo file was supplied, so the staircase “1” was redrawn as SVG from the brief: two ascending steps rising into the numeral’s stem, in `#3b773f` → `#19522f` → `#143e29`, with a “First**Step**” wordmark (ink + forest). Files: `public/brand/logo.svg`, `logo-mark.svg`, `logo-reverse.svg` (for dark backgrounds), `public/favicon.svg`. If you have the original logo artwork, drop it in and keep these colors.

---

## Stack (and why it differs from the brief)

The brief suggested Next.js, Supabase JS, Recharts and shadcn/ui. The build environment had **no access to the npm registry**, only a fixed set of preinstalled packages (React 19, esbuild, TypeScript, tsx, zod, react-icons, Playwright). Rather than ship unrun code, FirstStep was built on what could actually be executed and tested:

| Concern | Used here |
|---|---|
| UI | React 19 single-page app, bundled by esbuild |
| Server | TypeScript on Node’s `http` module (`src/server`) — all private data and integrations are server-side |
| Auth + DB (production) | Supabase Auth and PostgREST called over `fetch` (no SDK needed), with SQL migrations and Row Level Security |
| Auth + DB (development) | Local JSON-file driver with scrypt password hashes and HTTP-only session cookies |
| Validation | zod on every API input |
| Icons | Lucide (via `react-icons/lu`) |
| Charts | Hand-built accessible SVG charts with text summaries |
| Tests | `node:test` (unit + API), Playwright (browser) |

The domain code (`src/shared`: calculations, plan generation, types, learning content) is framework-independent and can be moved into a Next.js App Router project unchanged; the API handlers map one-to-one onto route handlers.

---

## Environment variables

See `.env.example` for every variable with comments. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `DATA_DRIVER` | – | `local` (default) or `supabase` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | with `supabase` | Auth + data API |
| `SUPABASE_SERVICE_ROLE_KEY` | with `supabase` | **Server only.** Connection secrets table and account deletion |
| `APP_ENCRYPTION_KEY` | production | AES-256-GCM key for Plaid access tokens (`openssl rand -base64 32`) |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | optional | Bank connections via Plaid Link |
| `PLAID_ENABLE_LIABILITIES` | optional | Shows “Connect Loan Servicer” (Plaid Liabilities) |
| `APP_URL` | production | Redirect links; `https` turns on Secure cookies and HSTS |
| `TRUST_PROXY` | behind a host proxy | `true` on Render/Railway/Fly/Heroku so rate limits are per visitor |

No secret is ever sent to the browser. When a provider isn’t configured, the UI says so and offers manual entry.

### Deploying a public demo (e.g. for judging)

The quickest path needs no third-party keys at all:

```bash
NODE_ENV=production
APP_URL=https://your-app.example.com
APP_ENCRYPTION_KEY=$(openssl rand -base64 32)   # required when NODE_ENV=production
TRUST_PROXY=true
DATA_DRIVER=local
DEMO_MODE=true
```

Build command `npm install --include=dev` (the start script uses `tsx` and `esbuild`, which are dev dependencies that hosts skip when `NODE_ENV=production`), start command `npm start`. With the local driver, data lives in `.data/` on the server's disk, so use a host with a persistent disk or accept that a redeploy resets accounts. Demo accounts older than 24 hours are cleaned up automatically. Set secrets in the host's dashboard, never in the repo.

---

## Database (Supabase)

1. Create a Supabase project. Enable email confirmations if you want verification (the sign-up flow handles both).
2. Run **both** migrations in order: `supabase/migrations/0001_schema.sql`, then `0002_readiness.sql` (SQL editor or `supabase db push`). The readiness meter needs the `habit_logs` and `engagement` tables from 0002.
3. Set **Site URL** to `APP_URL` and add `APP_URL/reset-password` and `APP_URL/login` to redirect URLs.
4. Set `DATA_DRIVER=supabase` and the three Supabase variables.

**Security model.** Every user-owned table has `user_id` and RLS policies limiting select/insert/update/delete to `auth.uid() = user_id` (with `force row level security`). Data requests are sent with the signed-in user’s JWT, so the database enforces ownership; the server additionally filters by `user_id` and only ever takes the user ID from the verified session. `connection_secrets` has RLS on and **no** policies, so only the service role (the server) can touch it. Anonymous access is revoked.

> The Supabase driver follows Supabase’s documented REST endpoints but **was not run against a live Supabase project** in the build environment. Test sign-up, a full onboarding and account deletion against your project before relying on it. The local driver is fully tested.

### Data categories (kept separate)

1. **Raw imports** — `loan_imports.raw` (never edited), `transactions` from providers.
2. **User-edited / confirmed data** — `loans`, `income_sources`, `expense_categories`, `savings_accounts`, `savings_goals`, `budget_settings`; `financial_summaries` snapshots with `confirmed_at`.
3. **Calculated metrics** — `plans.metrics` (and live metrics computed from saved data).
4. **Hypothetical scenarios** — `scenarios` (Money Lab never writes to baseline tables).
5. **Generated tasks** — `tasks`.

Every loan, income, expense and balance carries a source: imported, entered by you, estimated, verified by you, from a connected account, or demo. Editing an imported value turns it into “entered by you” unless the user marks it verified. New imports never overwrite saved loans: the review screen lets the user add each record as new or explicitly update a chosen loan, and discrepancies between sources are shown, not resolved silently.

---

## Integrations

### StudentAid.gov file
Parser: `src/server/studentaid.ts`, built to Federal Student Aid’s published *Download My Aid Data File Layout* (`Label:Value` lines; each loan starts at `Loan Type Code:`). It keeps principal and unpaid interest separate, ignores the student’s name/address/contact fields, rejects non-text or oversized files, warns on missing fields and total mismatches, parses in memory (no temp files) and never logs contents. In-app download instructions are deliberately hedged: we confirmed the file layout but couldn’t see inside a signed-in StudentAid.gov account, so menu names are described as “may change.”

### Plaid
`src/server/plaid.ts` uses Plaid’s REST API: `/link/token/create`, `/item/public_token/exchange`, `/accounts/get`, `/transactions/sync`, `/liabilities/get`, `/item/remove`. Bank connections request `transactions`; the servicer option requests `liabilities`, appears only with `PLAID_ENABLE_LIABILITIES=true`, is read-only, and sends results to the same review screen as a file import. Plaid doesn’t publish which student loan servicers Liabilities covers, so the UI never promises a particular servicer works. Access tokens are encrypted and stored server-side only; disconnecting calls `/item/remove` and deletes the stored token, and the user chooses whether imported transactions are kept or deleted.

> **Not tested with live Plaid credentials.** Use sandbox (`PLAID_ENV=sandbox`) with Plaid’s test institutions first. For production OAuth institutions, set `PLAID_REDIRECT_URI` and register it with Plaid.

### Learning coach (Money Lab)
A chat tutor for **financial literacy only**, built from hand-written answers — no AI and no network calls. It answers from the built-in library in `src/shared/coach-kb.ts` (student loans, interest, repayment, budgeting, saving, credit, banking safety and using FirstStep), explains the user's own numbers and the Money Lab scenario on screen, suggests related questions, and declines off-topic questions with a fixed redirect. Nothing the user types leaves FirstStep. Tests: `tests/coach.test.ts` and `tests/coach-kb.test.ts`.

### Email
No email provider is wired. Reminders are in-app; the email opt-in is shown disabled with an explanation. Locally, password-reset links are printed to the server console.

---

## Financial engine

`src/shared/finance.ts` — pure, tested functions. Money is accumulated in integer cents. Each loan is amortized on its own (standard formula; 0% handled as P/n) and results are aggregated — one average rate/term is never applied across loans. Missing inputs return `null` plus the reason. Every estimate exposes its assumptions for the “How is this calculated?” panels. Default term assumption: 120 months, labeled as an assumption, changeable in Settings and per loan.

`src/shared/plan.ts` — deterministic plan generator: metrics, missing information, preparation stage, applicable tasks with reasons and priorities (gaps first), and recommendations. First-payment and grace-period dates are never inferred from graduation.

### Financial Readiness Meter (`src/shared/readiness.ts`, `src/client/components/readiness.tsx`)

Shown at the top of the dashboard, right below the welcome message. Four equal categories of 25 points, every point earned from saved data or a completed action:

| Category | Items (points) |
|---|---|
| Understand and verify your loans | add loans (4), every loan has balance + rate (6), verified against servicer (10, proportional), first payment date recorded (5) |
| Review income, expenses and budget | income (6), main expense categories (7, proportional), spending reviewed — no categories or transactions left to check (6), summary confirmed (6) |
| Create a repayment strategy | payment estimate (5), saved practice payment (7), explored repayment options (6), saved what-if scenario (7) |
| Keep up money habits | savings goal (5), weekly habits (2 points per habit per week, up to 3 a week, max 20) |

- **Integrity:** no points for logging in or opening pages; a habit counts once per week (enforced by a unique key in the database), habit credit never expires, so the score never drops for missing a day or a week; 100% is shown only when every item is complete and means only that FirstStep's preparation checklist is done.
- **Copy:** five tiers (0–24, 25–49, 50–74, 75–99, 100) with the specified headlines and messages; no emojis anywhere.
- **Your Next Win:** the single most valuable incomplete step whose prerequisites are met (adding loans first, foundation before habits), with a button straight to that section; when everything is done it points to reviewing the plan.
- **Milestones** at 25/50/75/100%: a refined success card with a short sheen and badge pulse, shown once. The server re-checks the score before recording a milestone, and the recorded milestone only ever increases.
- **Celebrations** of real actions (three habits in a week, reviewing spending, a new repayment plan, returning after five or more days away) appear as a dismissible note; dismissals persist.
- **Motion and states:** the percentage and bar animate on a spring from the last value this browser showed (so return visits only animate the change), with no animation under reduced motion. Loading skeleton, getting-started state when there isn't enough information, and inline errors for habit saves.
- **Storage:** `habit_logs` and `engagement` tables (`supabase/migrations/0002_readiness.sql`, RLS on both).

---

## Learn content

Ten modules in `src/shared/learn.ts`, each with an objective, explanation, example, interactive exercise, knowledge check and sources. Facts about grace periods, delinquency/credit reporting, repayment plans (Tiered Standard and RAP for loans disbursed on/after July 1, 2026) and interest were checked against StudentAid.gov and consumerfinance.gov pages on 2026-10-24; every link was confirmed to resolve to a real page. Re-verify before launch — rules change.

---

## Testing

| Suite | Command | Covers |
|---|---|---|
| Unit | `npm test` | Amortization, 0% loans, invalid inputs, multiple loans with different terms, interest accrual, cent precision, cash flow without double counting, negative cash flow, delayed employment (including partial months and recovery), unexpected expenses, practice payment, lifestyle, repayment comparison, readiness; parser (layout, PII stripping, missing fields, bad files); plan generation (stages, no invented payments/dates, applicability, ordering) |
| API acceptance | `npm test` | Sign-up → onboarding resume → graduation validation → upload/parse → review/edit/confirm → connections unavailable/skip → summary confirmation required before plan → plan → baseline edits vs. confirmed snapshot → scenarios isolated → log out/in → re-confirm → **another user gets 404 on every record** → export → account deletion; CSRF header enforcement |
| Browser acceptance | `npm run e2e` | The same journey through the real UI at 1280px with the file upload, plus a manual-only journey at 375px with a no-horizontal-scroll check |

---

## Project structure

```
src/shared/     domain types, finance engine, plan generator, learn content, design tokens
src/server/     HTTP server, API routes, auth + storage drivers, parser, Plaid, coach, demo seed
src/client/     React app: pages, layouts, components, styles
supabase/       SQL migrations with RLS
public/         index.html, favicon, logo SVGs
fixtures/       fictional StudentAid.gov sample file
tests/, e2e/    automated tests
```

## Known limitations / next steps

- Supabase driver and Plaid integration need testing against a live project and sandbox credentials.
- No email/SMS provider; reminders are in-app only.
- The logo is a redraw from the written brief; swap in the original artwork if available.
- Terms of Use is a plain-language template and needs legal review before launch.
- If you move to Next.js, port `src/server/api.ts` handlers to route handlers and keep `src/shared` as-is.
