# CLAUDE.md — Go4Solar App

> **Read this whole file before writing, changing or running any code in this repo.**
> Then read the section of `docs/PRD.md` that your task touches, and the prompt you were given from
> `docs/superpowers/plans/2026-10-09-go4solar-phase-1.md`. If the three disagree, stop and ask.

---

## 1. What we are building

Go4Solar is a web app that lets Nigerian homes and small businesses buy solar on monthly payments with
**0% interest**. Go4Solar imports directly from manufacturers and earns a markup (spread across the
equipment lines), not interest. One codebase serves five users: **consumers, guarantors, installers,
vendors and Go4Solar staff (admin back office)**.

- Company: **Go4Solar Energy Limited** · Suite 40, Jayjay Shopping Complex · Contact@go4solar.app ·
  08182112423 · 08037142948 · 08083143614 · www.go4solar.app
- Launch states: **Abuja (FCT), Kaduna, Lagos**
- Source of truth for every requirement: `docs/PRD.md` (designed version: `docs/Go4Solar_App_PRD.pdf`)
- Current phase: **Phase 1** (prelaunch waiting list first, then the consumer core). Phase 2/3 items in the
  PRD roadmap are **out of scope** unless a prompt says otherwise.

## 2. How we work (Brain + Hands)

Semako plans in Claude web chat ("the brain"). You, Claude Code, execute ("the hands").

1. **Do exactly the prompt you were given.** No extra features, no refactors outside the prompt's files.
2. **Before coding:** list the files you will create or change (exact paths) and wait only if the prompt
   says "stop for approval"; otherwise proceed.
3. **Engines are test-first (TDD):** for anything in `src/lib/**` write the failing Vitest test first, run it,
   then implement, then run it green.
4. **Show the full diff before every commit.** Commit with a clear message (`feat:`, `fix:`, `chore:`, `test:`).
5. **Never do these without asking first and getting a "yes":** deleting files or folders, `supabase db reset`,
   migrations that drop/rename columns or tables, `git push --force`, changing `.env*` files, rotating keys,
   installing a new major dependency not named in the prompt, anything touching production data.
   Never run `vercel link`, `vercel env pull` or any command that writes `.env*` files without asking
   first **and** making a backup copy first (`.env.local.bak`, git-ignored) — `vercel link` once replaced
   `.env.local` and wiped every key.
6. **When something fails:** read the error, find the cause, fix the cause. Do not silence errors, skip tests
   or add `// @ts-ignore`. If stuck after two attempts, stop and report what you tried.
7. **End of every prompt:** run `npm run check` (types + lint + tests), update section 12 of this file
   (Progress log), and finish with a short "How to see it" note: the URL/page to open and what Semako
   should see.
8. Keep replies short. Semako is learning: when you must explain, use plain words, no jargon.

## 3. Stack (do not change)

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15, App Router, React Server Components where natural |
| Language | TypeScript, `strict: true`, no `any` (use `unknown` + narrowing) |
| Database / auth / storage | Supabase (Postgres, Auth, Row Level Security, Storage) via `@supabase/ssr` |
| Styling | Tailwind CSS v4 (brand colours and font in `@theme` in `src/app/globals.css`, no `tailwind.config`) + shadcn/ui (preset nova, Radix) |
| Forms / validation | react-hook-form + zod (one zod schema per form, shared by client and server) |
| Tests | Vitest (unit, `src/**/*.test.ts`), Playwright (end-to-end, `e2e/`) |
| Charts | Recharts |
| PDF output | `@react-pdf/renderer` (server side) |
| Hosting | Vercel (push to `main` deploys; previews on every branch) |
| Payments | Paystack (deposits, card/transfer/USSD, direct-debit mandates) |
| KYC | QoreID (main), Dojah (backup) — behind our own interface |
| SMS / WhatsApp / email | Termii (SMS), WhatsApp Business link-outs in Phase 1, Resend (email) |
| AI watts lookup | Anthropic API (vision), model from env `ANTHROPIC_VISION_MODEL` |

Node 20 or newer. Package manager: **npm**.

## 4. Commands

