# Go4Solar Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan prompt-by-prompt. Steps use checkbox (`- [ ]`) syntax for tracking. Semako pastes one prompt at a time into Claude Code in VS Code; do only that prompt, then stop.

**Goal:** Ship Go4Solar Phase 1 to production on Vercel. The prelaunch waiting list goes live first (Milestone A). The full consumer core follows: quotes, KYC, guarantor, e-signature, deposit with direct debit, admin approvals and the profit and forecast dashboard (Milestones B and C).

**Architecture:** A single Next.js 15 App Router app on Vercel with Supabase for the database, login and file storage. All money and sizing logic lives in pure TypeScript engines under `src/lib/` and is tested first with Vitest. Every outside service (KYC, payments, messaging, AI vision) sits behind an interface with a mock adapter, so the whole site runs end to end before any paid account is switched on.

**Tech Stack:** Next.js 15, TypeScript strict, Supabase (`@supabase/ssr`), Tailwind CSS + shadcn/ui, react-hook-form + zod, Recharts, `@react-pdf/renderer`, Vitest, Playwright, Paystack, QoreID, Termii, Resend, Anthropic API, Vercel.

**Spec:** `docs/PRD.md` (designed copy: `docs/Go4Solar_App_PRD.pdf`). Project rules: `CLAUDE.md`.

---

## Before you start (Semako, about 30 minutes, once)

1. **Put the kit files in your Go4Solar repo** (the one with the redesigned landing page):
   - `CLAUDE.md` → the repo's top folder (next to `package.json`)
   - `docs/PRD.md`, `docs/Go4Solar_App_PRD.pdf`, `docs/superpowers/plans/2026-10-09-go4solar-phase-1.md` → a `docs` folder at the top
   - `public/brand/go4solar-logo.png` → `public/brand/`
2. **Accounts you need now (all free to start):** GitHub (repo), Vercel (connected to that repo), Supabase (create a project called `go4solar`, region closest to Nigeria, and save the database password).
3. **Accounts you can add later** (the site runs on mocks without them): Anthropic API key (AI watts lookup), Paystack test keys, QoreID sandbox, Termii, Resend.
4. Open the repo in VS Code, start Claude Code, and paste **Prompt 1**. After each prompt, check "You should see" before moving on.

---

## Global Constraints

- Next.js **15** App Router; TypeScript `strict: true`; no `any`; Node **20+**; npm.
- Supabase with **RLS on every table**; service role key only in server code.
- Money in Postgres: `numeric(14,2)` naira. Display only via `formatNaira` → `₦2,475,248`. Rounding: `Math.round` to whole naira.
- Inter loaded with `subsets: ['latin','latin-ext']` so **₦ renders on Windows Chrome**.
- Brand colours: dark `#0E3B22`, green `#2E8B3A`, blue `#1B4E9B`, orange `#F47B20`, gold `#FFC94D`, mist `#F4F8F5`.
- Launch states: Abuja (FCT), Kaduna, Lagos. Tenures: 3, 6, 9, 12 months. Deposit: 20%–95%, minimum 20%.
- Late fee: **0.75% of the overdue amount per day**, with a cap set by super admin.
- Consumer copy says "payment plan", never "loan"/"interest". "0% interest" appears only beside the total amount payable.
- Markup is spread across equipment lines only (not installation). Funder interest is charged on `max(0, cost price − deposit)`.
- Appliance categories (exact): Lighting · TV and Electronics · Kitchen Appliances · Cooling and Comfort · Laundry and Home Care · Water and Outdoor · Business and Office (SME).
- `NEXT_PUBLIC_LAUNCH_MODE` = `prelaunch` (CTA leads to the waiting list) or `live` (CTA leads to quotes and applications).
- Never mention "Microvis" or "Liquid Power". SPEWA is a programme.

## Review Focus

1. **₦ glyph on Windows Chrome:** the sign must render as ₦, not a struck-through N or a box. *Test: Prompt 1, `money.test.ts` plus a Playwright check that the landing page uses the Inter latin-ext font file.*
2. **Very high deposits (90–95%):** the money drawn from the funder can go to zero or below. Profit must not show negative interest, and the "return on funder money" figure must show "—", not Infinity. *Test: Prompt 4, `loanProfit` with a 95% deposit.*
3. **One consumer reading another's data:** application rows, KYC files and guarantor details must be invisible to other users. *Test: Prompt 15, RLS tests that log in as user B and fail to read user A's rows and signed URLs.*
4. **Paystack webhook sent twice:** the same payment event must not create two payments or two deposits. *Test: Prompt 12, a webhook handler test that posts the same event twice and expects one `payments` row.*
5. **Guarantor link reused or expired:** an expired (over 72 h) or already-completed link must show a friendly page and never let a second person sign. *Test: Prompt 11, token tests for expired, used and valid links.*

---

# Milestone A — Waiting list live

### Prompt 1 — Repo audit and foundations

**Paste into Claude Code:**

