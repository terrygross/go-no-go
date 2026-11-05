# Friday morning, 6 November — what's done, and what needs you

Short version: **the App Store side is ready to submit and needs about an hour
of your clicking to get there. The Play side cannot ship today**, and that is
worth reading before anything else.

---

## The one piece of bad news, first

Android v1.5 cannot go up today, and no amount of work from me changes it.

Uploading anything to Play needs the **upload key**, and that keystore's
password is lost — it is not the What's Inside one, it is not in git, and it is
not in any config file anywhere on this PC (I searched Documents, Desktop,
`.gradle` and every `keystore.properties` on the machine). Without an upload,
Play will not even let a subscription be created: the Subscriptions page still
offers one button, **Upload a new APK**, and no way to add a product. I checked
again tonight.

So Android revenue depends on one of these two, in this order:

1. **Find the password.** Open Android Studio → **Build → Generate Signed App
   Bundle / APK**. If it was ever built from there, the keystore path and
   password are remembered in the dialog. Five minutes, and if it works
   everything below unblocks immediately.
2. **Reset the upload key.** Play Console → Test and release → **Protected with
   Play → App signing → Upload key → Request reset** (the button is there, I
   left the page open). Google takes **1–2 business days**, so this means
   Android money starts Monday or Tuesday, not today. You would register
   `Desktop\gonogo-keystore-GEMINI-NEW-5nov.jks`, whose password you do know,
   as the new upload key.

Either way the live v1.3 listing stays up and keeps working. Nothing breaks.

**Do not do an Android release today expecting money from it.** iOS is the
realistic Friday launch.

---

## What I finished while you slept

**App Store Connect — subscriptions are fully built.** Group **Premium**
(`22550489`), display name `GO / NO-GO Premium`:

| | Product ID | Apple ID | Price | Countries |
|---|---|---|---|---|
| Premium Yearly | `gonogo_premium_annual` | 6831333107 | $19.99 | all 175 |
| Premium Monthly | `gonogo_premium_monthly` | 6831334219 | $2.99 | all 175 |

Apple converted every other currency itself (£, €, AUD and the rest). Both have
display names and descriptions in English (U.K.). Both say *Prepare for
Submission*, which is correct — Apple will not take them until they go up with
the 1.5 build.

The `gonogo_` prefix is not a typo. App Store product ids are unique across
your **whole developer account**, and What's Inside already owns
`premium_annual`. The API doesn't care: it reads the plan from the id by
pattern, so `gonogo_premium_annual` is still recognised as the yearly one.

**Code.** Two commits, pushed to GitHub:

- The in-app legal screen claimed your location was used *"only on your phone"*.
  That was untrue — the coordinates go to Open-Meteo — and it is the one screen
  an App Review reader actually reads. Fixed, and it now also says that Apple
  and Google take the payment.
- `npm run build:android` refuses to build without the RevenueCat key. **This
  is the bug that cost you v1.4**: a missing key is not an error anywhere, the
  app just quietly decides purchases are unavailable and uploads looking fine.
  The iOS workflow already had this guard; Android now does too.

The Android project itself is otherwise ready — RevenueCat plugin registered,
`versionCode 6`, `versionName 1.5`, fresh web assets synced. It only waits on
the key.

---

## Your list, in the order that gets money fastest

### 1 · RevenueCat account — 15 min, blocks everything

I can't create accounts, so this one has to be you, and nothing else can start
until it is done.

<https://app.revenuecat.com> → project `GO NO-GO` → add two apps, **App Store**
and **Play Store**, both with bundle/package id `com.gonogo.marine`.

From **Project settings → API keys**, collect three values:

- public Apple key, starts `appl_`
- public Play key, starts `goog_`
- one secret key, starts `sk_` — server only, never in the app

### 2 · Wire RevenueCat up — 20 min

- **In-app purchase key.** App Store Connect → Users and Access → Integrations
  → In-App Purchase → generate, and give the `.p8` to RevenueCat.