```bash
npm run dev          # local site at http://localhost:3000
npm run check        # tsc --noEmit && next lint && vitest run   (must pass before every commit)
npm run test         # vitest watch
npm run e2e          # playwright test
npx supabase migration new <name>   # new SQL migration in supabase/migrations
npx supabase db push                # apply migrations to the linked Supabase project
npm run db:types     # regenerate src/lib/supabase/database.types.ts
```

## 5. Folder map

```
src/
  app/
    (public)/            landing page, /calculate, /plans, /waitlist, /partners/*
    (consumer)/app/      consumer dashboard and application wizard (login required)
    guarantee/[token]/   guarantor flow (secure link, no account)
    admin/               back office (staff only, 2FA)
    api/                 route handlers (webhooks, AI lookup, exports)
  components/
    ui/                  shadcn/ui primitives (do not edit by hand except via shadcn CLI)
    brand/               Logo, Naira, PageHeader, etc.
    <feature>/           components grouped by feature (calculator/, waitlist/, quotes/, admin/ …)
  lib/
    money.ts             formatNaira, rounding helpers
    load/                load calculator engine (pure)
    sizing/              system sizing engine (pure)
    pricing/             price + markup engine (pure)
    profit/              per-loan profit engine (pure)
    forecast/            1–10 year forecast engine (pure)
    providers/           kyc/, payments/, messaging/, vision/ — interface + real adapter + mock adapter
    supabase/            server.ts, client.ts, admin.ts (service role, server only), database.types.ts
    auth/                role checks, requireRole()
  config/
    site.ts              company details, launch states, LAUNCH_MODE
supabase/
  migrations/            SQL, one file per change, never edited after it is pushed
  seed.sql               appliance library, sample price list, sample funders, settings
e2e/                     Playwright tests
docs/                    PRD.md, PRD pdf, plans
```

Rule: **pure engines in `src/lib/{load,sizing,pricing,profit,forecast}` never import React, Next or Supabase.**
They take plain objects and return plain objects, so they are easy to test and reuse in admin previews.

## 6. Money, numbers, dates, phones

- **Currency is naira.** Store money in Postgres as `numeric(14,2)`. Never use floats in SQL.
- Engines may compute with JS numbers but must round results with helpers in `src/lib/money.ts`.
- Display money **only** through `formatNaira(n)` → `₦2,475,248` (no kobo on screen unless asked).
- The **₦ sign must render on Windows Chrome.** Load Inter through `next/font/google` with
  `subsets: ['latin', 'latin-ext']` (₦ U+20A6 lives in latin-ext). Never hard-code a font stack without Inter.
- Percentages stored as decimals (0.2 = 20%). Display with `formatPercent`.
- Dates in `Africa/Lagos`. Store `timestamptz`.
- Phones stored in E.164 (`+2348031234567`). Accept `0803…` input and normalise.

## 7. Security and privacy (non-negotiable)

- **Row Level Security ON for every table**, with a policy per role. A consumer reads only their own rows.
- The Supabase **service role key is server only** (`src/lib/supabase/admin.ts`, never imported in a client
  component). Anything secret lives in env vars, never in code or commits.
- KYC files (ID images, selfies, signatures, statements) go in the **private** storage bucket `kyc`;
  served only via short-lived signed URLs.
- **Never log NIN, BVN, full bank account numbers, selfies or OTP codes** (not in console, not in errors).
  Mask in UI: NIN `•••••••4521`.
- Biometric processing needs an explicit consent tick (NDPA 2023 / GAID 2025). No tick, no liveness check.
- Every staff action that changes money, approvals, locks, prices or users writes a row to `audit_log`.
- Webhooks (Paystack, KYC) verify signatures and are **idempotent** (same event twice = one effect).
- Staff accounts require 2FA (Supabase MFA, TOTP) before reaching `/admin`.

## 8. Providers: real or mock

Every outside service sits behind an interface in `src/lib/providers/<name>/index.ts` with a real adapter
and a **mock adapter**. Env picks the adapter (`KYC_PROVIDER=mock|qoreid`, `PAYMENTS_PROVIDER=mock|paystack`,
`MESSAGING_PROVIDER=mock|live`, `VISION_PROVIDER=mock|anthropic`). Mocks must behave realistically (delays,
success and failure cases) so the whole site runs end to end with no paid accounts. Mock messages are saved
to the `outbox` table and shown at `/admin/outbox`.

