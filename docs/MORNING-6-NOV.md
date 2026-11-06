# Friday 6 November — where GO / NO-GO stands

**iOS 1.5 is submitted to Apple.** Version 1.5 (build 10), both subscriptions,
four items in one submission, now *Waiting for Review*. Release is set to
**automatic**, so it goes on sale the moment Apple approves it. Apple say up to
48 hours; it is usually faster, and you get an email.

**Android still cannot ship**, for exactly one reason: the upload keystore
password. Everything else on that side is built and waiting.

---

## Done this morning

**The iOS build is fixed and uploaded.** Run #8 succeeded in 7m 09s:

| | |
|---|---|
| Version | 1.5, build 8 |
| Bundle | `com.gonogo.marine` |
| Signed | Apple Distribution, team H5JL2T3Y4X |
| .ipa | 15 MB, exported and accepted by `altool` |

Build #7 had died 46 seconds in with:

> `RevenueCat_RevenueCat does not support provisioning profiles, but provisioning profile 4f3c50f0-… has been manually specified`

Build settings handed to `xcodebuild` on the command line apply to **every**
target in the build, and since Capacitor 8 moved to Swift Package Manager that
includes the dependencies. RevenueCat was the first package target that cared,
and it refuses a profile outright — rightly, because a package has nothing of
its own to sign. The four signing settings now go into the App target's own
build configurations instead, which is where a local Xcode build keeps them.
Commit `8374a0b`.

Apple takes 5–15 minutes to process a build. By the time you read this it
should be showing in TestFlight as **1.5 (8)**.

The two warnings on the run are GitHub's own — Node 20 deprecation and macOS
runner capacity. Neither touches the app.

---

## Your list, in the order that gets money fastest

### 1 · Three Apple items that are still yours

The submission is in; these are not blocking it, but two of them cost you money
and one is a promise you made to Apple this afternoon.

1. **Buy an Open-Meteo plan.** This is the urgent one. Their free API is
   licensed for non-commercial use only, and their terms name *"apps that have
   subscriptions"* as commercial — so the day 1.5 goes on sale, the forecast
   feed is out of licence. You answered Apple's Content Rights question *"yes,
   and I have the necessary rights"* on the basis that you would fix this, so
   it is now a commitment, not a nicety. Sign up at dashboard.open-meteo.com;
   **Standard** (1M calls/month) covers both the forecast and marine endpoints
   and is the right tier until you are past a few thousand daily users. Send me
   the key and I will move the app to `customer-api.open-meteo.com` — it is the
   same API, a different host plus a key.
2. **Model Reporting Rules for Digital Platforms** — the Business page says
   *Missing Info*. OECD/DAC7 seller reporting, and unfilled it can hold your
   payouts. Click **Add Info**.
3. **App Store Small Business Program** — not enrolled, so Apple takes **30%**
   instead of 15%, and the commission maths in the API assumes 15%. Free, you
   qualify. Approval starts on the **1st of the following month**, so enrolling
   now fixes December.

### 2 · The Android keystore password — unblocks all Play revenue

Android Studio → **Build → Generate Signed App Bundle / APK**. The dialog has
`C:\Users\teren\Desktop\gonogo-keystore.jks`, alias `gonogo`, and
*Remember passwords* ticked, so the password should be sitting there filled in.

Put it in `app/android/keystore.properties` (gitignored, already created, the
two password lines are wrong):

```
storePassword=<the one from the dialog>
keyPassword=<same, unless you set a separate key password>
```

The build is otherwise finished — RevenueCat plugin registered, versionCode 6,
versionName 1.5, billing key baked in, compiles all the way through to the
signing step, which is the only thing that fails. Once the password is in,
`./gradlew bundleRelease` produces the AAB and I can take it from there.

Uploading it is what finally lets Play create the subscriptions: the
Subscriptions page still offers only *Upload a new APK* and no way to add a
product until a build containing the billing library exists.

If the dialog turns out to be empty, the fallback is Play Console → App signing
→ Upload key → **Request reset**, which takes Google 1–2 business days.

### 3 · RevenueCat — three things need you

The project is otherwise fully built: **GO NO-GO** (`07c24543`), App Store and
Play apps on `com.gonogo.marine`, products `gonogo_premium_annual` and
`gonogo_premium_monthly`, entitlement `premium` with both attached, offering
`default` marked **Current** with `$rc_annual` and `$rc_monthly` packages.

- **Webhook.** The form is open and filled in your browser except one field:
  the **Authorization header value**. Invent a long random string, paste it in,
  click *Add webhook*, and keep the string — it is also the next bullet.
- **Secrets.** From `gonogo-api`:

```bash
cd gonogo-api && npx wrangler secret put REVENUECAT_WEBHOOK_SECRET
```

```bash
cd gonogo-api && npx wrangler secret put REVENUECAT_SECRET_API_KEY
```

  (the second is a RevenueCat `sk_` key from Project settings → API keys —
  create one if there isn't one. Neither needs a deploy.)
- **Play service account JSON.** The Play app in RevenueCat cannot validate an
  Android purchase until a Google Cloud service account JSON is uploaded to it.
  Do this after the AAB is up.

Purchases themselves work without the webhook — the app calls
`/subscriptions/native/sync` and the server grants Premium. The webhook is what
keeps renewals and cancellations right afterwards, so it matters, but it is not
blocking a launch today.

### 4 · The two deploys only you can run

```bash
cd gonogo-api && npx wrangler deploy
```

```bash
cd website && npx wrangler pages deploy pub --project-name=gonogo-website --commit-dirty=true
```

The first picks up `TERMS_VERSION` / `CREATOR_TERMS_VERSION` = `2026-11-05`,
matching the rewritten terms. The second publishes the new terms pages.

### 5 · Play housekeeping, whenever

- **Declare your trader status** — deadline 1 Feb 2027, EU removal otherwise.
- Developer name is still **tezz777able**. Change it before any marketing.
- **Rotate** the two Cloudflare API tokens, the Neon password and the mail
  password in `gonogo-website-deploy.txt`. Gitignored now, but they were exposed.

---

## Still deliberately not done

- **In-app "Report an issue".** First job after you are selling, not the
  morning of a launch.
- **Per-store platform fee.** `PLATFORM_FEE = 0.15` is the Play rate and is
  applied to everyone. If you enrol in the Small Business Program it becomes
  correct for Apple too from December. Roughly an hour plus a deploy to make it
  per-store, and the SQL aggregations that count users by plan have to change
  with it.
- **Request reset on the upload key, and Add Info on the tax form.** Your
  signing identity and your tax identity — yours to click, not mine.