- **Products:** import `gonogo_premium_monthly` and `gonogo_premium_annual`.
- **Entitlement:** identifier exactly **`premium`**, both products attached.
  The app and the API both look for that exact string.
- **Offering:** one offering with a Monthly and an Annual package, marked
  **Current**. If nothing is Current the paywall will say no plans came back.
- **Webhook:** `https://api.gonogoboatapp.com/webhooks/revenuecat`, with an
  Authorization header set to a long random string you invent. Keep it.

### 3 · Secrets — 5 min

```bash
cd gonogo-api && npx wrangler secret put REVENUECAT_SECRET_API_KEY
```

```bash
cd gonogo-api && npx wrangler secret put REVENUECAT_WEBHOOK_SECRET
```

(the second is the random string from the webhook — neither needs a deploy)

Then on GitHub → Settings → Secrets and variables → Actions, add
**`REVENUECAT_IOS_KEY`** = the `appl_…` key.

And create `.env.local` in the repo root (gitignored) with both public keys —
the format is in `docs/BILLING_SETUP.md`.

### 4 · Deploy the API — 2 min

I changed `TERMS_VERSION` and `CREATOR_TERMS_VERSION` to `2026-11-05` to match
the rewritten terms, and corrected some now-wrong comments. It needs your
deploy to take effect:

```bash
cd gonogo-api && npx wrangler deploy
```

The website also needs redeploying for the new terms pages:

```bash
cd website && npx wrangler pages deploy pub --project-name=gonogo-website --commit-dirty=true
```

### 5 · Build and submit iOS — then you are live

GitHub → Actions → **iOS TestFlight** → Run workflow. Version defaults to 1.5.
It will fail fast if step 3 was missed, which is deliberate.

I renamed the App Store version record from 1.4 to **1.5** so the new build
attaches to it. It was never submitted, so nothing was lost by renaming it —
and Apple would not have let you create a second record while an unreleased one
was sitting there. Build 6 (the old 1.4) is still shown under Build on that
page; swap it for the new one when it appears.

When the build lands in TestFlight:

- Install it, open the paywall, **screenshot it**. Apple requires a review
  screenshot on each subscription before it can be submitted — upload the same
  one to both products.
- On the 1.5 version page, add both subscriptions under **In-App Purchases**,
  then submit. A paywall with no submitted products is a guaranteed rejection.

### 6 · Two Apple money items — don't skip these

- **Model Reporting Rules for Digital Platforms** says *Missing Info* on the
  Business page. It is the OECD/DAC7 seller report, and left unfilled it can
  hold your payouts. Click **Add Info**.
- **App Store Small Business Program.** Not enrolled. Apple takes **30%**
  instead of 15%, and the commission maths in the API assumes 15%, so every iOS
  referral would overpay the referrer by about 21%. Enrolling is free and you
  qualify comfortably. One catch: **approval starts on the 1st of the following
  month**, so enrolling today fixes December, not November. November's iOS
  volume will be tiny, so the cleanest answer is enrol now and treat the gap as
  noise — but if you would rather be exact, the per-store fee change is about
  an hour's work plus a deploy and I can do it next session.

### 7 · Play housekeeping, whenever

- **Declare your trader status** (deadline 1 Feb 2027, banner at the top of
  every Play page).
- Developer name is still **tezz777able**. Change it before marketing.
- **Rotate** the two Cloudflare API tokens, the Neon password and the mail
  password in `gonogo-website-deploy.txt`. They are gitignored now, but they
  were exposed.

---

## What I deliberately did not do

- **The in-app "Report an issue" feature.** You asked for it in v1.5. Adding an
  untested feature with a new API endpoint the night before a launch is how
  launches break. It is a clean first job after you are selling.
- **Clicked Request reset on the upload key, or Add Info on the tax form.**
  Both are your identity and your signing keys, not mine to commit you to.
- **The per-store platform fee.** Reasoning in step 6.