```
Read CLAUDE.md fully, then docs/PRD.md sections "Executive summary" and "Features 1–2".
Task: Prompt 1 of docs/superpowers/plans/2026-10-09-go4solar-phase-1.md — repo audit and foundations.

1. Audit: list what already exists (framework and version, TypeScript or JS, Tailwind config,
   landing page files, fonts). Report it in 10 lines max. If the repo is not Next.js 15 App Router
   with TypeScript, propose the smallest migration and STOP for my approval before changing anything.
2. Create branch `phase-1`.
3. Ensure: Next.js 15 App Router, TypeScript strict (tsconfig "strict": true, "noUncheckedIndexedAccess": true),
   path alias "@/*" -> "src/*", ESLint (next/core-web-vitals), Prettier.
4. Tailwind: add brand colours from CLAUDE.md section 10 as `brand.dark/green/blue/orange/gold/mist`.
   Initialise shadcn/ui (style "default", base colour "neutral", CSS variables on) and set --primary to brand green.
5. Fonts: src/app/layout.tsx loads Inter via next/font/google with subsets ['latin','latin-ext'],
   display 'swap', variable '--font-inter'; Tailwind fontFamily.sans uses it. Remove any other Inter import
   (this fixes the ₦ strikethrough bug on Windows Chrome).
6. src/config/site.ts exports: siteConfig { name, legalName: 'Go4Solar Energy Limited', address, email, phones[3],
   url: 'https://www.go4solar.app', launchStates: ['FCT','Kaduna','Lagos'] } and
   launchMode(): 'prelaunch' | 'live' reading NEXT_PUBLIC_LAUNCH_MODE (default 'prelaunch').
7. TDD src/lib/money.ts (write src/lib/money.test.ts first):
   - formatNaira(2475248) === '₦2,475,248'; formatNaira(0) === '₦0'; formatNaira(-39603) === '−₦39,603'
   - formatPercent(0.42203, 1) === '42.2%'
   - roundNaira(165016.5) === 165017 (Math.round)
   - roundToStep(853218, 100) === 853200
   - normalisePhoneNG('08031234567') === '+2348031234567'; normalisePhoneNG('+2348031234567') === '+2348031234567';
     normalisePhoneNG('12345') throws InvalidPhoneError
8. Tooling: install vitest @vitest/coverage-v8 @playwright/test. package.json scripts:
   "check": "tsc --noEmit && next lint && vitest run", "test": "vitest", "e2e": "playwright test".
   Add e2e/smoke.spec.ts: home page returns 200, has a "Calculate my load" link, and the page's CSS
   contains a @font-face whose unicode-range includes U+20A6 (latin-ext).
9. .env.example with every variable named in this plan (no values): NEXT_PUBLIC_LAUNCH_MODE,
   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
   KYC_PROVIDER, QOREID_CLIENT_ID, QOREID_SECRET, PAYMENTS_PROVIDER, PAYSTACK_SECRET_KEY,
   NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY, MESSAGING_PROVIDER, TERMII_API_KEY, TERMII_SENDER_ID,
   RESEND_API_KEY, EMAIL_FROM, VISION_PROVIDER, ANTHROPIC_API_KEY, ANTHROPIC_VISION_MODEL,
   NEXT_PUBLIC_WHATSAPP_NUMBER, GUARANTOR_TOKEN_SECRET.
10. Run npm run check and npm run e2e. Show the diff, commit "chore: foundations", push the branch.
Update CLAUDE.md section 12. Tell me how to see it.
```

**You should see:** `npm run dev` opens your current landing page at http://localhost:3000 with no errors. A Vercel preview link appears for the `phase-1` branch. On a Windows PC, ₦ shows correctly anywhere a price appears.

---

### Prompt 2 — Supabase, roles and login

**Paste into Claude Code:**

```
Read CLAUDE.md (sections 3, 5, 6, 7) and docs/PRD.md "Admin back office" (Staff roles) and
"Technical architecture, integrations and data model".
Task: Prompt 2 — Supabase foundation.

Before you start, tell me exactly where to find these in the Supabase dashboard and wait until I paste them
into .env.local: project URL, anon key, service role key, project ref.

1. Install @supabase/supabase-js @supabase/ssr and the Supabase CLI (dev dependency). Link the project.
2. src/lib/supabase/{server.ts, client.ts, admin.ts, middleware.ts}; admin.ts starts with `import 'server-only'`.
3. Migration 0001_core.sql:
   - enum app_role: consumer, guarantor, installer, vendor, super_admin, credit_officer, operations,
     collections, finance, content
   - profiles (id uuid pk -> auth.users, full_name, phone_e164, email, role app_role default 'consumer',
     state, created_at); trigger creates a profile on sign-up
   - staff_permissions (profile_id, permission text) — includes 'assisted_entry'
   - settings (key text pk, value jsonb, updated_by, updated_at) seeded with: min_deposit_share 0.2,
     tenures [3,6,9,12], late_fee_daily 0.0075, late_fee_cap_share 0.25, quote_validity_days 7,
     sizing {headroom:1.25, powerFactor:0.8, dod:0.8, inverterEfficiency:0.9, panelDerate:0.75,
     panelWatts:550, nightShare:0.6, backupHours:{essential:3, comfort:8},
     inverterSizesKva:[1,1.5,2.5,3.5,5,7.5,10,15,20], batteryStepKwh:2.5,
     pshByState:{FCT:5.5, Kaduna:5.8, Lagos:4.5}}
   - audit_log (id, actor_id, action, entity, entity_id, before jsonb, after jsonb, created_at)
   - outbox (id, channel 'sms'|'whatsapp'|'email', to, template, payload jsonb, status, created_at)
   - helper SQL functions: is_staff(), has_role(app_role), has_permission(text)
   - RLS: profiles readable/updatable by self, readable by staff; settings readable by all, writable
     by super_admin; audit_log insert by staff, read by super_admin; outbox read by staff.
4. src/lib/auth/roles.ts: requireUser(), requireRole(...roles), requireStaffWithMfa() (redirects to
   /admin/mfa when the session's aal is not 'aal2').
5. Pages: /login (email + password), /admin/mfa (enrol TOTP with QR code, then verify),
   /admin (placeholder "Back office" page behind requireStaffWithMfa).
6. scripts/make-super-admin.ts: `npm run make-admin -- you@email.com` sets that profile to super_admin.
7. npm run db:types generates src/lib/supabase/database.types.ts.
8. Vitest tests for roles.ts using a fake session: consumer blocked from staff routes; staff without aal2
   redirected to /admin/mfa.
Run checks, show diff, commit "feat: supabase core, roles, staff 2FA", push. Update CLAUDE.md. How to see it.
```

**You should see:** you can sign up at `/login`, make yourself super admin with the script, set up 2FA with Google Authenticator, and reach the `/admin` placeholder.

---

### Prompt 3 — Load and sizing engines (test-first)

**Paste into Claude Code:**

