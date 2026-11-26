# Staging database for previews

**Why:** until now every Vercel preview used the **live** database, so a click on a preview was
real (on 25 Nov a batch went to Trade Lenda from a preview by mistake). After these steps previews
use their own **staging** database: same prices, plans and settings, **no customer data**. The live
site (go4solar.app) is not changed.

The admin pages say which database a preview uses:

- red: "PREVIEW — this uses the LIVE database…" (until the steps below are done)
- gold: "PREVIEW — staging database (test data only)…" (after)

## What is copied, what is not

| Copied once from live | Never copied |
| --- | --- |
| Settings (company details, deposit, sizing, terms), appliance library, components and prices, margins, tenure rates, installation and delivery prices, sun hours, roof types, racks, auto-pick rules, SPEWA price list, ready-made plans, agreement templates, partner names and logos, funders (contact emails blanked), routing rules | Customers, waiting list, quotes, invoices, applications, ID checks, documents, guarantors, agreements, loans, payments, batches, exports, staff accounts, messages, audit log, testimonials (people's names and photos) |

Pictures copied: ready-made plan photos, roof photos, partner logos. Not copied: installer, job
and testimonial photos.

## Your steps (Semako)

You do steps 1–4 and 7–9. I do 5–6 once you say yes.

**1. Create the staging project in Supabase**

1. Open <https://supabase.com/dashboard> and sign in.
2. Click **New project**.
3. Organisation: the same one as go4solar.
4. Name: `go4solar-staging`.
5. Database password: click **Generate a password**, then save it in your password manager as
   "go4solar staging database". You need it in step 3.
6. Region: **West EU (Ireland)**, the same as live.
7. Click **Create new project** and wait until it says the project is ready (a few minutes).

Note: a second project can cost extra, depending on your Supabase plan. Supabase shows the price
before you create it.

**2. Sign-in settings (Authentication) in the staging project**

1. In the staging project, open **Authentication → URL Configuration**.
2. **Site URL:** `http://localhost:3200`
3. **Redirect URLs:** click **Add URL** and add each of these three, one at a time:
   - `https://*-moses-semakos-projects.vercel.app/**`
   - `http://localhost:3200/**`
   - `http://localhost:3100/**`
4. Click **Save**.
5. Open **Authentication → Multi-Factor**. Check that **TOTP (Authenticator app)** is **enabled**.
   It is on by default. Staff need it to open the admin pages.

**3. Give me the staging details**

1. In the staging project, open **Project Settings → API** (or **Data API**).
2. Make a new file in the project folder called `.env.staging.local` (git never uploads files
   whose names start with `.env`). Put in these five lines and fill in each value:

   ```
   STAGING_SUPABASE_URL=            (Project URL, like https://abcd….supabase.co)
   STAGING_SUPABASE_ANON_KEY=       (anon / public key)
   STAGING_SUPABASE_SERVICE_ROLE_KEY=   (service_role key: secret)
   STAGING_SUPABASE_PROJECT_REF=    (the letters in the Project URL before .supabase.co)
   STAGING_SUPABASE_DB_PASSWORD=    (the password from step 1)
   ```

3. Save it and tell me it is there. Do not paste the service role key or the password into chat.

**4. Say yes to steps 5 and 6.**

## My steps (after your yes)

**5. Build the staging database**

- Apply every migration to staging in order (0031 stays set aside, as on live).
- Copy the settings and prices: `scripts/staging-copy-config.ts`, counts first, then `--write`.
  The script refuses to write to the live database.
- Make the e2e test accounts in staging (they are made by the tests themselves).

**6. Your staff account in staging**

- I run `npm run make-admin` against staging. **You type your own password** at the hidden prompt
  (I never set passwords).
- On your first sign-in on a preview, you set up two-factor again. Name it "Go4Solar STAGING" in
  your authenticator app so you can tell the two apart.

## Your steps (Vercel)

**7. Point previews at staging (Vercel)**

1. Open <https://vercel.com> → project **go4solar** → **Settings** → **Environment Variables**.
2. For each name in the table below:
   1. Find it in the list and click **⋯** → **Edit**.
   2. If it shows **Production** and **Preview** ticked: **untick Preview**, then **Save**.
      Production keeps its live value. **Never change a Production value.**
   3. Click **Add New** (at the top). Type the same name. Tick **Preview only**. Paste the staging
      value. **Save**.

   | Name | Preview value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | staging Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | staging service_role key |
   | `ID_HASH_SECRET` | a NEW random string, 40+ characters (a password manager can make one) |
   | `GUARANTOR_TOKEN_SECRET` | another NEW random string, 40+ characters |

   Leave everything else as it is (`TEST_MODE_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_LAUNCH_MODE`…).

**8. Rebuild a preview**

1. In Vercel, open **Deployments**, pick the newest **Preview**, click **⋯** → **Redeploy**.
2. When it is ready, open it and go to `/admin`. The banner must be **gold**: "PREVIEW — staging
   database". If it is still red, tell me and do not use the preview.

**9. Try it**

- Sign in with your staging staff account, open Admin → Pricing and Ready-made plans: the same
  prices as live. The waiting list is empty (no customers).

## From then on

- Every new migration goes to **staging first**, then to live after your yes.
- Price changes made on go4solar.app do **not** reach staging by themselves. Run the copy again
  (my step 5) when you want staging to match.
- The tests I run on this computer still use the live database (`.env.local`). Moving them to
  staging means changing `.env.local`, so I will ask you before doing that.
