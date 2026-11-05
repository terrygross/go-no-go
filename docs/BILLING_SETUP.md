# Turning the money on

The app code is finished. Premium is sold through the App Store and Google Play,
both via RevenueCat, and the server already verifies every purchase. What is
left is console work in four accounts, and almost all of it can only be done by
Terry, because it involves bank details, tax forms and legal agreements.

**The money model, for reference**

- The stores take the payment and pay us. Apple and Google are the merchants of
  record; they handle cards, VAT and sales tax, refunds and chargebacks.
- Stripe never sells anything. It exists only to pay commission **out** to
  referrers and creators.
- Commission is **20%** of net receipts for a Premium member who refers someone,
  **35%** for an approved creator, recurring for as long as the referral keeps
  paying.
- A creator's discount code is funded from **their own 35%**, never from our
  margin: `creatorRateAfterDiscount()` in the API is `max(0, 35 − discount)`, and
  a code is capped at 35%. A creator can give away their entire commission and
  not a cent more.

---

## ⚠️ Read this one first: Apple's cut, and your commission bill

The API works out commission as a share of **net** receipts, using a single
platform fee:

```
gonogo-api/src/index.ts
const PLATFORM_FEE = 0.15;   // "Google Play ... 10% service + 5% billing"
```

Google Play takes 15%, so that is right for Android. **Apple takes 30% for the
first year of every subscription** — unless you are in the **App Store Small
Business Program**, which drops it to 15% from the start.

If you ship iOS without joining that programme, then for every iOS subscriber:

| | Assumed (15%) | Actual (30%) |
|---|---|---|
| Net on $2.99/month | $2.54 | $2.09 |
| Commission paid at 20% | $0.51 | should be $0.42 |

You would **overpay commission by about 21% on every iOS referral**, and the MRR
and revenue figures in the admin dashboard would be overstated by the same
logic. Nothing would error — it would just quietly cost you money.

**Fix:** apply to the App Store Small Business Program. It is free, it takes a
few minutes, you qualify comfortably (under $1M proceeds a year), and it makes
`PLATFORM_FEE = 0.15` correct for both stores so no code has to change.

> App Store Connect → Business → in the Agreements area, the Small Business
> Program enrolment. Approval applies from the **first day of the next month**,
> so enrolling before the end of November matters.

If you would rather not join, say so and I'll make the fee per-store
(`PLATFORM_FEE_APPLE` / `PLATFORM_FEE_PLAY`, chosen by `subscription_source`)
instead — about an hour's work, plus an API deploy.

---

## What is already done (no action needed)

- Purchase flow in the app: `src/lib/billing.js`, `src/account/Upgrade.jsx`.
- Paywall carries everything Apple requires: name, length, store price,
  auto-renewal wording, restore button, Terms and Privacy links.
- Free vs Premium gating: already enforced and unchanged — free is today-only
  planning, 1 marina, no home call, no commission; Premium is the 10-day
  planner, unlimited marinas, the home call and commission.
- Server verification: `/subscriptions/native/sync` and `/webhooks/revenuecat`.
- Plugin registered in both native projects (`npx cap sync` has been run).
- **No API code deploy is required.** The two new values are secrets, and
  `wrangler secret put` takes effect without a deploy.

---

## 1 · RevenueCat  (~15 min, Terry)

RevenueCat is free below $2,500/month of tracked revenue.

1. Create the account at <https://app.revenuecat.com> and a project called
   `GO NO-GO`.
2. Add two apps to it: **App Store** and **Play Store**, both with bundle /
   package id `com.gonogo.marine`.
3. From **Project settings → API keys**, collect:
   - the **public** app-specific key for App Store — starts `appl_`
   - the **public** app-specific key for Play Store — starts `goog_`
   - one **secret** key — starts `sk_` (server only; never in the app)

## 2 · Google Play  (~30 min + review, Terry)

> **Order matters here, and not in the obvious way.** Checked in Play Console on
> 5 Nov 2026: the Subscriptions page says *"Your app doesn't have any
> subscriptions yet"* and offers only **Upload a new APK**. There is no "create
> subscription" button at all. Play will not let a subscription be created until
> a build **containing the billing library** has been uploaded, and v1.4 has no
> billing library — that is the very bug v1.5 fixes.
>
> So the **v1.5 build must be uploaded first**, and that needs the Android
> upload-key password. Until that password surfaces, nothing else on the Play
> side can move. It is the first domino, not a later step.

0. **Build and upload v1.5.** Put the upload-key password in
   `app/android/keystore.properties`, then Claude can build and upload it to the
   internal testing track. That alone unlocks everything below.
1. **Payments profile.** Play Console → Setup → Payments profile. Until this
   exists Play cannot sell anything. Needs your bank and tax details.
2. **Create the subscription** (only possible after step 0). Monetise → Products
   → Subscriptions → Create:
   - Product ID: **`premium`** (exactly — the API expects this string)
   - Name: `GO / NO-GO Premium`
3. **Add two base plans** on that subscription, both auto-renewing:
   - ID **`monthly`** — $2.99, billing period 1 month
   - ID **`annual`** — $19.99, billing period 1 year
   Set prices for all other countries (Play will convert), then **Activate**
   both. The API matches `premium:monthly` and `premium:annual`.