```
Read CLAUDE.md, docs/PRD.md "Feature 3: Load calculator" and "Feature 4 → Sizing logic".
Task: Prompt 3 — pure engines src/lib/load and src/lib/sizing. Tests first, no UI.

Types (src/lib/load/types.ts):
  CategoryId = 'lighting'|'tv_electronics'|'kitchen'|'cooling'|'laundry'|'water_outdoor'|'business'
  LoadItem { id: string; category: CategoryId; name: string; watts: number; qty: number;
             hoursPerDay: number; surgeFactor: number; dutyCycle: number; custom: boolean }
  LoadTotals { runningW: number; surgeW: number; dailyKwh: number;
               byCategoryW: Record<CategoryId, number>; heavyItems: LoadItem[] }

computeLoadTotals(items: LoadItem[]): LoadTotals  (src/lib/load/totals.ts)
  runningW = Σ watts×qty; surgeW = runningW + max over items of watts×(surgeFactor−1) (0 if none);
  dailyKwh = Σ watts×qty×hoursPerDay×dutyCycle / 1000 (round to 2 dp);
  heavyItems = items with watts ≥ 1000.
  Validation: watts 1–10000, qty 1–100, hoursPerDay 0–24 else throws LoadValidationError.

Test fixture (load.fixture.ts): 10× LED bulb 10 W 6 h; 1× Fridge 150 W 24 h duty 0.4 surge 3;
  1× 43" TV 80 W 6 h; 2× Ceiling fan 75 W 8 h (others duty 1, surge 1).
  Expect runningW 480, surgeW 780, dailyKwh 3.72. Empty list → all zeros, no throw.

sizeSystem(totals: LoadTotals, plan: 'essential'|'comfort'|'independence', state: 'FCT'|'Kaduna'|'Lagos',
           s: SizingSettings): SystemSize  (src/lib/sizing/size.ts)
  SystemSize { inverterKva; batteryKwh; panelCount; panelKw; backupHoursFullLoad; realisticBackupHours }
  - inverter VA = max(headroom×runningW, surgeW)/powerFactor → smallest stocked kVA ≥ VA
  - battery raw: essential/comfort = runningW×backupHours/(1000×dod×inverterEfficiency);
    independence = dailyKwh×nightShare/(dod×inverterEfficiency); round UP to batteryStepKwh, min 1 step
  - panels kW: essential/comfort = (dailyKwh×(1−nightShare) + batteryKwh×dod)/(psh×panelDerate);
    independence = dailyKwh/(psh×panelDerate); panelCount = ceil(kW×1000/panelWatts); panelKw = count×panelWatts/1000
  - backupHoursFullLoad = batteryKwh×dod×inverterEfficiency×1000/runningW (1 dp)
  - realisticBackupHours = batteryKwh×dod×inverterEfficiency/(dailyKwh/24) (1 dp)
  - runningW = 0 → throws LoadEmptyError; VA above largest stocked size → throws LoadTooLargeError
Tests with the fixture, state Lagos, default settings from the 0001 seed:
  inverterKva 1 for all plans;
  essential: batteryKwh 2.5, panelCount 2, panelKw 1.1, backupHoursFullLoad 3.8, realisticBackupHours 11.6
  comfort:   batteryKwh 7.5, panelCount 5, panelKw 2.75, backupHoursFullLoad 11.3, realisticBackupHours 34.8
  independence: batteryKwh 5, panelCount 3, panelKw 1.65, backupHoursFullLoad 7.5, realisticBackupHours 23.2
(note: 3.75→3.8 and 11.25→11.3 with Math.round to 1 dp)
Write tests first, run them red, implement, run green. Run checks, diff, commit "feat: load and sizing engines".
```

**You should see:** `npm run test` shows every load and sizing test passing. There's no new page yet; that's expected.

---

### Prompt 4 — Pricing and profit engines (test-first)

**Paste into Claude Code:**

```
Read CLAUDE.md section 9, docs/PRD.md "Pricing, markup and funders" (all subsections) and
"Profitability, analytics and forecasting → What the system calculates for every loan".
Task: Prompt 4 — src/lib/pricing and src/lib/profit. Tests first.

priceQuote(input: QuoteInput): QuoteResult  (src/lib/pricing/price.ts)
  QuoteInput { lines: { sku: string; name: string; category: 'panels'|'battery'|'inverter'|'accessories';
               unitCost: number; qty: number }[]; installCost: number;
               marginByCategory: Record<category, number>; pricingRateAnnual: number;
               tenureMonths: 3|6|9|12; depositShare: number }
  QuoteResult { costPrice; systemPrice; markupShare; lines: {..., unitPrice, lineTotal}[];
                installCost; deposit; balance; instalments: number[]; monthly; snapshot: object }
  Algorithm:
   E = Σ unitCost×qty; C = Σ unitCost×qty×(1+margin) + installCost; f = pricingRateAnnual×tenure/12
   systemPrice = round(C / (1 − f×(1 − depositShare)))
   markupShare m = (systemPrice − installCost − E)/E
   each lineTotal = roundToStep(unitCost×qty×(1+m), 100); add (systemPrice − installCost − Σ lineTotals)
   to the largest lineTotal (first if tied)
   deposit = round(systemPrice×depositShare); balance = systemPrice − deposit
   monthly = round(balance/tenure); instalments = monthly × (tenure−1) then a last one = balance − monthly×(tenure−1)
  depositShare < settings min (0.2) or > 0.95 → throws DepositOutOfRangeError.
Fixture: panels 600000, battery 600000, inverter 300000, accessories 100000 (qty 1 each),
  margins all 0.125, install 200000, rate 0.24.
  12 months, 20%: systemPrice 2475248, markupShare ≈0.42203, lineTotals [853248, 853200, 426600, 142200],
                  deposit 495050, monthly 165017, Σ instalments 1980198, costPrice 1800000
  12 months, 50%: systemPrice 2272727, deposit 1136364, monthly 94697
  12 months, 95%: systemPrice 2024291
  3 months, 20%:  systemPrice 2100840, monthly 560224
  Σ lineTotals + install === systemPrice for every case.

loanProfit(input: LoanProfitInput): LoanProfit  (src/lib/profit/loanProfit.ts)
  LoanProfitInput { systemPrice; costPrice; deposit; tenureMonths; funderAnnualRate; funderMethod: 'flat';
                    unitCosts: { kycPerLoan; feePerInstalment; lossProvisionShare } }
  LoanProfit { drawn; funderInterest; grossProfit; directCosts; netProfit; netPerMonth;
               customerMonthly; funderMonthly; annualReturnOnDrawn: number | null }
  drawn = max(0, costPrice − deposit); funderInterest = round(drawn×rate×tenure/12)
  grossProfit = systemPrice − costPrice − funderInterest
  directCosts = kycPerLoan + feePerInstalment×tenure + round(lossProvisionShare×(systemPrice−deposit))
  netProfit = grossProfit − directCosts; netPerMonth = round(netProfit/tenure)
  customerMonthly = round((systemPrice−deposit)/tenure); funderMonthly = round((drawn+funderInterest)/tenure)
  annualReturnOnDrawn = drawn > 0 ? netProfit/drawn×12/tenure : null
Tests (unit costs kyc 10000, fee 300, loss 0.02):
  20%/12m/16%: drawn 1304950, funderInterest 208792, grossProfit 466456, netProfit 413252,
               netPerMonth 34438, customerMonthly 165017, funderMonthly 126145, annualReturn ≈0.3167
  same at 26%: funderInterest 339287, grossProfit 335961
  own fund 0%: grossProfit 675248
  95% deposit (systemPrice 2024291, deposit 1923076): drawn 0, funderInterest 0, annualReturnOnDrawn null
Also export compareTenures(baseInput, tenures) returning rows for the PRD's tenure table
(3 months: systemPrice 2100840, monthly 560224).
Run red → implement → green. Checks, diff, commit "feat: pricing and profit engines".
```

