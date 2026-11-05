// GO / NO-GO — the purchase layer.
//
// Premium is sold in TWO places, and both are app stores:
//
//   iOS       StoreKit,            through RevenueCat
//   Android   Google Play Billing, through RevenueCat
//
// Stripe does NOT sell Premium. Our Stripe account exists to pay commission
// OUT to referrers and creators, and that is all it is for. The API still has
// a /subscriptions/checkout endpoint and STRIPE_PRICE_* vars from an earlier
// plan; they are deliberately unset and unused. Nothing in the app should call
// them. If you are about to "finish" the Stripe checkout path, don't — it is
// not an oversight, it is the business decision.
//
// So the web build of the app cannot take a payment at all, by design. It
// points people at the stores instead. That is also the only policy-safe
// answer: Apple (App Store Review Guideline 3.1.1) and Google (Play Payments
// policy) both require digital goods sold inside an app to go through their
// own billing, and both forbid steering a user towards an outside payment
// page. Pointing the NATIVE app at any web checkout gets it pulled.
//
// NOTHING IN THIS FILE GRANTS PREMIUM. It cannot: a device is not trustworthy
// about what it has bought. The client's whole job is to complete the purchase
// and then ask the server to go and re-check it. The server calls RevenueCat
// itself (syncPlayEntitlement in gonogo-api/src/index.ts), and RevenueCat has
// already validated the receipt with Apple or Google. The user we get back
// from that is the only thing that turns Premium on.

import { Capacitor } from "@capacitor/core";
import { api, getSession, updateSessionUser } from "../account/session.js";

/** RevenueCat entitlement identifier. Mirrors PLAY_ENTITLEMENT in gonogo-api. Change both together. */
export const PREMIUM_ENTITLEMENT = "premium";

// RevenueCat *public* SDK keys. These are designed to live in a shipped app
// binary and are not secrets — but they are still per-project, so they come
// from the build environment rather than being committed, which also means a
// build that forgets them degrades to "get it from the store" instead of
// crashing. Set them in .env.local for a local build, and as repository
// secrets for CI (see docs/BILLING_SETUP.md).
const PUBLIC_KEYS = {
  ios: import.meta.env.VITE_REVENUECAT_IOS_KEY || "",
  android: import.meta.env.VITE_REVENUECAT_ANDROID_KEY || "",
};

/** Where someone on the web goes to get a version that can subscribe. */
export const STORE_LINKS = {
  android: "https://play.google.com/store/apps/details?id=com.gonogo.marine",
  // Filled in once the App Store listing goes live; until then the web build
  // offers Google Play only, rather than a link that 404s.
  ios: "",
};

export const platform = () => Capacitor.getPlatform();         // "ios" | "android" | "web"
export const isNative = () => Capacitor.isNativePlatform();

/** What to call the thing that will charge them, in user-facing copy. */
export function storeName() {
  const p = platform();
  return p === "ios" ? "the App Store" : p === "android" ? "Google Play" : "the app stores";
}

/** Where a subscriber cancels or changes plan. Apple and Google both require this to be reachable. */
export function manageUrl() {
  const p = platform();
  if (p === "ios") return "https://apps.apple.com/account/subscriptions";
  if (p === "android") return "https://play.google.com/store/account/subscriptions";
  return null;
}

/**
 * Which purchase route this build can offer.
 *   "native"      — a store is available and we have its key
 *   "web"         — running in a browser: no payment here, go to a store
 *   "unavailable" — a phone build with no RevenueCat key compiled in
 */
export function billingChannel() {
  if (!isNative()) return "web";
  return PUBLIC_KEYS[platform()] ? "native" : "unavailable";
}

/* ---------- the RevenueCat plugin ----------
 * Loaded on demand. A paywall is the only screen that needs it, and the import
 * is dynamic so that a plugin that is missing or fails to initialise can never
 * stop the rest of the app from starting. This is a boating safety tool before
 * it is a shop: if billing is broken, the forecast still has to come up. */
let pluginPromise = null;
const loadPlugin = () => (pluginPromise ||= import("@revenuecat/purchases-capacitor"));

let configuredFor = null;         // the app user id the SDK is currently configured with

/**
 * Point the SDK at this signed-in user, once.
 *
 * The app user id is OUR users.id, which is what lets the server look a
 * purchase up by the same id (see the webhook's user lookup in gonogo-api).
 * Getting this wrong means a payment that never reaches an account, so it is
 * taken from the session rather than passed in.
 */
async function ensureConfigured() {
  if (billingChannel() !== "native") throw new Error("Purchases are not available in this build.");
  const userId = getSession()?.user?.id;
  if (!userId) throw new Error("Please sign in before subscribing.");

  const { Purchases, LOG_LEVEL } = await loadPlugin();
  if (configuredFor === userId) return Purchases;

  if (configuredFor === null) {
    if (import.meta.env.DEV) await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
    await Purchases.configure({ apiKey: PUBLIC_KEYS[platform()], appUserID: userId });
  } else {
    // A different account signed in on the same phone. logIn moves the SDK to
    // their id; without it the second user would be handed the first user's
    // entitlements.
    await Purchases.logIn({ appUserID: userId });
  }
  configuredFor = userId;
  return Purchases;
}

