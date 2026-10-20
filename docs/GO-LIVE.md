# Go-live: prelaunch on go4solar.app

The public site opens in **prelaunch** mode: the calculator, the "get your solar plan" sign-up
(waiting list), the installer sign-up, the privacy and terms pages, and the staff back office.
Everything else (plans, accounts, applications, guarantors, payments, KYC, test mode) is closed and
sends visitors to the home page. Testing of the full app continues on the `phase-1` previews.

Nothing in this checklist deletes data. Test records stay in the database, marked `is_test`, and
are left out of every report.

---

## 1. Before merging (Semako, in Vercel)

Vercel → Project **go4solar** → Settings → Environment Variables. For each row, tick
**Production** only, unless the row says otherwise.

| Name | Value | Where the value comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_LAUNCH_MODE` | `prelaunch` | Type it. A Production entry already exists: open it and check it says `prelaunch`. |
| `NEXT_PUBLIC_SITE_URL` | `https://go4solar.app` | Type it. Production only (previews use their own address). |
| `NEXT_PUBLIC_SUPABASE_URL` | already set | Already ticked for Production and Preview. No change. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | already set | Already ticked for Production and Preview. No change. |
| `SUPABASE_SERVICE_ROLE_KEY` | already set | Already ticked for Production and Preview. No change. |
| `ID_HASH_SECRET` | **same value** as Preview | Edit the existing Preview variable and also tick Production. Never a new value, or existing hashes stop matching. |
| `GUARANTOR_TOKEN_SECRET` | **same value** as Preview | Edit the existing Preview variable and also tick Production. |
| `CRON_SECRET` | a long random string | Make a new one (for example from a password manager, 40+ characters). The daily and weekly jobs need it. |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | the company WhatsApp number, e.g. `08182112423` | Optional. Without it, the footer uses the first office line. |

**Leave these out of Production for now:**

- `MESSAGING_PROVIDER`: without it, messages are kept in `/admin/outbox` as `not_sent` and nothing
  breaks.
- `VISION_PROVIDER` and `ANTHROPIC_API_KEY`: without them, the photo lookup button is hidden.
  Add both later to switch it on.
- `KYC_PROVIDER`, `PAYMENTS_PROVIDER` and their keys: these features are closed in prelaunch.
- `TEST_MODE_SECRET`: never on Production.
- `RETENTION_ENABLED`: without it, the weekly clean-up job only counts and deletes nothing.

The build stops on purpose if `ID_HASH_SECRET` or `GUARANTOR_TOKEN_SECRET` is missing on
Production.

## 2. Supabase → Authentication → URL Configuration

- **Site URL:** `https://go4solar.app`
- **Redirect URLs** (add each line):
  - `https://go4solar.app/**`
  - `https://www.go4solar.app/**`
  - `https://go4solar-git-phase-1-moses-semakos-projects.vercel.app/**`
  - `https://*-moses-semakos-projects.vercel.app/**` (every preview link)
  - `http://localhost:3000/**`
  - `http://localhost:3200/**` (the e2e tests' own port)
  - `http://localhost:3100/**`

The e2e suites run on fixed ports 3200 (prelaunch) and 3100 (live), never 3000.
These are used by staff invite and "Forgot password?" emails, which return to `/auth/callback` on
the site the link came from, then open "Set your password".

## 3. Domain (Vercel + Namecheap)

1. Vercel → Project → Settings → **Domains** → add `go4solar.app`, then add `www.go4solar.app`
   and choose "Redirect to go4solar.app".
2. Vercel shows the DNS records to create. Usually:

   | Type | Host | Value |
   | --- | --- | --- |
   | A | `@` | `76.76.21.21` (or the IP Vercel shows, e.g. `216.198.79.1`) |
   | CNAME | `www` | `cname.vercel-dns.com.` (or the value Vercel shows) |

   **Always copy the exact values from the Vercel screen.**
3. Namecheap → Domain List → go4solar.app → **Advanced DNS**:
   - Change or add only the `@` **A record** and the `www` **CNAME record**. If Namecheap has a
     default "URL Redirect Record" on `@`, or a `www` CNAME to `parkingpage.namecheap.com`,
     replace those two. They are the same hosts.
   - **Do not change the nameservers.** Leave every **MX** and **TXT** record exactly as it is:
     company email runs on go4solar.app.
4. Wait until Vercel shows both domains as **Valid Configuration**. The HTTPS certificate is
   issued automatically.

## 4. Merge

Merge the pull request `phase-1 → main` on GitHub. This happens only after Semako says yes.
Vercel deploys `main` to go4solar.app. The `phase-1` branch stays open for further work.

---

## 5. Smoke test on go4solar.app (after the deploy is Ready)

Use your phone on mobile data, plus a computer.

1. **Home:** open https://go4solar.app.
   - The page loads. There is no strip at the top, and no "7 days" promise before the sign-up.
   - With sample prices, no ₦ amounts show and the hero says "One fixed price."
   - With real prices, the hero says "Zero interest." and shows the example total.
2. **Closed pages:** open https://go4solar.app/plans and https://go4solar.app/app.
   - Both send you back to the home page.
   - https://go4solar.app/get-started opens the sign-up.
3. **Calculator:** tap **Calculate my load**, add a few appliances and check the totals update.
   The camera "snap the label" button is hidden while no vision key is set.
4. **Sign-up on your phone:**
   1. Tap **See my solar plans** and go through the sign-up with your own phone number and email.
   2. After your plans you should finish on "Thank you! Our team will get back to you within 7
      days with your confirmed price and next steps."
   3. You should see no error at any point. (No SMS or email is sent yet; that is expected.)
5. **Lead in admin:** on the computer, open https://go4solar.app/login.
   - Only "Sign in" shows (no "Create an account").
   - Sign in with your super admin account, then enter the 6-digit code from your authenticator
     app (2FA).
   - Open **/admin/waitlist**: your sign-up appears as a complete lead.
   - Open **/admin/outbox**: the confirmation messages are listed as `not_sent`.
6. **Privacy:** open https://go4solar.app/privacy. There is no "DRAFT – pending legal review" bar.
   https://go4solar.app/terms still shows the bar.
7. **Installer form:** open https://go4solar.app/partners/installer. The form loads; you don't
   need to submit it.

If any step fails, write down the page address and the time, and send them to Claude Code.
Vercel's runtime logs for that time show the cause.

## 6. After launch

- Semako rotates the Supabase database password.
- Before sharing the link widely, enter the real prices in /admin/pricing. The yellow "Sample
  prices" banner disappears and naira amounts appear on the site.

## 7. Before the live launch

FIXED in the October testing round:

1. Calculator shown twice (/calculate → plans) [fixed, both modes]
2. Error 500 after customer signs — PDF fonts not packaged on Vercel [fixed]
3. Error 500 after guarantor signs — same cause [fixed]

4/5. Outbox message links not clickable [fixed]

6. Guarantor relationship → dropdown [fixed]
7. Lock after 7 days overdue: setting, agreement v2 wording, "Lock due" badge
   [done; the actual remote lock is Phase 2]
8. /partners showed a 404 → partner programme page [fixed]

STILL TO DO before switching Production to live mode:

9. Vendor button "Become a verified vendor" → /partners/vendor (404). Hide it or
   build the vendor sign-up page.
10. Finish Semako's manual test on the preview: Parts 1–7 (stopped at Part 3:
    installer sign-up and job assignment).