**You should see:** all pricing and profit tests pass. The numbers match the PRD tables (to within ₦1 from rounding).

---

### Prompt 5 — Landing page

**Paste into Claude Code:**

```
Read CLAUDE.md sections 9–10 and docs/PRD.md "Features 1–2" including "Landing page message".
Task: Prompt 5 — landing page at src/app/(public)/page.tsx, keeping the existing redesign's look where it fits.

Sections in order: Hero, How it works (4 steps), Savings comparison, Proof, For installers and vendors, FAQ, Footer.
- Hero copy exactly: H1 "Solar on monthly payments." + "Zero interest." on a second line in brand gold;
  sub-line "We import directly from the manufacturers, so you pay less upfront and never pay interest.
  Start with 20%, spread the rest over up to 12 months."; orange button "Calculate my load" → /calculate;
  three badges "0% interest · One fixed price, shown in full before you sign", "Direct importers · Factory
  prices, no middlemen, genuine warranty", "From 20% deposit · The rest in up to 12 monthly payments";
  trust line "20+ homes and businesses financed · ~1 MW installed".
- Savings comparison: a static illustrative card (generator fuel per month vs a payment plan monthly),
  clearly labelled "Example".
- Partners section buttons → /partners/installer and /partners/vendor.
- FAQ (shadcn Accordion): deposit, tenure, what happens if I miss a payment (late fee 0.75% per day, system
  can be locked after 14 days), warranty, who installs, is it really 0% interest (yes: one fixed price,
  total shown upfront).
- Footer: logo, address, email, three phones, WhatsApp button (NEXT_PUBLIC_WHATSAPP_NUMBER), Privacy, Terms.
- Components in src/components/landing/*. Use next/image for the logo with priority. No video.
- In prelaunch mode a slim top banner: "Prelaunch: join the waiting list — we'll notify you within 7 days".
Playwright: hero text visible, button goes to /calculate, page has no console errors, Lighthouse-style
check: total JS on / under 200 KB gzipped (use next build output; report the number).
Checks, diff, commit "feat: landing page with zero-interest message".
```

**You should see:** the new landing page at http://localhost:3000. It looks good on your phone too (open the preview link on your phone).

---

### Prompt 6 — Load calculator and AI watts lookup

**Paste into Claude Code:**

```
Read CLAUDE.md, docs/PRD.md "Feature 3: Load calculator" (categories table, how a user adds an item,
hours per day, AI lookup, results screen).
Task: Prompt 6 — calculator UI at /calculate plus appliance library and AI lookup.

1. Migration 0002_appliances.sql: appliance_library (id, category CategoryId, name, default_watts,
   surge_factor, duty_cycle, default_hours, sort, active). Seed every item and default watts from the PRD
   categories table; surge_factor 3 for fridges, freezers, pumps, ACs, washing machines, air cooler;
   duty_cycle 0.4 fridges/freezers, 0.5 ACs, 1 otherwise; default hours per the PRD (lights 6, fridge 24,
   TV 6, AC 8, pressing iron 0.5) and sensible values for the rest. RLS: read all, write super_admin.
2. UI (src/components/calculator/*): category tiles → item list → tap adds item card (watts, qty, hours
   editable, remove). "Add your own" dialog (name, watts, category). Sticky totals bar: running W, surge W,
   kWh/day via computeLoadTotals. Heavy-load warning card when heavyItems is not empty (PRD wording).
   Results section with breakdown by category (Recharts bar) and button "See my solar plans".
   State persists in localStorage key 'g4s.calculator.v1' (wrap in try/catch).
3. AI lookup: a "?" icon beside every watts input opens a dialog to take or upload a photo
   (accept="image/*" capture="environment"). POST /api/vision/watts (multipart, max 5 MB, jpeg/png/webp).
   Provider interface src/lib/providers/vision/index.ts:
     estimateWatts(image: Blob): Promise<{ watts: number | null; method: 'label'|'estimate'|'unreadable';
       low?: number; high?: number; appliance?: string }>
   Anthropic adapter (model from ANTHROPIC_VISION_MODEL) asks for JSON only: read the rating label
   (watts, or volts×amps); else identify appliance and give a range. Validate the JSON with zod.
   Mock adapter returns {watts: 150, method:'label', appliance:'Refrigerator'} after 1.2 s.
   Do not store the image. Rate-limit 10 lookups per IP per hour (simple table or in-memory with a TODO
   noting Upstash later). Show result with "Use this value"; never auto-fill.
4. Button "See my solar plans": prelaunch mode → /waitlist (carry the items); live mode → /plans.
Tests: zod schema for the vision response; calculator store adds/edits/removes items and totals match
the Prompt 3 fixture; Playwright: add LED bulb ×10 and fridge, see totals update.
Checks, diff, commit "feat: load calculator and AI watts lookup".
```

**You should see:** at `/calculate` you can tap categories, add appliances, change watts, and watch the totals update. The "?" button gives a sample answer (mock mode) or a real one once you add your Anthropic key.

---

### Prompt 7 — Prelaunch waiting list, admin view, exports, and go live

**Paste into Claude Code:**