## 9. Product rules that code must respect

- Consumer-facing words: say **"payment plan"**, never "loan" or "interest". Admin screens may say "loan".
- "0% interest" may appear only where the **total amount payable** is also shown. Late fee is always disclosed.
- Minimum deposit **20%** (setting `min_deposit_share`, per credit band later). Slider range 20%–95%.
- Tenures: 3, 6, 9, 12 months.
- Late fee: **0.75% of the overdue amount per day**, capped (setting), written into the agreement.
- Markup is **spread across equipment lines only**, never on installation. It falls as deposit rises.
- Funder interest is charged on **money drawn = cost price − customer deposit** (never below 0).
- Every quote stores a **snapshot** of the prices and rates used; changing settings never changes old quotes.
- Never mention "Microvis" or "Liquid Power" anywhere. SPEWA is a *programme*, not a company.
- Appliance categories (exact names): Lighting · TV and Electronics · Kitchen Appliances ·
  Cooling and Comfort · Laundry and Home Care · Water and Outdoor · Business and Office (SME).

## 10. Brand

| Token | Hex | Use |
| --- | --- | --- |
| `brand-dark` | `#0E3B22` | header bands, headings, primary text on light |
| `brand-green` | `#2E8B3A` | primary buttons, table headers, positive numbers |
| `brand-blue` | `#1B4E9B` | links, secondary accents |
| `brand-orange` | `#F47B20` | accents, CTA highlights, "Calculate my load" |
| `brand-gold` | `#FFC94D` | taglines on dark green |
| `brand-mist` | `#F4F8F5` | soft backgrounds, alternating rows |

These tokens live in `@theme` in `src/app/globals.css` (`--color-brand-*`) and are used as Tailwind
classes: `bg-brand-green`, `text-brand-dark`, `border-brand-mist`, etc. shadcn's `--primary` is set to
brand green there too.

Logo: `public/brand/go4solar-logo.png` (transparent PNG). Font: Inter. Mobile-first; most visitors use phones
on slow networks — keep pages light (target < 3 s on 3G for the landing page).

## 11. Definition of done (every prompt)

- [ ] Only the prompt's scope was built; files match the plan's paths
- [ ] Tests written first for engines; `npm run check` passes
- [ ] Works on a 375 px wide screen and on desktop
- [ ] No secrets in code; RLS covers any new table
- [ ] Diff shown, committed, pushed to the working branch
- [ ] Section 12 below updated; "How to see it" note given

## 12. Progress log (update at the end of every prompt)

| Date | Prompt | What was done | Notes / follow-ups |
| --- | --- | --- | --- |
| 2026-10-09 | — | CLAUDE.md, PRD and Phase 1 plan added | Next: Prompt 1 |
| 2026-10-09 | 1 | Repo started from scratch (old app was deleted): git init, `main` pushed to github.com/cmovich/go4solar, branch `phase-1`. Next.js 15.5 App Router + TS strict (`noUncheckedIndexedAccess`), Tailwind v4, shadcn/ui (radix, neutral, CSS vars, `--primary` = brand green), brand colours as `brand-*` tokens, Inter latin+latin-ext via next/font, `src/config/site.ts`, TDD `src/lib/money.ts` (13 tests), Vitest + Playwright + Prettier, `e2e/smoke.spec.ts`, `.env.example`, placeholder home page | Tailwind v4 has no `tailwind.config.ts`: brand colours and fonts live in `@theme` in `src/app/globals.css`. shadcn CLI now uses presets (`nova`), so style "default" no longer exists. `next lint` prints a deprecation warning (removed in Next 16); switch `check` to `eslint .` when upgrading. Vercel not connected yet — Semako to import the GitHub repo. |