/** Called on sign-out so the next person on this phone starts clean. */
export async function resetBilling() {
  if (configuredFor === null) return;
  try {
    const { Purchases } = await loadPlugin();
    await Purchases.logOut();
  } catch { /* nothing useful to do; the next ensureConfigured() re-logs in anyway */ }
  configuredFor = null;
}

/* ---------- offerings ---------- */

/**
 * The plans to show, with prices as the STORE reports them.
 *
 * Never hardcode "$2.99" on a paywall: the store charges in the user's own
 * currency, with their tax, and Apple will reject a paywall whose price does
 * not match what StoreKit says. priceString is already localised.
 */
export async function getPlans() {
  const Purchases = await ensureConfigured();
  const { current } = await Purchases.getOfferings();
  const packages = current?.availablePackages || [];
  if (!packages.length) {
    throw new Error("No subscription plans came back from the store. Please try again shortly.");
  }
  return packages
    .map((p) => ({
      id: p.identifier,
      plan: planOf(p),
      price: p.product?.priceString || "",
      intro: p.product?.introPrice || null,
      pkg: p,
    }))
    .sort((a, b) => (a.plan === "annual" ? -1 : b.plan === "annual" ? 1 : 0));   // annual first: better value
}

/** monthly | annual, from the package RevenueCat gave us. */
function planOf(p) {
  const type = String(p.packageType || "").toUpperCase();
  if (type === "ANNUAL") return "annual";
  if (type === "MONTHLY") return "monthly";
  // Custom packages report CUSTOM, so fall back to the identifiers. Same
  // reasoning as planFromPlayProduct() on the server: guessing wrong here
  // mislabels the plan on a real payment.
  const id = `${p.identifier} ${p.product?.identifier || ""}`.toLowerCase();
  return /annual|yearly|year|annum/.test(id) ? "annual" : "monthly";
}

/* ---------- buying ---------- */

/**
 * Buy a plan.
 *
 * Resolves to { cancelled: true } if the user backed out — that is a normal
 * outcome, not an error, and must not be shown to them as a failure.
 */
export async function purchase(plan) {
  const Purchases = await ensureConfigured();
  try {
    await Purchases.purchasePackage({ aPackage: plan.pkg });
  } catch (e) {
    if (wasCancelled(e)) return { cancelled: true };
    throw new Error(friendlyError(e));
  }
  // Paid. From here on the money is taken, so a failure to confirm must read
  // as "we're checking", never as "that didn't work".
  return { user: await syncWithServer() };
}

/**
 * Re-apply a subscription this person already pays for.
 *
 * Required by App Store Review Guideline 3.1.1 — a subscriber on a new phone,
 * or after a reinstall, must be able to get their Premium back without paying
 * twice. Rejections for a missing restore button are common.
 */
export async function restore() {
  const Purchases = await ensureConfigured();
  const { customerInfo } = await Purchases.restorePurchases();
  const ent = customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
  if (!ent) return { found: false };
  return { found: true, user: await syncWithServer() };
}

/**
 * Hand over to the server, which is the only thing that can grant Premium.
 * Returns the fresh user, and writes it into the session so every screen in
 * the app updates at once.
 */
async function syncWithServer() {
  const r = await api("/subscriptions/native/sync", { method: "POST" });
  if (r?.user) updateSessionUser(r.user);
  return r?.user || null;
}

/* ---------- errors ---------- */

/** Did they simply back out of the store sheet? */
function wasCancelled(e) {
  if (!e) return false;
  if (e.userCancelled === true) return true;
  const code = String(e.code ?? "");
  // RevenueCat's PURCHASE_CANCELLED_ERROR is 1; the Capacitor bridge has
  // reported it as both the number and the readable name across versions, so
  // match either rather than pinning to one shape.
  return code === "1" || /PURCHASE_CANCELLED/i.test(`${e.code} ${e.readableErrorCode || ""}`);
}

/** Something a boat owner can act on, instead of a store error code. */
function friendlyError(e) {
  const code = String(e?.code ?? "");
  const readable = `${code} ${e?.readableErrorCode || ""}`;
  if (/PRODUCT_ALREADY_PURCHASED/i.test(readable) || code === "9") {
    return "You already have this subscription. Tap “I already subscribed” to restore it.";
  }
  if (/PAYMENT_PENDING/i.test(readable) || code === "20") {
    return "Your payment is still being processed. Premium will switch on by itself once it clears.";
  }
  if (/PURCHASE_NOT_ALLOWED/i.test(readable) || code === "3") {
    return "This device is not allowed to make purchases. Check your device's content and purchase restrictions.";
  }
  if (/NETWORK/i.test(readable) || code === "10") {
    return "Couldn't reach the store. Check your connection and try again.";
  }
  return e?.message || "The purchase could not be completed. Nothing has been charged.";
}