```
Read CLAUDE.md and docs/PRD.md "Prelaunch waiting list" (consumer flow in its 9-step order, design rules,
installer flow, admin view, consultant note) and "Assisted entry".
Task: Prompt 7 — the waiting list end to end, then deploy.

1. Migration 0003_waitlist.sql:
   waitlist_consumers (id, status 'incomplete'|'complete', phone_e164, whatsapp_e164, email, first_name,
   surname, state, lga, consent bool, load_items jsonb, load_totals jsonb, chosen_plan, deposit_share,
   ready_when 'now'|'30_days'|'later', estimate jsonb (snapshot of the three plans and the chosen one),
   duplicate_of uuid null, entered_by uuid null, entry_channel text null, created_at, updated_at)
   waitlist_installers (id, name, business_name, phone_e164, whatsapp_e164, email, states text[], lgas text,
   years_in_business int, installations_completed int, cac_registered bool, consent bool, entered_by, created_at)
   RLS: anonymous insert/update only through server actions using a per-visitor token cookie; staff read;
   delete only super_admin.
2. Seed a sample price list (components with unit costs per inverter kVA / battery kWh / panel) and one
   pricing setting row (pricingRateAnnual 0.24, margins 0.125) so estimates work; mark them "SAMPLE".
   src/lib/quotes/buildEstimate.ts: from LoadTotals + state + depositShare → three plans
   (essential, comfort, independence) using sizeSystem + priceQuote at 12 months. Unit-test with the fixture.
3. Consumer flow at /waitlist as one-question-per-screen with swipe/slide transitions (framer-motion),
   exactly in this order: (1) calculator (reuse) → (2) total load + "Get quotes" → (3) "Preparing your
   quotes…" (≤1.5 s) → (4) phone + WhatsApp ("same as phone" tick) → short pause → (5) email → short pause →
   (6) first name, surname, state (Abuja/FCT, Kaduna, Lagos, Other) + LGA + consent tick →
   (7) "Here are your plans, {firstName}": three plan cards marked "Estimate" at 20% →
   (8) contribution slider 20–95% for the chosen plan; total, upfront and monthly update live with
   "You save ₦X by paying N%"; question "When can you pay this?" → (9) thank-you screen
   "Thank you, {firstName}. You are on the Go4Solar waiting list. We will notify you within the next 7 days."
   Save after every screen (incomplete lead after phone). Duplicate phone → link duplicate_of, don't block.
   Send confirmation via messaging provider (mock writes to outbox).
4. Installer form at /partners/installer (prelaunch version) with the PRD fields and its thank-you message.
5. Admin /admin/waitlist (staff): headline cards (total sign-ups, by state, total system value, total deposits
   pledged, total financing needed, average deposit %, count "Yes now"), tabs Complete | Incomplete leads |
   Installers, filters (state, deposit band, plan, readiness, date), row drawer with full load list,
   "Entered by" column.
   - Download PDF (@react-pdf/renderer, route /api/admin/waitlist/report.pdf): page 1 summary + chart of
     sign-ups by state, then the list. Brand colours, logo, "Confidential".
   - Download CSV.
   - "Clear waiting list" (super_admin only): disabled until an export was downloaded in the last 24 h,
     then type CLEAR to confirm; writes audit_log.
   - "Add on behalf of customer" (assisted_entry permission): same steps in a staff form, sets entered_by
     and entry_channel.
6. Playwright: complete the consumer flow; leave after phone and see an incomplete lead in admin;
   download CSV has the row.
7. Deploy: tell me step by step how to (a) add all env vars in Vercel (Production + Preview) with
   NEXT_PUBLIC_LAUNCH_MODE=prelaunch and every provider on mock except what I have keys for,
   (b) run migrations on the Supabase project, (c) merge phase-1 into main to deploy, (d) connect the
   domain www.go4solar.app in Vercel (DNS records to add). STOP before merging and wait for my "yes".
Checks, diff, commit "feat: prelaunch waiting list", push. Update CLAUDE.md. How to see it.
```

**You should see (MILESTONE A 🎉):** www.go4solar.app is live. Anyone can calculate their load, see three estimate plans and join the waiting list. You can watch sign-ups arrive in `/admin/waitlist` and download the funder PDF.

---

# Milestone B — Consumer core

### Prompt 8 — Admin shell, pricing settings with live preview, funders

**Paste into Claude Code:**

```
Read CLAUDE.md and docs/PRD.md "Admin back office", "Pricing, markup and funders" (what super admin sets,
how admin enters financing rates, live price preview, choosing the funder) .
Task: Prompt 8.

1. Migration 0004_pricing.sql: components (sku, name, category, unit_cost, stock_sizes, source 'oem'|'vendor',
   active), category_margins, pricing_rates (tenure_months, expected_funder_rate, spread, default_buffer,
   pricing_rate generated = sum), installation_costs (state, size_band, amount), funders (name, kind
   'external'|'own_fund', annual_rate, method 'flat'|'reducing', upfront_fee_share, min_amount, max_amount,
   max_tenure, balance_available, status 'active'|'paused'), unit_costs (kyc_per_loan, fee_per_instalment,
   loss_provision_share, min_net_margin_share), overheads (month, fixed_amount, per_system_amount).
   Seed SAMPLE funders: "SPEWA programme funds" 16% flat, "Trade Lenda" 20% flat, "Go4Solar own fund" 0%.
   RLS: staff read; super_admin write; every write via a server action that writes audit_log (before/after).
2. Admin layout: sidebar (Dashboard, Waiting list, Applications, Jobs, Pricing, Funders, Appliances,
   Staff, Outbox, Audit log), top bar with user + role. Menu items hidden by role (PRD staff roles table).
3. Pricing pages (super_admin): Components, Margins, Financing rates (one row per tenure; pricing rate
   auto = funder + spread + buffer), Installation, Unit costs, Late fee (0.75%/day + cap).
   Each page shows a "Price preview" panel beside the form using the DRAFT (unsaved) values:
   sample package picker, tenure picker, deposit slider 20–95%, per-line cost/markup %/price,
   installation, total, upfront, monthly, and Go4Solar's side via loanProfit for each active funder
   (negative in red), plus a small Recharts line of system price vs deposit. Save applies to new quotes only;
   Discard resets.
4. Funders page: add/edit/pause; shows each funder's (empty for now) loan book totals.
5. Appliances page: edit appliance_library (names, default watts, surge, duty, hours).
6. Staff page: invite staff by email, set role and permissions (assisted_entry), disable staff.
7. Outbox page: list mock messages.
Tests: server action rejects non-super_admin; audit_log row written on margin change; preview uses
priceQuote/loanProfit (unit test the preview's mapping function).
Checks, diff, commit "feat: admin shell, pricing with live preview, funders".
```

**You should see:** in `/admin/pricing`, moving the deposit slider changes every line price and the profit per funder instantly, before you press Save.

---

### Prompt 9 — Quotes, plan choice and account creation

**Paste into Claude Code:**