| 2026-10-10 | 2 | Supabase linked (project `go4solar`, eu-west-1). Migration `0001_core.sql` applied: `app_role` enum, `profiles` (+ sign-up trigger, role-change guard), `staff_permissions`, `settings` (seeded), `audit_log`, `outbox`, helpers `my_role()/is_staff()/has_role()/has_permission()`, RLS on every table. `src/lib/supabase/{env,server,client,admin,middleware}.ts` + `src/middleware.ts`, generated `database.types.ts`. `src/lib/auth/{session,roles}.ts` (`requireUser`, `requireRole`, `requireStaffWithMfa`, 10 tests). Pages `/login` (sign in / create account), `/admin/mfa` (TOTP enrol + verify), `/admin` placeholder. `scripts/make-super-admin.ts` (`npm run make-admin -- email`). | The first pushes failed because the dashboard password reset had not been confirmed; the migration was applied via the Management API (CLI login) and recorded in `supabase_migrations.schema_migrations`. Password now fixed: `supabase db push --password "$SUPABASE_DB_PASSWORD"` connects and reports up to date, so later migrations use the normal push. Direct DB host is IPv6-only (unreachable here) — always go through the pooler (the CLI default). |

| 2026-10-10 | fix | Vercel preview builds failed since 8ae5649: Next's build-time trial render hit `publicSupabaseEnv()` before `cookies()`. Auth pages `force-dynamic`, cookies read before env, lazy browser client in MfaSetup, middleware passes through when env is missing. | Vercel env vars were Production-only; Semako to tick **Preview** for the four `NEXT_PUBLIC_*`/`SUPABASE_SERVICE_ROLE_KEY` vars. `SUPABASE_PROJECT_REF`/`SUPABASE_DB_PASSWORD` are not needed on Vercel. Vercel CLI is logged in and linked (`.vercel/` ignored). |
| 2026-10-10 | 3 | Pure engines, test-first: `src/lib/load` (`types.ts`, `totals.ts` → `computeLoadTotals`, `LoadValidationError`, fixture `load.fixture.ts`) and `src/lib/sizing` (`types.ts`, `defaults.ts` = mirror of the seeded `sizing` setting, `size.ts` → `sizeSystem`, `LoadEmptyError`, `LoadTooLargeError`). 27 new tests; all PRD worked-example numbers match. No UI. | `realisticBackupHours` is `number \| null`: null when every item has 0 hours/day (dailyKwh 0) — the UI (Prompt 9) shows "—" for null. `DEFAULT_SIZING_SETTINGS` must be kept in step with the `sizing` row in `settings` if either changes. |

| 2026-10-10 | 4 | Pure engines, test-first: `src/lib/pricing` (`types.ts`, `price.ts` → `priceQuote`, `DepositOutOfRangeError`, fixture `pricing.fixture.ts`) and `src/lib/profit` (`types.ts`, `loanProfit.ts` → `loanProfit`, `compareTenures.ts` → `compareTenures`). 45 new tests; every PRD pricing/profit/tenure-table figure reproduced (within ₦1 rounding). | `priceQuote` takes optional `minDepositShare` (default 0.2) — pass `settings.min_deposit_share` from the caller. `QuoteResult.snapshot` holds every input + `roundingStep`; store it with each quote. `annualReturnOnDrawn` is `null` when nothing is drawn (95% deposit) — show "—". Only `funderMethod: 'flat'` exists; 'reducing' arrives with Prompt 8 funders if needed. |

| 2026-10-10 | 5 | Landing page at `src/app/(public)/page.tsx` (placeholder moved there). `src/components/landing/*`: `Band` (deep-green band, angled bottom edge, orange corner accent, `Container`, `SectionHeading`), `PrelaunchBanner`, `Hero`, `HowItWorks`, `Savings` (Example card, all amounts via `formatNaira`), `Proof` ("Customer stories coming soon" placeholders, no invented quotes), `Partners`, `Faq` (shadcn Accordion), `Footer` (WhatsApp from `NEXT_PUBLIC_WHATSAPP_NUMBER`, falls back to the first office line). `e2e/landing.spec.ts` (hero, sections, savings, FAQ, no console errors incl. any 4xx URL). JS for `/`: **100.5 KB gzipped** (Next "First Load JS" 134 kB raw). | Links to routes that do not exist yet (`/calculate`, `/waitlist`, `/partners/*`, `/privacy`, `/terms`) carry `prefetch={false}` so the page emits no 404 prefetches; **remove those props as each route is built** (Prompts 6, 7, 15). Playwright `reuseExistingServer` will happily reuse a stale `next start` on :3000 and skip the rebuild — run `lsof -ti:3000 \| xargs kill` if results look stale. |