11. Mock KYC accepts only BVN 22222222222 — accept any test BVN starting with 2
    (mock only) so each test customer can have their own.
12. Speed: run independent database queries in parallel on the guarantor and
    signing pages.
13. Flaky e2e test: admin "Show test data" toggle — find the cause.
14. Real provider accounts and keys: QoreID (KYC), Paystack live + Direct Debit,
    Termii (SMS), Resend (email — its DNS records must not touch the existing
    mail settings), Anthropic vision (optional).
15. Lawyer approval of /terms and the customer agreement templates (remove the
    DRAFT bars only after approval). /privacy already approved 2026-10-15.
16. Real overheads entered for the forecasts; verify the grid CO2 factor.
17. Test-data clean-up: reviewed query, database backup first, count-only run
    first, deletes only is_test rows; staff accounts and real leads untouched.
    Never include audit_log: it is permanent (the database refuses any update or
    delete on it, even for the service role).
18. Decide on RETENTION_ENABLED (weekly clean-up job is count-only until then).
19. Rotate the Supabase database password after launch.
20. Switch Production NEXT_PUBLIC_LAUNCH_MODE from prelaunch to live, redeploy,
    and run a full smoke test on go4solar.app.
21. Set up custom SMTP for Supabase Auth emails (invites, password resets) so they
    come from no-reply@go4solar.app and aren't limited to a few per hour. Use Resend
    on a subdomain (e.g. send.go4solar.app) — its DNS records must not touch the root
    domain's mail settings.
22. Long live-mode e2e journey is flaky (slow screen updates over the remote
    database; data saves correctly). Split it into shorter tests and re-check
    after item 12 (parallel queries).

## 8. Home page hero photos (add or swap)

The hero background crossfades between photos (about 6 s each; people who ask for reduced motion
see the first only). Originals stay on your computer; only optimised copies are committed.

1. Put the original photos (any name, any size; at least 1920 × 1350 is best) in the folder
   `hero-originals/` at the top of the project. This folder is never committed (`.gitignore`).
2. List them, in the order you want, in `scripts/hero-photos.json`. For each photo, `fx`/`fy` is
   the point to keep in the middle (0 = left/top, 1 = right/bottom; 0.5 = centre), separately for
   the desktop crop (1920 × 1080) and the phone crop (1080 × 1350). Example:
   `{ "source": "my-roof.jpg", "desktop": { "fx": 0.5, "fy": 0.6 }, "mobile": { "fx": 0.4, "fy": 0.5 } }`
3. Run `npm run hero:build`. It writes `public/brand/hero/hero-N-desktop.jpg` (≤ 400 KB) and
   `hero-N-mobile.jpg` (≤ 300 KB) for each photo, deletes old ones, and updates
   `src/config/heroSlides.ts`. It warns if a photo is too small (it would look soft).
4. Look at the new files in `public/brand/hero/`; adjust `fx`/`fy` and run again if the panels
   are not central.
5. Commit `public/brand/hero/`, `scripts/hero-photos.json` and `src/config/heroSlides.ts`, then push
   (PR as usual). The site serves them as WebP/AVIF sized to each screen, so phones download far
   less than the JPEG sizes above. Only the first photo loads with the page; the rest load after.