```
Read CLAUDE.md and docs/PRD.md "Feature 4: Quotes" (Route A, notice text, consultant addition, choose or
get advice, pay in full), "Feature 5 → Consumer steps 1".
Task: Prompt 9 (live-mode path; prelaunch keeps /waitlist).

1. Migration 0005_quotes.sql: quotes (id, owner_id null until account, anon_token, state, load_items,
   load_totals, plan, system_size jsonb, tenure, deposit_share, result jsonb (QuoteResult incl. snapshot),
   valid_until, status 'draft'|'chosen'|'expired'), cash_referrals (quote_id, vendor_id null, created_at).
2. /plans: three plan cards from load + state (Essential ~3 h, Comfort ~8 h, 24-Hour Independence) showing
   inverter kVA, battery kWh, panel count/kW, deposit slider (20%+) with savings line, tenure chips
   3/6/9/12, monthly, total amount payable, "Valid until {date}" (7 days), the exact backup-hours notice
   from the PRD, and "Your realistic backup: about N hours" (realisticBackupHours).
3. Actions: "Choose this plan" → account step; "Chat with our solar advisor on WhatsApp" → wa.me link with
   pre-filled text including the quote reference; "Save and decide later" → email/WhatsApp the quotes
   (outbox) + reminder after 2 days (store a scheduled row; a Vercel Cron job at /api/cron/reminders sends due ones);
   "I'll pay in full" → creates cash_referral and shows "We'll connect you to a verified vendor near you".
4. Account creation: email + password (Supabase), then phone verification with a 6-digit code sent via the
   messaging provider (mock shows the code in outbox), stored hashed with 10-minute expiry, 5 attempts.
   On success the quote is attached to the user and status 'chosen'.
Tests: quote snapshot does not change when settings change (unit test with two settings versions);
OTP: expired code rejected, 6th attempt locked; Playwright: calculator → plans → choose → account → verified.
Checks, diff, commit "feat: quotes and plan choice".
```

**You should see:** with `NEXT_PUBLIC_LAUNCH_MODE=live` on a preview link, the full path from the calculator to three priced plans to creating an account works.

---

### Prompt 10 — Application wizard and KYC

**Paste into Claude Code:**

```
Read CLAUDE.md section 7–8 and docs/PRD.md "Feature 5" (consumer steps 2–7, KYC providers).
Task: Prompt 10.

1. Migration 0006_applications.sql: applications (id, consumer_id, quote_id, status 'draft'|'submitted'|
   'under_review'|'approved'|'declined'|'more_info', personal jsonb, employment jsonb, next_of_kin jsonb,
   install_address jsonb, map_pin point, income_range, credit_flags jsonb, assigned_funder_id null,
   entered_by null, submitted_at), kyc_checks (id, subject_type 'consumer'|'guarantor'|'installer'|'vendor',
   subject_id, kind 'nin'|'bvn'|'liveness'|'face_match'|'address', provider, provider_ref, status
   'pending'|'passed'|'failed'|'manual_review', attempt, result_summary jsonb (no raw NIN/BVN), created_at),
   documents (id, owner_id, kind, storage_path, created_at). Private bucket 'kyc' with RLS on objects by owner.
2. KYC provider interface src/lib/providers/kyc/index.ts:
     verifyNin({nin, firstName, lastName, dob}) → {status, nameMatch, dobMatch, photoRef?}
     verifyBvn({bvn, firstName, lastName, dob}) → {status, nameMatch, dobMatch}
     createLivenessSession({subjectId, ninPhotoRef}) → {sessionUrl|sdkToken, sessionId}
     getLivenessResult(sessionId) → {status, livenessPassed, faceMatchScore}
   Adapters: mock (NIN 11111111111 passes, 00000000000 fails; liveness passes after 2 s) and qoreid
   (QoreID REST + Web SDK; read their docs; credentials from env). Max 3 attempts each, then 'manual_review'.
   Cheapest check first: liveness only after NIN passes.
3. Wizard at /app/apply with progress bar and resume: Personal details → NIN (and photo of slip/card,
   front/back) → BVN → Biometric consent tick (required) → Face verification (guided: look straight,
   turn left, turn right, blink — via provider SDK; mock shows the same guided screens) → Address and site
   (utility bill or tenancy upload + map pin; Google Maps optional, fall back to lat/lng input) →
   Income (upload 6 months statements PDF; monthly income range) → Guarantor details (name, phone,
   email, relationship) → Review.
   Affordability rule: monthly ≤ 35% of the income range midpoint else flag for credit officer (not block).
4. Mask NIN/BVN in UI and never log them; store only last 4 digits + provider reference.
Tests: adapter contract tests run against the mock; attempt limit → manual_review; affordability flag;
RLS test: user B cannot read user A's application or documents.
Checks, diff, commit "feat: application wizard and KYC".
```

**You should see:** you can go through the full application on your phone in mock mode, including the head-turn face-check screens. Staff will see these checks in the next prompts.

---

### Prompt 11 — Guarantor flow, signature canvas and signed agreements

**Paste into Claude Code:**

```
Read CLAUDE.md and docs/PRD.md "Guarantor flow", "Terms and signature canvas", "Late fees, lock and extensions".
Task: Prompt 11.

1. Migration 0007_agreements.sql: guarantees (id, application_id, name, phone, email, relationship,
   token_hash, expires_at, status 'invited'|'in_progress'|'signed'|'declined'|'expired', guarantor_profile_id),
   agreements (id, type 'consumer'|'guarantor'|'installer'|'vendor', version, subject_id, application_id,
   signature_path, typed_name, otp_verified_at, ip, user_agent, signed_at, pdf_path),
   agreement_templates (type, version, body_md, effective_from).
   Seed template v1 placeholders for all four types; consumer template must contain: total amount payable,
   deposit, instalments, tenure, collateral clause, remote lock clause, late fee 0.75% per day with cap,
   credit-bureau reporting, biometric data processing, governing law. Mark "DRAFT — lawyer review required".
2. Guarantor invite: signed random token (GUARANTOR_TOKEN_SECRET), link /guarantee/[token] emailed + SMS,
   72 h expiry, resend allowed (new token invalidates old). Page shows who/amount/monthly/tenure first, then
   NIN, liveness, address, employment, income range, then the guarantee agreement + signature.
   Rules: 18+, not the applicant (different NIN), max active guarantees per person (setting, default 2).
3. SignatureCanvas component (src/components/signature/SignatureCanvas.tsx): finger/mouse drawing,
   clear, typed full name, exports PNG; then OTP to phone; then save.
4. Consumer terms step: plain-language summary card first; full agreement; Sign button enabled only after
   scrolling to the end; separate tick boxes (agreement, collateral, remote lock, credit bureau, biometrics).
5. Signed PDF (@react-pdf/renderer): agreement text + signature image + audit page (time, IP, device,
   OTP time); stored in 'kyc' bucket; emailed to signer.
Tests: tokens — valid, expired (>72 h), already signed, replaced by resend (old fails); guarantor NIN equal
to applicant rejected; signature step blocked without scroll-to-end (component test).
Checks, diff, commit "feat: guarantor, signatures and agreements".
```