| 2026-10-10 | 6 | Migration `0002_appliances.sql` (pushed with `db push`): `appliance_library` seeded from the PRD table (RLS read all / super_admin write) + `rate_limits` table and `hit_rate_limit(key, limit, window)` (service role only; fixed windows). Calculator at `/calculate` (`src/app/(public)/calculate`, static, revalidate 1 h; library via `src/lib/appliances/library.ts`): `src/components/calculator/*` (tiles with lucide icons, item picker, item cards with 44 px targets and numeric keyboards, add-your-own, sticky totals bar, heavy-load warning, results with lazy Recharts chart, "See my solar plans" → `/waitlist` in prelaunch / `/plans` live). Pure store `src/lib/calculator/store.ts` + localStorage `g4s.calculator.v1`. Vision: `src/lib/providers/vision/{index,schema,mock,anthropic}.ts` (Messages API via fetch, model `ANTHROPIC_VISION_MODEL`, default `claude-haiku-5-5`, JSON validated with zod, image never stored), route `POST /api/vision/watts` (≤5 MB jpeg/png/webp, 10/h per IP via `hit_rate_limit`). `src/lib/ratelimit/{clientIp,hitRateLimit}.ts`. Tests: schema, store (fixture totals), clientIp, DB rate-limit (skips without env). `e2e/calculator.spec.ts`. | **`vercel link` overwrote `.env.local`** (Vercel's CLI runs an env pull that replaces the file) — only `VERCEL_OIDC_TOKEN` survived; Semako re-creates it from `.env.example`. Never run `vercel link`/`vercel env pull` without backing up `.env.local`. The appliance library is fetched at build time: a Vercel Preview build without Supabase env vars ships an empty list (custom items still work) until the vars are added to Preview. `src/test/server-only.ts` is aliased for `server-only` in Vitest. `prefetch={false}` removed from `/calculate` links. |

| 2026-10-10 | 7 | Migration `0003_waitlist.sql` (pushed): `waitlist_consumers` (visitor token hash, consent_at, estimate snapshot, duplicate_of, entered_by/entry_channel), `waitlist_installers`, `waitlist_exports`, SAMPLE `settings.price_list` + `settings.pricing` rows (`sample: true`). Engine `src/lib/quotes/buildEstimate.ts` (`buildEstimate`, `repriceEstimate`, `linesFor`) + `src/lib/settings/{schemas,getQuoteSettings}.ts`. Messaging provider `src/lib/providers/messaging` (mock → outbox; live = placeholder). Consumer flow `/waitlist` (`src/components/waitlist/{WaitlistFlow,steps}.tsx`, framer-motion slides, swipe back, save after every screen via `src/app/(public)/waitlist/actions.ts`, per-visitor cookie `g4s_wl`, duplicate phones linked not blocked, `waitlist:` rate limit 20/h, confirmation to WhatsApp + email). Installer form `/partners/installer`. Admin `/admin/waitlist` (headline cards, by-state bars, tabs, URL filters, row drawer, Entered by), `/admin/waitlist/new` assisted entry (permission or super_admin, audit_log), CSV `/api/admin/waitlist/export.csv`, PDF `/api/admin/waitlist/report.pdf` (`src/lib/pdf/WaitlistReport.tsx`, brand bands, circle page numbers, logo, Inter from `public/fonts`), "Clear waiting list" (super_admin, export < 24 h, type CLEAR, audit_log). e2e: full consumer flow, incomplete lead → admin (staff user + TOTP created by `e2e/global-setup.ts`), CSV + PDF via the staff session, installer form. 130 unit tests · 27 e2e. | **Not merged to main yet** — waiting for Semako's "yes" (deploy steps in the Prompt 7 reply). Real price list still to be loaded (replace the SAMPLE settings rows). `Calculator` gained an optional `onContinue` prop (waiting-list mode). The staff e2e test runs on desktop only (a TOTP code cannot be reused inside one 30 s window). Global setup wipes `waitlist:`/`vision:` rate-limit rows and (re)creates `e2e-staff@go4solar.test` as super_admin with a fresh authenticator. |

**Next prompt to run:** Prompt 8 — Admin shell, pricing settings with live preview, funders (after the Milestone A deploy).
