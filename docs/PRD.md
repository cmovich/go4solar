# Go4Solar App — Product Requirements Document

Oct 8, 2026 · @Moses Semako

## Executive summary

Go4Solar is a web app that takes a Nigerian homeowner or SME from "what do I need?" to "system installed on credit" in one flow: calculate load, pick a financed quote, pass KYC, pay a deposit from 20%, and get installed by a verified installer using equipment from a verified vendor.

The app coordinates five parties: **consumers**, **guarantors**, **installers**, **vendors** and **Go4Solar admin staff**. Money and goods only move when each party has passed verification and signed its part.

**Consultant verdict: the idea is sound and the market is proven.** Rivy, the closest competitor, connects 250+ vendors and installers with buyers and reports a non-performing loan ratio below 1% ([Techeconomy](https://www.techeconomy.ng/payhippo-drops-sme-lending-rebrands-as-rivy-with-4m-to-focus-on-clean-energy-financing)). Rivy asks for at least 30% deposit and starts at 12% for three-month terms ([Condia](https://thecondia.com/rivy-launches-energystack-clean-energy-marketplace/)). Go4Solar's edge is a lower 20% entry deposit, a homeowner-first flow, and an existing track record (20+ financed clients, over ₦30M disbursed, \~1 MW installed, a waiting list).

Three changes matter most for success (detail in Consultant recommendations):

1. **Do not rely on "retrieval after one month" alone.** Add remote-lock-capable inverters, direct-debit mandates and registration on the National Collateral Registry. Repossession in Nigeria is slow and expensive; lockout is what makes PAYG solar scale.
2. **Replace "Google Lens" with a vision-AI nameplate reader.** Google Lens has no public API; a vision model reading the appliance's rating label is cheaper and more accurate.
3. **Size the three quotes in kWh, not just hours.** Use a proper sizing engine with daily usage hours per appliance, so the "backup hours" promise is honest and defensible.

### Decisions agreed on 8 October 2026

Semako approved all three changes above, the sizing logic, the payout rules and all 11 consultant recommendations. This PRD now reflects those decisions.

| Topic | Decision |
| --- | --- |
| Lender of record | Chosen per loan by the approving admin from a funder list admin maintains (e.g. SPEWA programme funds, Trade Lenda, other funders, or Go4Solar's own fund for smaller packages) |
| Consumer pricing | No interest charged to consumers. Go4Solar adds a markup that covers funder interest, costs and profit; super admin sets all rates |
| Deposit | 20% minimum, open to everyone; may drop to 10% later for strong credit scores |
| Equipment | Multi-brand; only products with remote lock and monitoring are financed; brands still being selected (including Chinese manufacturers) |
| Supply | Most items shipped directly by OEM partners to Go4Solar; registered vendors can also buy for Go4Solar at competitive prices |
| Repayment | Bank account linked for direct debit; in-app payment also allowed and unlocks the system automatically |
| Lock control | Automatic lock on default, plus manual lock/unlock by admin; one extension of up to 30 days on appeal |
| Energy visibility | Every consumer sees live and historical power usage in the app |
| Collateral | Every financed system registered on the National Collateral Registry |
| Installer quotes | Go4Solar markup applied automatically; app suggests the Go4Solar quote when cheaper, user decides |
| Cash buyers (100% upfront) | Referred to the nearest verified vendor |
| Launch states | Abuja, Kaduna and Lagos |
| Payments | Paystack |
| Advisor support | Up to 5 staff, 08:00–20:00 daily; WhatsApp AI covers the remaining hours |
| Programmes | Go4Solar's own grants and events, with funders and manufacturers, open to consumers, installers and vendors |
| Phase 2 | Inventory financing for vendors |
| Waiting-list order | Calculator, total load, loading screen, phone, email, name, three estimate plans, deposit slider 20–95%, "we will notify you within 7 days" |
| Markup | Spread across all equipment items, not installation; falls as the deposit rises; admin sees a live price preview while editing |
| Assisted entry | Staff with permission can enter customers' details, prelaunch and after launch, with a full record of who entered what |
| BVN | Required from every PAYG customer |
| Late fee | 0.75% of the overdue amount per day, written into the agreement |
| Landing message | "Zero interest" and "direct importers" lead the hero (agreed 9 Oct) |
| Profit and forecasts | Profit checked per request, tracked per customer and in total; 1–10 year forecasts and "what if" calculator in Phase 1 (agreed 9 Oct) |

## Problem, users and goals

Nigerian households and SMEs pay heavily for grid tariffs and generator fuel, but a complete solar system costs more than most can pay upfront. They also cannot tell a fair quote from an inflated one, or genuine equipment from fakes. Go4Solar solves cost (financing), sizing (calculator) and trust (verified installers and vendors) in one place.

### The five user types

| User | What they do in the app | Verification |
| --- | --- | --- |
| Consumer (homeowner or SME) | Calculates load, picks or uploads a quote, signs, pays deposit and monthly repayments | NIN, face liveness, address, bank account, e-signature |
| Guarantor | Receives an email link, registers, accepts liability if the consumer defaults | NIN, face liveness, e-signature |
| Installer | Uploads quotes for clients, guarantees the job, collects equipment from a vendor, installs, uploads proof | NIN, face liveness, business docs (CAC if registered), references, e-signature |
| Vendor | Lists products and prices, confirms warranty, releases equipment against a pickup code, gets paid | CAC, TIN, director NIN and liveness, bank account, warranty declaration |
| Admin staff | Sets prices, approves applications, manages users, collections, grants and events | Staff login with 2-factor and role permissions |

### Goals for the first 12 months

- Convert the existing waiting list into financed installations through the app, not WhatsApp and paper.
- Approve or decline a complete application within 48 hours.
- Keep repayments more than 30 days late under 5% of the loan book.
- Onboard enough verified installers and vendors to serve Abuja, Kaduna and Lagos first.

### Success metrics

Agreed targets: decision on every complete application within 48 hours, and PAR30 under 5%.

| Metric | What it tells us |
| --- | --- |
| Calculator completions | Is the landing page pulling the right people? |
| Quote selected ÷ calculator completed | Are the three quotes clear and affordable? |
| KYC passed ÷ KYC started | Is verification too hard or too slow? |
| Deposit paid ÷ application approved | Do approved users actually commit? |
| Days from deposit to installation | Is fulfilment through vendors and installers working? |
| Portfolio at risk, 30+ days (PAR30) | Is the lending healthy? |


## End-to-end journey

Both quote routes merge at KYC, and nothing is released by a vendor until the admin approval gate is passed.

&#91;embedded content: Consumer journey · two quote routes, one approval gate\]

At the quote step the user can also open the WhatsApp advisor and return to choose. The guarantor's verification runs in parallel with the consumer's own KYC, triggered by the link sent in step 8 of Feature 5.

## Features 1–2: Landing page and app entry

The landing page has one job: get the visitor to start the load calculator. Every call-to-action button opens the calculator directly, with no sign-up first.

### Landing page message

The hero sells two facts competitors cannot match together: **no interest** and **direct-import prices**. Recommended hero:

> **Solar on monthly payments. Zero interest.** We import directly from the manufacturers, so you pay less upfront and never pay interest. Start with 20%, spread the rest over up to 12 months. \[Calculate my load\]

Three supporting badges sit directly under the button:

| Badge | Line under it |
| --- | --- |
| 0% interest | One fixed price, shown in full before you sign |
| Direct importers | Factory prices, no middlemen, genuine warranty |
| From 20% deposit | The rest in up to 12 monthly payments |

Alternative headlines for A/B testing:

- "No interest. No middlemen. Just solar."
- "Factory-direct solar, paid monthly, at 0% interest."
- "Stop buying fuel. Own your solar in 12 months, interest-free."

**Claims rules** (to keep the message trustworthy and compliant):

- "0% interest" stays true only if every quote shows the total amount payable, and the late fee is disclosed. The quote screen already does both.
- "Direct importers" must be true for the products shown; vendor-supplied items are not described as direct imports.
- Advertising in Nigeria is regulated by ARCON; adverts outside the website (billboards, radio, paid social) should be vetted before release.

**Landing page sections, top to bottom**

1. Hero: the "Zero interest, direct importers" message below, a "Calculate my load" button, three badges, and a trust line ("20+ homes and businesses financed, \~1 MW installed").
2. How it works: four steps — calculate, choose a plan, verify, get installed.
3. Savings comparison: generator fuel or grid bill versus monthly solar repayment.
4. Proof: client photos and short testimonials (with written permission), partner logos once agreements are signed.
5. For installers and vendors: a short section with "Become a partner installer" and "Become a verified vendor" buttons.
6. FAQ: deposit, tenure, what happens if I miss a payment, warranty, who installs.
7. Footer: address (Suite 40, Jayjay Shopping Complex), Contact@go4solar.app, phone numbers, WhatsApp button, privacy policy and terms.

**Requirements**

- Loads in under 3 seconds on a 3G phone connection; images compressed, no heavy video above the fold.
- Built mobile-first; most visitors will arrive from WhatsApp and Instagram on phones.
- The calculator saves progress in the browser, so a visitor who leaves can continue later on the same device.
- An account is created only when the visitor chooses a quote (phone number + one-time code). This removes the biggest drop-off point.
- Separate entry links for installers (`/partners/installer`) and vendors (`/partners/vendor`), so partners never see the consumer flow.

## Prelaunch waiting list (Phase 1, first release)

Before the full app opens, Go4Solar runs a waiting list to show funders real demand. It is the first thing built and goes live on its own; its data is tentative and is cleared before launch.

### Consumer waiting-list flow

Go4Solar sends a link (WhatsApp, email, social media). The flow asks for one thing per screen, sliding to the next screen with a swipe, so it feels quick on a phone:

1. **Calculate load** with the full calculator (Feature 3), including the AI watts lookup.
2. **See the total load** (running watts, surge watts, kWh per day) and a **Get quotes** button.
3. **"Preparing your quotes…"** loading screen with a short animation.
4. **Phone number** screen (swipe in): phone number for calls, with a WhatsApp number below and a "same as phone" tick.
5. Short loading pause, then the **email** screen, then another short pause.
6. **Name** screen: first name and surname, plus state and LGA of installation (Abuja, Kaduna, Lagos, or "Other" to measure demand elsewhere) and a consent tick to be contacted.
7. **"Here are your plans, \[First name\]"**: the three plans (Essential, Comfort, 24-Hour Independence), each marked **Estimate** and priced at the 20% starting deposit. The user taps one.
8. **Contribution** screen for the chosen plan: "How much can you pay upfront?" A slider runs from 20% to 95%. As it moves up, the total cost, the upfront amount and the monthly payment update live, with a line such as "You save ₦202,500 by paying 50%." The user also answers "When can you pay this?" (Now / Within 30 days / Later).
9. Taps **Next** and sees: "Thank you, \[First name\]. You are on the Go4Solar waiting list. We will notify you within the next 7 days." A copy goes to their email and WhatsApp.

**Design rules for this flow**

- Each loading pause lasts 1–2 seconds at most. Every extra second loses users on slow phones.
- The record is saved after each screen. If someone leaves after giving a phone number, admin still sees them as an **incomplete lead** and can follow up.
- No account, NIN, BVN, KYC or payment is collected at this stage. Duplicate phone numbers are flagged to admin, not blocked.
- Prices use the live pricing settings, so the waiting-list estimates match what users will see at launch.

### Installer waiting-list flow

A separate link asks installers for: name, business name, phone, WhatsApp, email, states and LGAs served, years in business, installations completed, CAC registered (yes/no), and a consent tick. They see: "Thank you. We will contact you within 7 days."

### Admin waiting-list view

- Headline numbers for funders: total sign-ups, sign-ups by state, total system value of selected plans, total deposits pledged, total financing needed, average deposit %, and how many said "Yes now".
- Table of consumers and of installers with filters (state, deposit band, plan, readiness, date) and the full load list per consumer. Separate tabs for complete sign-ups and incomplete leads (left after giving a phone number), and an "Entered by" column for assisted entries.
- **Download PDF:** a funder-ready report with a summary page (the headline numbers and a chart of sign-ups by state) followed by the list. Also **Download CSV** for staff use.
- **Clear waiting list before launch:** super admin only, requires export first and typing a confirmation word. A full clear cannot be undone.

### Consultant note

These sign-ups are your warmest leads. Rather than deleting everyone, invite them first at launch (they gave consent), then delete the records of those who do not respond within 30 days.

## Feature 3: Load calculator

The calculator lets a user build a list of everything they want to power, then shows three totals: running watts, starting (surge) watts and daily energy in kWh. All three are needed to size a system honestly.

### Categories

ACs, fans, washing machines and pressing irons do not belong under Electronics. Installers group appliances by how they use power, so the app uses seven plain-English categories. Default watts below are typical values; admin can edit every default.

| Category | Typical items and default watts |
| --- | --- |
| Lighting | LED bulb 10 W, energy-saver bulb 20 W, incandescent bulb 60–100 W, fluorescent tube 36 W, LED tube 18 W, security/flood light 50–100 W, chandelier (custom) |
| TV and Electronics | 32" TV 50 W, 43" TV 80 W, 55" TV 120 W, decoder 20 W, sound system 100 W, soundbar 40 W, game console 150 W, Wi-Fi router 10 W, Starlink 75 W, CCTV/DVR 40 W, laptop 65 W, desktop + monitor 200 W, printer 50 W, phone charger 10 W |
| Kitchen Appliances | fridge 150 W, chest freezer 200 W, double-door fridge 250 W, blender 400 W, microwave 1,000 W, electric cooker (per plate) 1,500 W, electric oven 2,000 W, kettle 1,500 W, toaster 800 W, rice cooker 700 W, air fryer 1,500 W, water dispenser 100 W |
| Cooling and Comfort | standing fan 60 W, ceiling fan 75 W, air cooler 150 W, AC 1 HP 900 W, AC 1.5 HP 1,300 W, AC 2 HP 1,800 W, inverter AC 1.5 HP 900 W |
| Laundry and Home Care | washing machine 500 W, pressing iron 1,200 W, vacuum cleaner 1,000 W, hair dryer 1,200 W, water heater 3,000 W |
| Water and Outdoor | surface pump 0.5 HP 370 W, surface pump 1 HP 750 W, borehole pump 1 HP 750 W, gate motor 300 W, electric fence 10 W |
| Business and Office (SME) | sewing machine 100 W, barbing clipper 15 W, POS terminal 10 W, photocopier 1,500 W, commercial freezer 400 W, display fridge 300 W |

### How a user adds an item

1. Tap a category; a list of items opens.
2. Tap an item; it is added with its default watts, quantity 1 and default hours per day.
3. Edit watts, quantity or hours on the item card. Watts accept any number from 1 to 10,000.
4. Item not listed: tap **Add your own**, type a name and watts, choose its category.
5. Remove an item with one tap; totals update instantly.

Every library item also stores two hidden values the user never has to see: a **surge factor** (motors such as fridges, pumps, ACs and washing machines draw about 3× their running watts for a second when starting) and a **duty cycle** (a fridge compressor runs roughly a third to half of the time). These make the totals realistic.

### Hours per day

Each item has a default hours-per-day value (lights 6, fridge 24, TV 6, AC 8, pressing iron 0.5). Users can leave defaults or adjust. Without hours, the app can size the inverter but not the battery, so this field is required for quotes.

### "I don't know the watts" — AI lookup

A small **?** icon sits beside every watts box. Tapping it opens the camera or photo upload with one instruction: "Snap the label at the back or bottom of the appliance."

1. The photo goes to a vision AI model (Claude or Gemini vision), not Google Lens. Google Lens has no public developer API, and Google says no Cloud service matches it ([Google Developer forums](https://discuss.google.dev/t/difference-google-lens-vs-google-cloud-vision-api/193387/2)).
2. If the rating label is readable, the model returns the rated watts, or calculates volts × amps.
3. If only the appliance is visible, the model identifies type, brand and size and returns an estimate range, marked "Estimate".
4. The user sees the result and taps **Use this value** or edits it. Nothing is filled in without the user's tap.
5. Photos are deleted after processing; only the result is stored.

### Results screen

- Total running watts, total surge watts and total daily energy (kWh/day), in large numbers.
- A breakdown by category, so the user sees what is driving the size.
- A heavy-load warning on items over 1,000 W used together (cooker, oven, kettle, water heater, pressing iron), with advice: run them in daytime on solar, or keep them on gas or grid. This one tip can cut a quote by half.
- A **See my solar plans** button that leads to Feature 4.

## Feature 4: Quotes (generate or upload)

After the calculator, the user either generates three Go4Solar quotes or uploads a quote an installer already gave them. Both routes end at the same place: one chosen quote, ready for KYC.

### Route A — Generate three quotes

The app sizes three systems from the user's own load, prices them from the admin price list, and shows them side by side.

| Plan | Backup at full load | Who it suits |
| --- | --- | --- |
| Essential | About 3 hours | Grid is available most days; solar covers outages and evenings |
| Comfort | About 8 hours | Long outages; covers evening and most of the night |
| 24-Hour Independence | Runs day and night without grid or generator | Little or no grid; business that cannot stop |

Each quote shows: inverter size (kVA), battery size (kWh and type), number and wattage of panels, protection devices, cables and mounting, installation and logistics, total price, a deposit slider from 20% upward showing how much a bigger deposit saves, tenure options (3, 6, 9, 12 months), the monthly instalment, the total amount payable (no interest is charged; see Pricing, markup and funders), and a 7-day validity date (prices move with the exchange rate).

Every quote carries this notice, as Semako specified:

> Backup hours assume every item on your list is switched on at the same time. In real life this rarely happens, so you will usually get more backup time than shown.

**Consultant addition:** below the notice, also show a "Your realistic backup" figure computed from the hours per day the user entered. This turns a disclaimer into a selling point and reduces disputes later.

### Sizing logic

The engine uses standard off-grid sizing. Admin can change every constant.

```latex
\text{Inverter (kVA)} = \frac{\max(1.25 \times P_{\text{running}},\ P_{\text{surge}})}{0.8}
```

```latex
\text{Battery (kWh)} = \frac{P_{\text{running}} \times H_{\text{backup}}}{1000 \times \text{DoD} \times \eta_{\text{inverter}}}
```

```latex
\text{Panels (kW)} = \frac{E_{\text{daily}} + E_{\text{battery recharge}}}{\text{PSH} \times 0.75}
```

- P running = total running watts; P surge = largest motor surge plus everything else running.
- DoD (usable depth of discharge) = 0.8 for lithium (LiFePO4), 0.5 for lead-acid. Default to lithium; lead-acid only as an option.
- Inverter efficiency = 0.9. Panel derate 0.75 covers heat, dust and wiring losses.
- PSH (peak sun hours) by state, set by admin: roughly 4.5 in the south to 6 in the far north (approximate; confirm with NASA POWER data before launch).
- Results round **up** to the next size actually stocked by vendors (for example 3.5 kVA, 5 kVA, 10 kVA; 5 kWh or 10 kWh battery modules).
- For the 24-hour plan, battery covers the hours without sun using the user's real kWh per day, not full load for 24 hours. Full load for 24 hours would produce a quote several times too large and unaffordable.

### Route B — Upload an installer's quote

1. User uploads a PDF or photo of the quote and enters the installer's name, phone and email.
2. AI extracts the line items (panels, batteries, inverter, labour) into a table the user confirms.
3. The app compares each line against the admin price list and the user's calculated load. Items far above market price or undersized for the load are flagged for admin.
4. The installer gets an invite link to register (or is matched if already registered) and must confirm the quote is theirs.
5. Financed amount is capped by the admin price list, so inflated quotes cannot be financed in full.

### Choose or get advice

- **Choose this plan** starts Feature 5 (account creation, then KYC).
- **Chat with our solar advisor on WhatsApp** opens WhatsApp with a pre-filled message containing the quote reference, so the advisor (AI first, human on request) already sees the user's load and three quotes.
- A **Save and decide later** option emails or WhatsApps the quotes, with a reminder after 2 days.

Users who want to pay 100% upfront tap **I'll pay in full** and are referred to the nearest verified vendor in their state, with their load summary attached, so the vendor can serve them directly.

## Pricing, markup and funders

Consumers pay no interest. They pay one fixed price for the system, split into a deposit and equal monthly instalments; Go4Solar's markup inside that price covers the funder's interest, operating costs and profit. A bigger deposit means less money borrowed, so the price drops.

### What super admin sets

| Setting | Example of what it holds |
| --- | --- |
| Cost price per component | Landed cost from OEM partners, or the price a registered vendor buys at for Go4Solar |
| Base margin per category | Panels, batteries, inverters, accessories each with their own % |
| Installation and logistics | Fixed amount per job size, per launch state |
| Funders | Each funder's interest rate (per year), tenure limits, minimum and maximum amount, balance available |
| Pricing rate per tenure | The rate used in every quote for 3, 6, 9 and 12 months: target funder cost + Go4Solar spread + default buffer |
| Minimum deposit by credit band | 20% for all at launch; lower (e.g. 10%) can be switched on per band later |

### The price calculator

```latex
P = \frac{C}{1 - f \times (1 - d)}
```

- C = cost price of all items + base margins + installation and logistics.
- f = pricing rate for the chosen tenure, as a share of the money financed (e.g. 24% per year × 12 months = 0.24).
- d = deposit share (0.2 for 20%, 0.5 for 50%).
- Deposit = P × d; monthly instalment = (P − deposit) ÷ months.

Illustration only, with C = ₦2,000,000, 12 months and f = 0.24:

| Deposit | System price | Deposit paid | Monthly instalment |
| --- | --- | --- | --- |
| 20% | ₦2,475,248 | ₦495,050 | ₦165,017 |
| 50% | ₦2,272,727 | ₦1,136,364 | ₦94,697 |

Paying 50% upfront saves this customer about ₦202,500. The quote screen shows this saving next to the deposit slider, which nudges larger deposits and lowers risk.

### How admin enters financing rates

There are two different rates, entered in two different screens, and the app checks one against the other.

**1. Funders screen (what a funder charges Go4Solar).** For each funder, super admin enters: interest rate per year, method (flat or reducing balance), any upfront fee %, tenure limits, minimum and maximum amount, and balance available. Go4Solar's own fund has a "cost of funds" rate, which can be 0%.

**2. Financing rates screen (what goes into every customer price).** One row per tenure, with three inputs the app adds up:

| Tenure | Expected funder rate (per year) | Go4Solar spread | Default buffer | Pricing rate (auto) |
| --- | --- | --- | --- | --- |
| 12 months (example) | 16% | 6% | 2% | 24% |

The pricing rate drives the price formula above. Customer prices therefore stay the same whichever funder later approves the loan.

**3. Approval screen (the check).** When the admin picks a funder, the app works out the real cost of that funder's money and the profit on this loan, before approval.

The funder's interest is charged on the money Go4Solar actually draws, not on the customer's balance. Go4Solar pays the cost price of the system (equipment + installation); the customer's deposit covers part of it, and the funder covers the rest:

```latex
\text{Money drawn from funder} = \text{cost price of system} - \text{customer deposit}
```

Example, using the 20% deposit illustration (cost price ₦1,800,000; system price ₦2,475,248; deposit ₦495,050; money drawn ₦1,304,950; 12 months, flat interest):

| Funder option | Interest Go4Solar pays | Profit on this loan | Per month |
| --- | --- | --- | --- |
| Funder A at 16% | ₦208,792 | ₦466,456 | ₦38,871 |
| Funder B at 26% | ₦339,287 | ₦335,961 | ₦27,997 |
| Go4Solar own fund (0% cost) | ₦0 | ₦675,248 | ₦56,271 |

Profit here = system price − cost price − funder interest, before the direct costs in Profitability, analytics and forecasting (KYC, collection fees, expected losses). A result below the admin-set minimum margin shows in red and needs super admin approval.

**Safety rules:** only super admin edits rates; every change is logged; new rates apply only to new quotes, because each quote saves a snapshot of the rates used to price it.

### How the markup is spread across items

The customer never sees a separate "financing" line. The whole markup is spread across the equipment items in the quote, and installation stays at its fixed price. The markup % falls as the deposit rises, which rewards bigger contributions.

```latex
m = \frac{P - I - E}{E} \qquad \text{item price} = \text{item cost} \times (1 + m)
```

- P = system price from the price formula above; I = installation and logistics; E = cost price of all equipment items.
- m is one markup % applied to every equipment item, so each item carries its fair share.
- Item prices are rounded to the nearest ₦100; any rounding difference goes on the largest item so the lines always add up to the total.

Illustration only: equipment cost ₦1,600,000 (of which panels ₦600,000), base margin 12.5%, installation ₦200,000, 12 months, pricing rate 24%:

| Deposit | Markup on each item | Panels line | System price | Upfront | Monthly |
| --- | --- | --- | --- | --- | --- |
| 20% | 42.2% | ₦853,218 | ₦2,475,248 | ₦495,050 | ₦165,017 |
| 50% | 29.6% | ₦777,273 | ₦2,272,727 | ₦1,136,364 | ₦94,697 |
| 95% | 14.0% | ₦684,109 | ₦2,024,291 | ₦1,923,077 | ₦8,435 |

At 95% the markup is close to the base margin alone, because almost nothing is borrowed.

### Live price preview for admin

Every pricing screen (component costs, category margins, installation, financing rates) has a **Price preview** panel beside the form. It updates as admin types, before anything is saved:

- Pick a sample package (or any real quote) and a tenure.
- Move a deposit slider from 20% to 95% and watch, line by line: each item's cost, markup % and selling price, installation, system total, upfront amount and monthly payment.
- See Go4Solar's side at the same time: equipment margin, financing spread, default buffer, and net profit with each active funder (negative results in red).
- A small chart shows the system price falling as the deposit rises.
- **Save** applies the new values to new quotes only; **Discard** throws the draft away.

### Backend view (admin only)

For every quote and loan, admin sees: cost price, base margin, installation, financing markup, the funder's actual interest cost, default buffer and net profit, in naira and %. Consumers never see this breakdown.

### Choosing the funder at approval

1. The approving admin sees a list of eligible funders for this loan (amount, tenure and balance fit), including **Go4Solar own fund** for smaller packages.
2. For each option the app shows Go4Solar's net margin with that funder's real interest rate, and warns if the margin is negative.
3. Admin ticks one funder; the loan, collateral registration and repayment reporting are tagged to that funder.
4. Admin can add, edit or pause funders at any time from the Funders module.

### Installer quotes and the "save with Go4Solar" prompt

When a user uploads an installer's quote, the app applies the same financing markup to the installer's total (pre-filled, not editable by the user). It also prices the equivalent Go4Solar package for the same load. If ours is cheaper, the user sees: "You could save ₦X with a Go4Solar quote," with both options side by side. The user chooses; nothing is forced.

### Disclosure

Even without interest, every quote shows the total amount payable, deposit, instalments and number of months. Regulators can still treat a deferred-payment sale as credit, so the lawyer review in Compliance must cover this markup model.

## Feature 5: Registration, KYC, guarantor, signature and deposit

Once a quote is chosen, the consumer completes nine steps. A progress bar shows the steps, and the user can stop and resume at any point.

### Consumer steps

1. **Create account** — phone number with one-time code, then email and password.
2. **Personal details** — full name, date of birth, gender, home address, state and LGA, installation address (if different), employment type, employer or business name, monthly income range, next of kin.
3. **NIN check** — user enters NIN; the KYC provider returns the official name, date of birth and photo. Name and date of birth must match step 2. The user also photographs the NIN slip or card (front and back) for the file.
4. **BVN check (required for every PAYG customer)** — confirms the bank identity and is needed for direct-debit mandates and credit-bureau checks.
5. **Face verification (liveness)** — the camera guides the user, as Opay and banks do: face the camera, turn head left, turn head right, then blink or smile. The provider confirms a live person (not a photo or video) and matches the face to the NIN photo.
6. **Address and site** — upload a recent utility bill or tenancy agreement, and drop a map pin on the installation site. For loans above an admin-set amount, order a physical address visit.
7. **Income check** — connect a bank account (Mono) or upload 6 months of statements. Rule: the monthly repayment should not exceed a share of verified income set by admin (suggested 30–35%).
8. **Guarantor** — enter the guarantor's name, phone, email and relationship. The guarantor's flow runs in parallel (below).
9. **Terms, signature and deposit** — described below.

### Guarantor flow

1. Guarantor receives an email and SMS with a secure link that expires in 72 hours (resend allowed).
2. Guarantor sees who they are guaranteeing, the amount financed, the monthly repayment and the tenure, before entering any data.
3. Guarantor completes NIN check, face liveness, address, employment and income range.
4. Guarantor reads the guarantee agreement and signs on the signature canvas.
5. Rules: guarantor must be 18 or older, cannot be the applicant, and cannot guarantee more than an admin-set number of active loans.
6. If the guarantor fails or declines, the consumer is asked to nominate another.

### Terms and signature canvas

- A plain-language summary card appears first: amount, deposit, monthly repayment, total cost, tenure, collateral, what happens on late payment, warranty and data consent.
- The full agreement follows; the **Sign** button unlocks only after the user scrolls to the end.
- Separate tick boxes for: the loan agreement, use of the solar system as collateral, remote lock on non-payment, credit-bureau reporting, and processing of biometric data.
- The signature canvas lets the user draw with a finger or mouse, plus type their full name. A one-time code to the phone confirms the signature.
- The app records the time, IP address, device and code confirmation, then generates a signed PDF with an audit page and emails it to the user. Nigeria's Evidence Act 2011 (section 93) recognises electronic signatures.

### Deposit

- Minimum deposit 20% of the quote; user can choose more to lower monthly repayments.
- Pay by card, bank transfer or USSD through Paystack.
- Before the deposit is confirmed, the user authorises a direct-debit mandate for monthly repayments.
- Status then shows **Under review**; admin approves or declines within 48 hours. If declined, the deposit is refunded in full within an admin-set number of days.

### KYC providers

Recommendation: QoreID as main provider, Dojah as backup. QoreID covers every check Go4Solar needs in one place, including a ready-made guarantor verification product and physical address checks. Dojah adds CAC and TIN lookups for vendor onboarding and shareable Flow Links that suit the guarantor email link. Keep Smile ID as the alternative if liveness spoofing becomes a problem. Before signing, ask all three for per-check prices and run 20 test verifications each.

| Provider | Useful for Go4Solar |
| --- | --- |
| [Smile ID](https://usesmileid.com/countries/nigeria) | Document check, selfie liveness, access to 9 government ID databases with 132M+ Nigerian records |
| [QoreID](https://docs.qoreid.com/docs/nigeria-2) | NIN face match, liveness, address verification and a ready-made guarantor verification product |
| [Dojah](https://docs.dojah.io/docs) | NIN/BVN lookup, liveness, CAC lookup for vendors, and shareable Flow Links that suit the guarantor email link |
| [Youverify](https://doc.youverify.co/know-your-customer-services-kyc/id-data-matching-eidv/nigeria/verify-national-identification-number-nin) | NIN verification, NIN facial matching, liveness SDKs |

Cost control: run the cheapest check (NIN lookup) first and liveness only if it passes; allow 3 attempts, then send to manual review.

## Installers and vendors

Installers and vendors each get their own portal. Neither can receive a job or a payment until KYC is approved and their partner agreement is signed on the signature canvas.

### Installer onboarding

- NIN check and face liveness for the owner (same as consumers).
- Business details: CAC certificate if registered, business address, service areas (states and LGAs).
- Proof of competence: certificates (for example NAPTIN or other recognised solar training), photos of 3 past installations, 2 client references.
- Bank account for payouts (verified by account-name match).
- Partner agreement: workmanship standards, response times, installer guarantee terms, and penalties for faulty work.

### Vendor onboarding

- CAC certificate, TIN, verified business address, director NIN and face liveness.
- Bank account for settlement.
- Product catalogue: brand, model, specification, price, stock status and warranty period for each item. Admin approves every product before it can appear in a quote.
- Warranty declaration signed on the canvas: products are genuine and carry the stated manufacturer warranty, and the vendor will honour replacement claims.

### Job flow after approval

1. **Assignment.** If the consumer used a Go4Solar quote, admin (or auto-matching by area and rating) assigns an installer and a vendor. If the consumer uploaded an installer's quote, that installer gets the job.
2. **Installer accepts** within 24 hours, or the job goes to the next installer.
3. **Installer guarantee.** On installer-quote jobs, the installer also signs a guarantee for the client, as Semako specified.
4. **Pickup code.** The app issues a one-time pickup code to the installer.
5. **Vendor release.** The vendor enters the code, records the serial number of every panel, battery and inverter (barcode scan where possible), ticks and signs the warranty confirmation, then releases the goods.
6. **Installation and commissioning.** The installer uploads photos of each component, confirms serial numbers, activates remote monitoring and the lock feature on the inverter, and the consumer signs off on the canvas.
7. **Admin check**, then payouts.

**Equipment source.** Most equipment is shipped by OEM partners directly to Go4Solar's store; in that case Go4Solar's store staff do the release in step 5 (pickup code, serial numbers). Registered vendors supply the rest, buying for Go4Solar at agreed competitive prices. Inventory financing for vendors arrives in Phase 2.

### Payout rules (consultant recommendation)

| Party | When paid |
| --- | --- |
| Vendor | In full once pickup is confirmed and serial numbers match the quote |
| Installer | 70% at commissioning sign-off; 30% retention released after 30 days with no fault reports |

The retention protects consumers from poor workmanship without a dispute process. Installers and vendors also get a rating from consumers and admin; low ratings remove them from auto-matching.

## Repayment, lock control, energy dashboard and collateral

Repayments come in two ways that talk to each other: an automatic direct debit from the user's linked bank account, and manual payment in the app. Any payment that clears a missed instalment unlocks the system within minutes.

### Direct debit without being a bank

Go4Solar does not need to write to every bank. A direct debit is a "pull" payment the customer authorises once; it runs on NIBSS's e-mandate system, and Paystack, Mono and Fincra let any registered business create these mandates through one integration. (A standing order is different: the customer sets it up inside their own bank, and Go4Solar cannot see or control it.)

- **Main: [Paystack Direct Debit](https://paystack.com/docs/payments/direct-debit/)** — same provider as deposits, so one dashboard and one settlement account. Paystack creates a mandate only where the customer's bank is supported.
- **Backup: [Mono Direct Debit](https://docs.mono.co/docs/payments/direct-debit/overview)** — for banks Paystack does not cover, and for Mono Sweep, which tries the customer's other linked accounts when the main one is short.
- **Option: [Fincra](https://docs.fincra.com/v3.0/docs/direct-debit-mandate-management)** — NIBSS mandates activated in minutes after a ₦50 token payment.

How it works for the user: during Feature 5 they link their bank account, approve the mandate (token payment or bank approval), and see "Auto-pay is on". A user who cannot set up a mandate can still be approved, but admin sees the flag at approval.

### In-app payment and auto-unlock

1. User taps **Pay now** on the dashboard and pays by card, transfer or USSD (Paystack checkout).
2. Paystack confirms the payment to Go4Solar's server (webhook).
3. The app marks the instalment paid. The direct-debit job always checks the schedule first, so it never charges an instalment that is already paid.
4. If the system is locked and nothing is overdue anymore, the app sends an unlock command to the inverter and battery through the maker's cloud. The user sees "Unlocked" within minutes.
5. If the unlock command fails, operations staff get an alert and a WhatsApp message goes to the user.

### Late fees, lock and extensions

1. **3 days before due:** reminder by SMS, WhatsApp and email.
2. **Due date:** automatic debit; retries on days 1, 3 and 5 (Mono Sweep if available).
3. **Day 1 late:** late fee applies: 0.75% of the overdue amount for each day it stays unpaid, counted from the day after the due date. The rate is written into the signed agreement and shown on the summary card. Super admin can change the rate for new agreements and sets a maximum total late fee per instalment.
4. **Day 7:** guarantor is notified.
5. **Day 12:** 48-hour warning that the system will be locked.
6. **Day 14:** automatic remote lock.
7. **Day 30:** formal notice of default to consumer and guarantor; demand on the guarantor.
8. **After the lawyer-confirmed notice period:** retrieval by an assigned installer, with photos and signed handover.

- **Admin lock:** authorised admin can lock any financed system at any time, with a reason recorded. Unlocking without payment needs a second admin's approval.
- **Extension on appeal:** the consumer can appeal in the app (reason and evidence); their installer or vendor can add support. Admin may grant one extension of **no more than 30 days**. During the extension the ladder pauses; afterwards it resumes where it stopped.
- All messages stay respectful: no calls to the user's contacts, no public shaming, in line with the FCCPC's 2025 lending rules ([Guardian](https://guardian.ng/news/digital-lending-fccpc-issues-regulations-to-tackle-consumer-abuses/)).

### Lock-capable equipment, any brand

Go4Solar will work with more than one manufacturer, so the app talks to equipment through a **device adapter**: one standard set of actions (read status, read energy, lock, unlock) with a small connector per brand's cloud API. A product can only be approved for financing once its brand has a working adapter and passes a lock/unlock test. Research shows almost no lender has scaled solar financing without lockout ([CGAP](https://cgap.org/node/3144)), and that customers accept it when told upfront, which the summary card does.

### Energy usage dashboard

Every financed customer sees, in the app:

- Battery level now, and whether the system is charging from solar, grid or generator.
- Solar produced and power used today, with 7-day and 30-day charts.
- Estimated money saved versus generator fuel or grid.
- Alerts: low battery, overload, fault, panel output unusually low (dirty panels).
- Lock status, next payment date and amount.

Data is fetched from the maker's cloud every 5–15 minutes. Admin sees the same view per system plus a fleet view: offline systems, faults, and locked systems.

### Collateral registration

Every financed system is registered on the CBN's [National Collateral Registry](https://www.cbn.gov.ng/DFD/ncr.asp) using the serial numbers captured at pickup. The CBN says registration is done by financial institutions, so Go4Solar should apply for registered-user access; where access is not granted, the funder selected for that loan files the registration. The registration is discharged when the loan is paid off.

### Completion

When the last payment clears, the app issues an ownership certificate, permanently unlocks the system, cancels the mandate, releases the guarantor and discharges the collateral registration. The energy dashboard stays available.

## Admin back office

The back office is where Go4Solar staff run the business: prices, approvals, partners, money and communications. Every action is logged with who did it and when.

| Module | What staff can do |
| --- | --- |
| Dashboard and analytics | Funnel (visits → calculations → quotes → KYC → approved → installed), loan book size, collections this month, PAR30, installs by state, top appliances entered |
| Price list | Upload and edit component prices (CSV or form), set margin per category, set quote validity days, update appliance library defaults and sizing constants (PSH per state, DoD, derate) |
| Applications | Queue of complete applications with KYC results, credit score, affordability check, quote, guarantor status; approve, decline with reason, or request more information |
| Manual review | Cases where KYC failed 3 times, names did not match, or an uploaded quote was flagged as inflated |
| Installers and vendors | Approve or suspend partners, approve vendor products, view ratings, reassign jobs, release retention payouts |
| Jobs | Track every installation from assignment to commissioning, with photos and serial numbers |
| Loans and collections | Repayment schedules, failed debits, late-payment ladder status, lock/unlock (with a reason, two-person approval for unlock without payment), retrieval cases |
| Payments | Deposits, refunds, vendor and installer payouts, reconciliation with the payment provider |
| Grants and events | Run Go4Solar's own programmes with funders and manufacturers (grants, training, events) for consumers, installers and vendors; publish to the landing page, dashboards, email and WhatsApp; collect applications |
| Content | Edit FAQs, testimonials, terms and conditions versions |
| Staff and roles | Add staff, assign roles, enforce 2-factor login |
| Funders | Add, edit or pause funders (SPEWA programme funds, Trade Lenda, others, Go4Solar own fund): interest rate, tenure limits, ticket sizes, balance; see each funder's loan book and repayments |
| Pricing and markup (super admin) | Cost prices, category margins, installation and logistics per state, pricing rate per tenure, default buffer, late fee (0.75% per day) and its cap, minimum deposit per credit band; margin view per quote and loan |
| Inventory | Stock shipped by OEM partners to Go4Solar and stock bought through vendors: quantities, serial numbers, location, landed cost; release to installers by pickup code |
| Devices and lock control | Fleet view of every financed system (online, faults, locked); lock any system with a reason; unlock without payment needs a second admin; brand adapters and lock tests |
| Appeals and extensions | Review consumer appeals with installer or vendor support; grant one extension of up to 30 days; ladder pauses and resumes automatically |
| Cash-buyer referrals | Track users referred to vendors for 100% upfront purchase and whether they bought |
| Profit and forecasts (super admin, finance) | Profit per loan at quote, approval and actual; monthly profit per customer and in total; grand total profit or loss; plan comparison; 1–10 year scenarios and the "what if" calculator (see Profitability, analytics and forecasting) |

### Staff roles

| Role | Access |
| --- | --- |
| Super admin | Everything, including staff management and settings |
| Credit officer | Applications, manual review, approve/decline up to an amount limit |
| Operations | Installers, vendors, jobs, products |
| Collections | Loans, reminders, lock requests, retrieval cases |
| Finance | Payments, payouts, reconciliation, reports |
| Content | Announcements, grants, events, FAQs |

No single staff member can both approve a loan and release the money for it (separation of duties).

Staffing at launch: up to 5 staff covering 08:00–20:00 daily. Outside those hours the WhatsApp AI advisor answers, and anything needing a person is queued for the morning.

### Assisted entry (staff fill in for a customer)

Staff with the **Assisted entry** permission can enter a customer's details from the back office when the customer has difficulty: no smartphone, poor network, or a walk-in or phone call. It works both for the prelaunch waiting list and after launch.

- The staff form follows the same steps as the customer flow: load calculator, contact details, plan, deposit, and after launch the application details.
- Every record shows **Entered by \[staff name\]** with date, time and channel (phone call, walk-in, WhatsApp, field visit). Every later edit is logged with who changed what.
- The customer gets an SMS and WhatsApp message with a link to check and confirm the details. Unconfirmed records are marked **Awaiting customer confirmation**.
- Steps that prove who the customer is must be done by the customer: face liveness, the signature and the one-time code that confirms it, and the direct-debit mandate. Staff can enter NIN and BVN, then send the customer a link to finish these steps on their own phone, or complete them on a staff device with the customer present.
- Admin reports show how many records each staff member entered, so assisted entries can be audited.

Staff and roles adds an **Assisted entry** permission, which can be given to any role.

## Profitability, analytics and forecasting

Every request is checked for profit the moment it is entered, every loan's profit is tracked monthly against plan, and the same engine projects the business 1 to 10 years ahead. Only super admin and finance roles see this module.

### What the system calculates for every loan

The calculation runs three times: **Quoted** (when the request is entered, using the default funder), **Approved** (with the funder the admin picks) and **Actual** (from real payments each month). The dashboard shows the gap between plan and actual.

| Line | Example: 20% deposit, 12 months, Funder A at 16% |
| --- | --- |
| System price (what the customer pays in total) | ₦2,475,248 |
| Cost price: landed equipment + installation | ₦1,800,000 |
| Money drawn from funder (cost price − deposit) | ₦1,304,950 |
| Funder interest | ₦208,792 |
| KYC and verification, customer + guarantor (admin-set) | ₦10,000 |
| Payment and direct-debit fees (admin-set, ₦300 per instalment) | ₦3,600 |
| Expected loss provision (admin-set, 2% of balance) | ₦39,604 |
| **Net profit on this customer** | **₦413,251** |
| **Net profit per month of the loan** | **₦34,438** |
| Customer pays each month / Go4Solar repays funder each month | ₦165,017 / ₦126,145 |
| Annual return on the funder money used | 31.7% |

All unit costs above are illustrations; admin enters the real ones. A loan whose net profit falls below the admin-set minimum is flagged in red before approval.

### Dashboard views

- **Per customer:** profit this month, profit to date, profit still to come, repayment status (on time, late, locked), and actual against plan.
- **Portfolio:** profit this month, this year and all time; the **grand total profit or loss**; split into equipment margin and financing spread; filters by funder, state, plan, deposit band and installer.
- **Booked, collected and at risk:** profit on signed contracts, profit already collected in cash, and profit on loans that are late. These three numbers differ, and the gap matters.
- **Funders:** money drawn, repaid and outstanding per funder, interest paid, repayments due next 90 days, and an alert when a month's customer collections will not cover that month's funder repayments.
- **Risk:** PAR30, defaults, money recovered, and actual losses against the provision.

### Which repayment plans make more money

Same system and 20% deposit, priced at the 24% per year pricing rate (illustration):

| Tenure | System price | Monthly payment | Net profit per customer | Profit per month of loan | Annual return on funder money |
| --- | --- | --- | --- | --- | --- |
| 3 months | ₦2,100,840 | ₦560,224 | ₦201,134 | ₦67,045 | 58.3% |
| 6 months | ₦2,212,389 | ₦294,985 | ₦256,589 | ₦42,765 | 37.8% |
| 9 months | ₦2,336,449 | ₦207,684 | ₦326,440 | ₦36,271 | 32.7% |
| 12 months | ₦2,475,248 | ₦165,017 | ₦413,251 | ₦34,438 | 31.7% |

12-month plans earn the most per customer, but 3-month plans earn almost twice as much per naira borrowed, because the money comes back four times a year and can fund the next customer. Deposits work the same way: at 12 months, a 50% deposit earns ₦330,218 per customer against ₦413,251 at 20%, but returns 49.8% a year on the money drawn instead of 31.7%, with far less risk. The dashboard shows both measures side by side, so admin can tune pricing rates per tenure and deposit band.

### Charts on the dashboard

- Monthly profit: actual against projected, with the line where actual ends and forecast begins.
- Cumulative profit and the grand total.
- Profit by tenure and by deposit band (per customer and per naira borrowed).
- Cash in from customers against repayments out to funders, month by month.
- Funder money needed against funder balances available.
- PAR30 and losses against the provision.

### Forecasting engine (1 to 10 years)

Admin builds named scenarios and picks a horizon of 1 to 10 years. Inputs, all editable:

- New customers per month in year 1, and growth per year.
- Plan mix: share of customers on each tenure and deposit band.
- Average system cost, installation cost and margins.
- Price inflation and naira exchange-rate change per year.
- Pricing rate per tenure, funder rates, and share funded from Go4Solar's own fund.
- Default rate and share recovered.
- Overheads: fixed per month (staff, office, technology) plus cost per system.

The engine runs month by month: each month's new customers create deposits, funder draws, instalments, funder repayments and expected losses over their tenure. Outputs per year and per month: customers, revenue, gross profit, overheads, net profit, cumulative profit, cash flow, peak funder money needed and the break-even month. Low, base and high scenarios show side by side, with sliders for default rate, funder rate and naira movement to test sensitivity.

**"What if" calculator:** type a number of customers per year (for example 1,000) and see net profit, funder money needed and the staff needed to serve them. Every forecast exports to PDF and Excel for funders.

### Illustrative 10-year projection

On the illustration's numbers, Go4Solar breaks even at about 129 systems a year (11 a month), and growth will be limited by funder money long before demand.

Assumptions (illustration only, to be replaced by admin): 240 systems in year 1 (20 a month); each like the example above (₦413,251 net profit), rising 12% a year with prices; overheads of ₦48 million a year growing 15% a year, plus ₦40,000 per system; profit counted when the system is installed.

&#91;embedded content: Go4Solar illustrative model · 3 growth scenarios · years 1–10\]

In the base case (40% more customers each year), year 5 brings 922 systems and about ₦458 million net profit, but needs about ₦1.9 billion of funder money that year alone. By year 10 it needs about ₦17.9 billion. Lining up funders early is therefore as important as marketing, and the dashboard puts funder money needed beside funder balances for this reason.

## Compliance, legal and risk

Go4Solar handles identity, biometric and financial data and offers credit through an app, so three sets of rules apply. Get a Nigerian fintech lawyer to confirm each point before launch; this section is not legal advice.

### Rules that apply

| Area | What it means for Go4Solar |
| --- | --- |
| Digital lending (FCCPC) | The [DEON Consumer Lending Regulations 2025](https://www.mondaq.com/nigeria/dodd-frank-consumer-protection-act/1692284/demystifying-deon-your-essential-guide-to-the-fccpcs-latest-lending-rules) took effect in 2025 and require FCCPC registration for digital consumer lending, with a ₦100,000 application fee. They are described as covering **unsecured** loans; Go4Solar's loans are asset-backed, so it may fall outside — a lawyer must confirm. Either way, follow their standards: clear cost disclosure, no harassment, fair recovery. |
| Data protection (NDPC) | Under the NDPA 2023 and the [GAID 2025](https://www.mondaq.com/nigeria/privacy-protection/1627428/key-regulatory-updates-under-the-2025-general-application-and-implementation-directive-gaid-issued-by-the-nigeria-data-protection-commission-ndpc), explicit consent is mandatory for sensitive data such as biometrics (face scans). Appoint a Data Protection Officer, run a Data Protection Impact Assessment before launch, publish a privacy policy, and sign data-processing agreements with every KYC and payment provider. |
| Collateral | Security over movable assets is perfected by registration on the [National Collateral Registry](https://www.cbn.gov.ng/DFD/ncr.asp) under the Secured Transactions in Movable Assets Act 2017. |
| Who lends | If Go4Solar lends its own money at scale, it may need a money-lending licence (state) or to lend through a licensed partner. The admin picks a licensed funder as lender of record for each loan (SPEWA programme funds, Trade Lenda or others); Go4Solar's own fund is used only for smaller packages. The no-interest markup model also needs the lawyer's review. |
| Electronic signatures | Recognised under the Evidence Act 2011; keep the full audit trail (time, IP, device, OTP). |

### Key risks and controls

| Risk | Control |
| --- | --- |
| Customer stops paying | Direct debit, remote lock, guarantor, collateral registration, retrieval |
| Identity fraud (fake NIN, photo spoof) | Government NIN match, active liveness, BVN match, manual review queue |
| Inflated installer quotes | Price-list comparison, financed amount capped, admin flagging |
| Fake or substandard equipment | Admin-approved product list, vendor warranty declaration, serial numbers captured |
| Poor installation | Commissioning photos, consumer sign-off, 30% installer retention |
| Naira price swings | 7-day quote validity, admin can bulk-update prices |
| Data breach | Encryption, role-based access, KYC images in private storage, deletion schedule |
| Lockout misuse by staff | Lock/unlock logged with reason; two-person approval for exceptions |

## Technical architecture, integrations and data model

Build on the stack already used across Fine Grape projects, so Claude Code can work from one familiar pattern: Next.js 15 (App Router) with TypeScript, Supabase (Postgres, Auth, Row Level Security, Storage), Tailwind CSS with shadcn/ui, hosted on Vercel. The existing Go4Solar brand design system and landing page carry over.

### App areas (one codebase)

| Area | Route | Who sees it |
| --- | --- | --- |
| Public site | `/` | Everyone |
| Calculator and quotes | `/calculate`, `/plans` | Everyone (no login until a plan is chosen) |
| Consumer dashboard | `/app` | Consumers |
| Guarantor flow | `/guarantee/[token]` | Guarantors via secure link |
| Installer portal | `/partner/installer` | Installers |
| Vendor portal | `/partner/vendor` | Vendors |
| Back office | `/admin` | Staff only, 2-factor |

Row Level Security in Supabase ensures each user only reads their own records; staff access is by role.

### Third-party services

| Need | Service (main / backup) |
| --- | --- |
| NIN, BVN, liveness, face match, address | QoreID / Dojah |
| Deposits and card/transfer payments | Paystack / Korapay |
| Direct-debit mandates | Paystack / Mono (and Fincra as an option) |
| Bank statements and income check | Mono |
| Appliance label reading and quote extraction | Claude vision API |
| WhatsApp advisor and reminders | WhatsApp Business Platform (Meta Cloud API or a provider such as Twilio) |
| SMS one-time codes and reminders | Termii |
| Email | Resend |
| Maps and site pin | Google Maps |
| Signed PDF agreements | Server-side PDF generation |
| Remote monitoring and lock | Device adapter over each approved brand's cloud API (status, energy readings, lock, unlock) |
| Credit bureau checks | Through the financing partner |

### Main data tables

| Table | Holds |
| --- | --- |
| `profiles` | Every user, with role: consumer, guarantor, installer, vendor, staff |
| `kyc_checks` | Each verification attempt, provider reference, result, reviewer |
| `appliance_library` | Category, name, default watts, surge factor, duty cycle, default hours |
| `load_assessments` and `load_items` | A user's calculator session and each item in it |
| `components` and `products` | Admin price list and vendor products with warranty |
| `quotes` and `quote_items` | Generated or uploaded quotes, tier, line items, validity date |
| `applications` | Consumer application status from submitted to approved or declined |
| `guarantees` | Guarantor link, status, signed agreement |
| `agreements` | Every signed document: type, version, signature image, audit trail, PDF |
| `loans` and `repayment_schedule` | Principal, deposit, rate, tenure, each instalment and its status |
| `mandates` and `payments` | Direct-debit mandates and every money movement |
| `jobs` and `equipment_serials` | Installation job, pickup code, serial numbers, commissioning photos |
| `payouts` | Vendor and installer payouts, including retention |
| `announcements` | Grants, events and news |
| `audit_log` | Every staff action and every lock/unlock |
| funders and pricing\_settings | Funder details and rates; margins, pricing rate per tenure, late fee, deposit per credit band |
| inventory | Stock items, serial numbers, location, landed cost, source (OEM or vendor) |
| devices and energy\_readings | Each installed system's brand, cloud ID and lock state; readings every 5–15 minutes |
| appeals and lock\_events | Extension requests and decisions; every lock and unlock with reason and who approved |
| loan\_profit\_snapshots | Profit lines per loan at Quoted, Approved and each month's Actual |
| unit\_costs and overheads | KYC, payment and debit fees, loss provision rate; monthly company overheads |
| forecast\_scenarios | Named scenarios, their inputs, horizon (1–10 years) and saved results |

## Consultant recommendations

These are the changes most likely to decide whether Go4Solar succeeds, in order of importance. All 11 were adopted on 8 October 2026.

1. **Make the loan hard to walk away from, not just recoverable.** "Retrieval after one month" is expensive in Nigeria: you need a vehicle, an installer, access to the property and sometimes the police. Direct debit, remote lock and the guarantor will collect most late payments long before retrieval.
2. **Only finance lock-capable equipment.** Approve a short list of inverters with cloud monitoring and remote lock. This also gives you live data on how each system performs, which is valuable for warranty claims and investors.
3. **Keep deposit at 20%, lower it with data.** A 20% deposit beats Rivy's 30% and is a strong selling point. It is open to everyone at launch; admin can lower it to 10% for strong credit-score bands once repayment data supports it.
4. **Lend through partners from day one.** The approving admin picks the lender of record per loan from the funder list (SPEWA programme funds, Trade Lenda, other funders, or Go4Solar's own fund for small packages). Licensed funders reduce Go4Solar's licensing burden and can file collateral registrations.
5. **Push daytime use of heavy loads.** Most quotes are inflated by cookers, kettles, irons and water heaters. The calculator's heavy-load tip can halve system size and make repayments affordable, which lowers default.
6. **Show savings, not just price.** On each quote, show the monthly repayment beside the user's current monthly spend on fuel or grid. A solar repayment lower than the fuel bill sells itself.
7. **Add BVN.** NIN alone does not support direct debit or credit-bureau checks.
8. **Collect serial numbers at pickup.** Serial numbers link the loan to the exact equipment — essential for warranty, collateral registration and retrieval.
9. **Hold back 30% of installer pay for 30 days.** It removes most workmanship disputes without lawyers.
10. **Turn completed customers into referrers.** Offer a referral reward once a referred customer pays their deposit. Your 20+ past clients are the cheapest marketing channel you have.
11. **Plan for SMEs and institutions as a second product.** The SPEWA institutional PPA model (Bingham University, Kuciano Hotel) needs a different flow: energy audit, bigger loans, 12–36 months. Keep it out of the MVP, but design the data model so it can be added.

## Phased roadmap and MVP scope

Ship the consumer journey first and serve your existing waiting list with staff doing the partner coordination by hand; automate partners and collections once real loans are running. The prelaunch waiting list (calculator, estimate quotes, admin report) ships first, ahead of the rest of Phase 1.

&#91;embedded content: Roadmap · 3 phases, 2 gates\]

Phase 1 deliberately keeps installer and vendor coordination manual (admin assigns jobs and pays partners by transfer) so the consumer product reaches real customers fastest. Phase 1 systems must still be lock-capable equipment; until each brand's adapter is built, staff lock and unlock through the maker's own app. Phases are gated by results, not dates; dates follow once the open questions below are answered.

## Remaining open items

All 12 original questions are answered (see Decisions agreed on 8 October 2026). These items are still open; none blocks the start of Phase 1 coding, but each must be done before the matching feature goes live.

- [ ] **Equipment brands:** shortlist from the manufacturer talks; each brand needs a cloud API with lock/unlock and passes a test before financing (blocks remote lock and energy dashboard).
- [ ] **KYC pricing:** per-check quotes from QoreID, Dojah and Smile ID; 20 test verifications each.
- [ ] **Funder terms:** first funders to load into the system, with rates, tenure limits and ticket sizes.
- [ ] **Markup numbers:** category margins, pricing rate per tenure, default buffer and late-fee amount for super admin to enter.
- [ ] **Credit scoring:** which bureau or funder data will set the credit bands for a future 10% deposit.
- [ ] **Lawyer review:** markup model under the FCCPC rules, notice period before retrieval, and the four agreements (consumer, guarantor, installer, vendor).
- [ ] **Collateral Registry:** apply for registered-user access at the National Collateral Registry.
- [ ] **Paystack direct debit:** confirm which banks are supported; open a Mono account as backup.
- [ ] **WhatsApp Business:** verify the business account and number for the advisor.
- [ ] **Store location:** where OEM shipments are received and released for each launch state.
- [ ] **Forecast inputs:** real unit costs (KYC, payment fees), loss provision rate, monthly overhead budget and year-1 customer target, to replace the illustration.