**You should see:** the guarantor gets a link (in `/admin/outbox` in mock mode), completes the steps and signs. The consumer signs too, and both receive a signed PDF.

---

### Prompt 12 — Deposit, direct debit and the consumer dashboard

**Paste into Claude Code:**

```
Read CLAUDE.md and docs/PRD.md "Deposit", "Direct debit without being a bank", "In-app payment".
Task: Prompt 12.

1. Migration 0008_payments.sql: loans (id, application_id, consumer_id, funder_id null, system_price,
   cost_price, deposit, balance, tenure, start_date, status 'pending_approval'|'active'|'completed'|
   'defaulted'|'cancelled', profit_snapshot jsonb), repayment_schedule (loan_id, n, due_date, amount,
   paid_amount, status 'due'|'paid'|'late'), mandates (consumer_id, provider, provider_ref, bank_name,
   account_last4, status 'pending'|'active'|'failed'|'cancelled'), payments (id, provider_event_id unique,
   kind 'deposit'|'instalment'|'refund', loan_id, amount, status, raw jsonb, created_at).
2. Payments provider interface: initDeposit({email, amount, reference}) → {authorizationUrl};
   verify(reference); createMandate({email, bankCode?, account?}) → {authorizationUrl|status};
   chargeMandate({mandateRef, amount, reference}); refund({reference, amount}).
   Paystack adapter (Paystack direct debit: Initialize Authorization + charge_authorization) and mock.
3. /app/apply final step: show deposit (≥20%), pay via Paystack checkout, then set up direct debit
   ("Auto-pay"); a user who cannot set up a mandate can still submit (flag for admin).
   On submit: application 'submitted', loan 'pending_approval', schedule generated from QuoteResult.instalments.
4. Webhook /api/webhooks/paystack: verify x-paystack-signature (HMAC SHA512), idempotent on
   provider_event_id, updates payments/schedule; never trusts client redirects alone.
5. Consumer dashboard /app: status timeline (Submitted → Under review → Approved → Installed), plan summary,
   schedule with paid/due, "Pay now" for the next instalment, auto-pay status, documents (signed PDFs).
Tests: webhook posted twice → one payments row (Review Focus 4); bad signature → 401; schedule sums to
balance; Playwright (mock): pay deposit → dashboard shows "Under review".
Checks, diff, commit "feat: deposit, direct debit, consumer dashboard".
```

**You should see:** a test customer pays the deposit (mock, or Paystack test cards), sets up auto-pay, and lands on a dashboard that says "Under review".

---

### Prompt 13 — Applications queue, approval with profit check, jobs, assisted entry

**Paste into Claude Code:**

```
Read CLAUDE.md and docs/PRD.md "Admin back office", "Choosing the funder at approval",
"Approval screen (the check)", "Job flow after approval" (Phase 1 = manual), "Assisted entry".
Task: Prompt 13.

1. /admin/applications: queue with filters (status, state, flags), SLA timer (48 h target), detail page
   with tabs: Summary, KYC (results + signed URLs to images, 10-min expiry), Guarantor, Affordability,
   Documents, Quote, Audit trail.
2. Approval panel: list eligible funders (amount within min/max, tenure ≤ max_tenure, balance_available ≥
   drawn, active). For each: interest, gross profit, net profit, per month, annual return (loanProfit);
   below unit_costs.min_net_margin_share → red, needs super_admin. Approve stores funder_id +
   profit_snapshot (Approved stage), decrements funder balance, activates loan, notifies customer.
   Decline requires a reason, triggers deposit refund via provider, notifies customer.
   "Request more info" sends a message and sets status 'more_info'.
   Separation of duties: the approver cannot also confirm the vendor payout (enforce in server action).
3. Migration 0009_jobs.sql: jobs (id, loan_id, installer_name, installer_phone, vendor_or_store,
   pickup_code, status 'assigned'|'picked_up'|'installed'|'commissioned', serials jsonb, photos text[],
   notes, assigned_by). /admin/jobs: manual assignment, pickup code generation, record serials and
   commissioning photos, mark installed (customer gets "Installed" on dashboard).
4. Assisted entry (permission): "New application on behalf of customer" — same wizard in staff mode,
   sets entered_by + channel; identity steps (liveness, signature+OTP, mandate) send the customer a link to
   finish on their phone; record shows "Awaiting customer confirmation" until done.
Tests: funder eligibility filter; approval writes profit_snapshot and audit_log; approver blocked from payout
confirmation; assisted record cannot pass liveness without the customer's session.
Checks, diff, commit "feat: approvals with profit check, jobs, assisted entry".
```

**You should see:** you can approve the test application, pick a funder and see the profit for each option, then assign and complete the installation job.

---

# Milestone C — Money view and launch

### Prompt 14 — Forecast engine and the profit dashboard

**Paste into Claude Code:**