4. **Connect Play to RevenueCat.** RevenueCat's Play app wants a Google Cloud
   service-account JSON with Play Developer API access; RevenueCat's own guide
   walks through creating it. Expect Play to take a few hours to honour new
   service-account permissions.

## 3 · App Store  (~45 min + agreement wait, Terry)

1. ~~**Paid Applications Agreement.**~~ **Done** — verified Active on 5 Nov 2026
   (3 Nov 2026 – 24 Oct 2027), along with the bank account and the W-8BEN. It
   was already in place for What's Inside, and agreements are per developer
   account, not per app. iOS in-app purchase was never actually blocked.
   ⚠️ One row on that page still says **Missing Info**: *Model Reporting Rules
   for Digital Platforms* (the OECD/DAC7 seller report). Left unfilled it can
   hold up payouts. Click **Add Info** and complete it.
2. **Small Business Program** — see the warning at the top. Still not enrolled.
3. ~~**Create the subscription group and the two subscriptions.**~~ **Done on
   5 Nov 2026.** Group **Premium** (id `22550489`), group display name
   `GO / NO-GO Premium`, English (U.K.):
   - **Premium Annual** — product id **`gonogo_premium_annual`**, Apple id
     6831333107, 1 year, $19.99, all 175 countries
   - **Premium Monthly** — product id **`gonogo_premium_monthly`**, Apple id
     6831334219, 1 month, $2.99, all 175 countries

   The `gonogo_` prefix is deliberate: **App Store product ids are unique across
   the entire developer account**, and plain `premium_annual` was already taken
   by What's Inside. The API needs no change — `planFromPlayProduct()` reads the
   plan from the id by regex, so keep the word "annual" in the yearly one or
   every iOS subscriber is recorded as monthly and every commission figure
   derived from them is wrong.

   Still outstanding on each product: a **review screenshot**, which Apple
   requires before the subscription can be submitted. It has to show the real
   paywall, so it comes from the v1.5 build once that is on TestFlight.
4. **In-app purchase API key for RevenueCat.** Users and Access → Integrations →
   In-App Purchase → generate a key, and give the `.p8` to RevenueCat.
5. **Attach both subscriptions to the version you submit.** App Store Connect
   says it outright on the product page: *"Your first auto-renewable
   subscription must be submitted with a new app version."* So the two products
   and the 1.5 build go to review together — add them under In-App Purchases on
   the 1.5 version page. A build with a paywall and no submitted products is a
   guaranteed rejection.

## 4 · RevenueCat wiring  (~15 min, Terry)

1. **Products** — import all four: `premium:monthly`, `premium:annual` (Play)
   and `gonogo_premium_monthly`, `gonogo_premium_annual` (App Store).
2. **Entitlement** — create one with identifier exactly **`premium`** and attach
   all four products. The app and the API both look for this exact string.
3. **Offering** — create one (`default` is fine), add a **Monthly** and an
   **Annual** package, attach the matching product for each store, and mark the
   offering **Current**. The app reads `offerings.current`; if nothing is marked
   current the paywall will say no plans came back.
4. **Webhook** — Integrations → Webhooks:
   - URL: `https://api.gonogoboatapp.com/webhooks/revenuecat`
   - Authorization header: a long random string you invent. Keep it; it is
     `REVENUECAT_WEBHOOK_SECRET` below. (`Bearer ` in front is tolerated.)

## 5 · Secrets  (~5 min, Terry)

Two on the API — these need **no deploy**:

```bash
cd gonogo-api
npx wrangler secret put REVENUECAT_SECRET_API_KEY
npx wrangler secret put REVENUECAT_WEBHOOK_SECRET
```

One on GitHub, for the iOS build — Settings → Secrets and variables → Actions:

- `REVENUECAT_IOS_KEY` = the `appl_…` public key.

The iOS workflow now **fails the build** if this is missing, rather than
shipping another binary that cannot take a payment.

For local and Android builds, create `.env.local` in the repo root (it is
gitignored):

```
VITE_REVENUECAT_IOS_KEY=appl_xxxxxxxx
VITE_REVENUECAT_ANDROID_KEY=goog_xxxxxxxx
```

Both of those are **public** app-specific keys. They ship inside the app and
are not secrets. The `sk_` key is a secret and goes only in the Worker.

Then build the Android app with:

```bash
npm run build:android
```

Use that rather than `npm run build`, because it refuses to build without the
Play key. That matters more than it sounds: without a key the app does not
error, it just quietly decides purchases are unavailable — which is exactly how
v1.4 reached the Play Store unable to take a payment. The iOS workflow has the
same guard.

## 6 · Ship it

- **iOS** — run the iOS TestFlight workflow. Nothing else needed from you.
- **Android** — still blocked on the **upload-key password**, which lives only in
  Android Studio's credential store on your PC. Put it in
  `app/android/keystore.properties` and I can build and upload.

---

## How to test before you trust it

- **Android:** add your own Google account as a **licence tester** in Play
  Console (Setup → Licence testing). Test purchases are free and renew in
  minutes rather than months.
- **iOS:** use a **Sandbox tester** (Users and Access → Sandbox) in TestFlight.
- After either purchase, check the account screen flips to "Premium is active",
  and that the Plan tab shows 10 days. If the purchase succeeds but Premium does
  not switch on, the fault is the webhook secret or the RevenueCat secret key —
  check the Worker's logs, not the app.