```
Read CLAUDE.md and docs/PRD.md "Profitability, analytics and forecasting" (all subsections).
Task: Prompt 14. Engine test-first, then UI.

runForecast(s: ForecastScenario): ForecastResult  (src/lib/forecast/run.ts), monthly cohort model.
  ForecastScenario { years: 1..10; newPerMonthYear1: number; growthPerYear: number; inflationPerYear: number;
    netProfitPerSystemYear1: number; drawnPerSystemYear1: number; tenureMonths: number;
    overheadFixedPerMonthYear1: number; overheadGrowthPerYear: number; overheadPerSystemYear1: number;
    defaultRateExtra?: number; mode: 'booked'|'cash' }
  Month m in year y (y = floor(m/12)+1): newSystems = newPerMonthYear1×(1+growth)^(y−1);
    infl = (1+inflation)^(y−1); booked profit = newSystems×netProfit×infl (counted in the month installed);
    cash mode spreads each cohort's profit evenly over tenureMonths; overhead = fixed×(1+ohGrowth)^(y−1)
    + newSystems×perSystem×infl; capital needed = newSystems×drawn×infl.
  ForecastResult { years: {year, systems, contribution, overheads, netProfit, cumulativeNet, capitalNeeded}[];
    months: {...same per month}[]; breakEvenMonth: number|null; peakCapitalYear: number }
Tests (base: 20/month, growth 0.4, inflation 0.12, net 413252, drawn 1304950, tenure 12, fixed 4000000/month,
  ohGrowth 0.15, perSystem 40000, booked, 10 years):
  year 1: systems 240, contribution 99180480, overheads 57600000, net 41580480
  year 5: net ≈ 457546650 (±0.1%), capitalNeeded ≈ 1893168836 (±0.1%)
  year 10: net ≈ 4963629556 (±0.1%), capitalNeeded ≈ 17944015618 (±0.1%)
  cash mode: year-1 net < booked year-1 net; 10-year cash total < booked total.
  breakEvenSystemsPerYear(fixedYear 48000000, net 413252, perSystem 40000) ≈ 128.6

Dashboard /admin/profit (super_admin, finance):
  - Cards: profit this month / this year / all time; GRAND TOTAL profit or loss; booked vs collected vs at risk.
  - Per customer table: monthly profit, to date, still to come, status, actual vs plan (Quoted/Approved/Actual
    snapshots — add table loan_profit_snapshots and a monthly job /api/cron/profit-actuals).
  - Filters: funder, state, tenure, deposit band, installer.
  - Charts (Recharts): monthly actual vs projected with a marker where forecast begins; cumulative profit;
    profit by tenure and deposit band (per customer AND annual return on funder money); cash in vs funder
    repayments out; capital needed vs funder balances; PAR30 vs provision.
  - Funders panel: drawn, repaid, outstanding, interest paid, due next 90 days, cash-gap alert.
Forecasts /admin/forecasts: named scenarios (table forecast_scenarios), horizon 1–10 years, Low/Base/High side
  by side, sensitivity sliders (default rate, funder rate, naira movement), break-even month, and the
  "What if" calculator (customers per year → net profit, capital needed, staff needed at an admin-set
  customers-per-staff ratio). Export each scenario to PDF (brand style) and Excel (exceljs).
Checks, diff, commit "feat: forecast engine and profit dashboard".
```

**You should see:** `/admin/forecasts` reproduces the PRD's 10-year chart for the base case. When you change "customers per year" in the "What if" box, profit and the funder money needed update instantly.

---

### Prompt 15 — Hardening: security, privacy and quality

**Paste into Claude Code:**

```
Read CLAUDE.md section 7 and docs/PRD.md "Compliance, legal and risk".
Task: Prompt 15 — no new features; make Phase 1 safe.
1. RLS test suite (vitest + two real test users against a Supabase branch or local stack): for every table,
   user B cannot select/update user A's rows; anon cannot read anything private; signed URLs for 'kyc'
   objects are only issued to the owner and staff (Review Focus 3).
2. Rate limits on: OTP send/verify, vision lookup, waitlist submit, login (per IP + per phone).
3. Pages: /privacy (NDPA-aligned: what we collect incl. biometrics, why, retention, rights, DPO contact),
   /terms, cookie notice (only essential cookies unless analytics added), consent ticks wired and stored
   with timestamp.
4. Data retention job: delete waitlist rows marked cleared, purge failed KYC images after 30 days.
5. Error and empty states for every page; 404 and 500 pages in brand style; loading skeletons.
6. Security headers (CSP allowing Paystack, QoreID, Supabase, Anthropic only), no source maps in prod.
7. Accessibility pass: labels, focus order, contrast on brand green/orange buttons (fix if < 4.5:1).
8. Performance: landing page JS budget, images optimised, fonts subset.
Report a short table: area · issue found · fixed?
Checks, diff, commit "chore: phase 1 hardening".
```

**You should see:** a short report table of what was checked and fixed. All the tests pass.

---

### Prompt 16 — End-to-end test, switch to live, and launch

**Paste into Claude Code:**

```
Read CLAUDE.md and this plan's Global Constraints and Review Focus.
Task: Prompt 16 — final verification and go-live.
1. Playwright full journey (mock providers): landing → calculator → plans → account + OTP → application with
   KYC → guarantor link signed → deposit paid → mandate active → admin approves with a funder → job installed →
   customer dashboard shows "Installed" and schedule. Plus admin forecast page renders.
2. Run the full suite: npm run check && npm run e2e. Fix anything red.
3. Produce docs/GO-LIVE.md checklist for me: env vars per provider (test vs live keys), switching each
   *_PROVIDER from mock to live one at a time with a smoke test after each, Paystack webhook URL to register,
   QoreID callback URL, Supabase backups on, Vercel production domain, super admin + staff 2FA enrolled,
   real prices/margins/funders entered (replace SAMPLE rows), agreements reviewed by lawyer (remove DRAFT),
   NEXT_PUBLIC_LAUNCH_MODE stays 'prelaunch' until I say launch.
4. Merge phase-1 → main after my "yes". Confirm the production URL and run e2e/smoke.spec.ts against it.
Update CLAUDE.md (Phase 1 complete, link GO-LIVE.md). Tell me how to see it.
```

**You should see (END OF PHASE 1 🎉):** the full Go4Solar site running at www.go4solar.app. It's still in prelaunch mode, and the complete consumer, guarantor and admin flow works behind it. Following `docs/GO-LIVE.md`, you switch each service from mock to live, then set `NEXT_PUBLIC_LAUNCH_MODE=live` to open applications.

---

## Self-review notes

- **Spec coverage (Phase 1 column of the roadmap):**
  - Waiting list → Prompt 7
  - Landing and calculator → Prompts 5 and 6
  - AI watts lookup → Prompt 6
  - Three quotes and WhatsApp link → Prompt 9
  - NIN, BVN and liveness → Prompt 10
  - Guarantor and e-signature → Prompt 11
  - Deposit and direct debit → Prompt 12
  - Funders, pricing and profit → Prompts 4, 8, 13 and 14
  - Admin prices and approvals → Prompts 8 and 13
  - Assisted entry → Prompts 7 and 13
  - Jobs assigned by staff → Prompt 13
  - Phase 2 items stay out: the late-payment ladder, remote lock, energy dashboard, installer/vendor portals, collateral registration and uploaded installer quotes.
- **Rounding:** the test values use whole-naira `Math.round`, so they differ from the PRD's illustration by at most ₦1. For example, net profit is ₦413,252 here and ₦413,251 in the PRD.
