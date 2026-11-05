// The paywall: the one place in the app where money changes hands.
//
// Premium is sold through the App Store and Google Play only. Stripe is for
// paying commission out, not for taking subscriptions in — see the note at the
// top of src/lib/billing.js. So in a browser this screen sells nothing and
// points at the stores instead.
//
// Apple reviews this screen closely. App Store Review Guideline 3.1.2 and
// Schedule 2 of the Developer Agreement require a subscription paywall to
// show, before purchase: the subscription's NAME, its LENGTH, the PRICE for
// that length, that it RENEWS until cancelled, and working links to the Terms
// of Use and the Privacy Policy. Google asks for substantially the same. Every
// one of those is below on purpose — removing any of them is a rejection, and
// a missing restore button is a rejection too (3.1.1).
//
// The prices are never hardcoded: they come from StoreKit or Play Billing via
// RevenueCat, already converted and taxed for wherever the user is.
import { useCallback, useEffect, useState } from "react";
import { SITE } from "./session.js";
import { useAccount } from "./AccountGate.jsx";
import { Btn, C, Msg, TextLink } from "./ui.jsx";
import {
  STORE_LINKS, billingChannel, getPlans, manageUrl, purchase, restore, storeName,
} from "../lib/billing.js";

export function Upgrade() {
  const a = useAccount();
  const channel = billingChannel();
  const [plans, setPlans] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState("");          // which plan id is mid-purchase
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // Pull the real store prices as soon as the paywall is on screen.
  useEffect(() => {
    if (channel !== "native") return undefined;
    let live = true;
    getPlans()
      .then((p) => { if (live) setPlans(p); })
      .catch((e) => { if (live) setLoadErr(e.message); });
    return () => { live = false; };
  }, [channel]);

  const buy = useCallback(async (plan) => {
    setErr(""); setOk(""); setBusy(plan.id);
    try {
      const r = await purchase(plan);
      if (r.cancelled) return;                   // backing out is not a failure
      setOk("You're Premium. Thank you — enjoy the full 10-day planner and the home call.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }, []);

  const doRestore = useCallback(async () => {
    setErr(""); setOk(""); setBusy("restore");
    try {
      const r = await restore();
      setOk(r.found
        ? "Found it — your Premium is back on this phone."
        : `No GO / NO-GO subscription was found on this ${storeName()} account.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }, []);

  /* ---------- already paying ---------- */
  if (a.user?.isPremium) {
    const url = manageUrl();
    return (
      <div style={{ fontSize: 13, lineHeight: 1.55, color: C.slate, marginTop: 10 }}>
        <div style={{ color: C.green, fontWeight: 600 }}>Premium is active. Thank you.</div>
        {/* On a phone we can deep-link straight to the right subscriptions page.
            In a browser we can't know which store they bought from, and a wrong
            guess sends them somewhere with nothing in it — so say it plainly. */}
        {url
          ? <TextLink href={url}>Manage or cancel your subscription</TextLink>
          : <div style={{ marginTop: 6 }}>Manage or cancel your subscription in the App Store or Google Play, on the phone you subscribed with.</div>}
      </div>
    );
  }

  // Founding members (v1.2 / v1.3 users) keep the Premium FEATURES for free as
  // a thank-you, so they must not be nagged as if they were locked out. They
  // still see the plans, because a free grant earns no referral commission and
  // some of them will want that — but the framing is "if you want to", not
  // "you're missing out".
  const note = a.grandfathered
    ? "You're a founding member: the Premium features are yours free, for good. Subscribing is optional — it's only needed if you want to earn commission on referrals."
    : a.onTrial
      ? `Your free trial has ${a.trialDaysLeft} day${a.trialDaysLeft === 1 ? "" : "s"} left. Subscribe now and Premium carries straight on.`
      : null;
  const noteTone = a.grandfathered ? C.green : C.amber;

  /* ---------- in a browser: nothing to sell here ---------- */
  if (channel === "web") {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.foam, marginBottom: 4 }}>GO / NO-GO Premium</div>
        {note && <div style={{ fontSize: 13, lineHeight: 1.5, color: noteTone, marginBottom: 8 }}>{note}</div>}
        <div style={{ fontSize: 13, lineHeight: 1.55, color: C.slate }}>
          Premium is sold through the app stores. Install GO / NO-GO on your phone, sign in with this
          same email, and you can subscribe there — it's the same account, so everything you've set up
          comes with you.
        </div>
        {STORE_LINKS.android && <Btn kind="secondary" onClick={() => window.open(STORE_LINKS.android, "_blank", "noopener,noreferrer")}>Get it on Google Play</Btn>}
        {STORE_LINKS.ios && <Btn kind="secondary" onClick={() => window.open(STORE_LINKS.ios, "_blank", "noopener,noreferrer")}>Download on the App Store</Btn>}
      </div>
    );
  }

  /* ---------- a phone build with no store key ---------- */
  if (channel === "unavailable") {
    return (
      <div style={{ fontSize: 13, lineHeight: 1.55, color: C.slate, marginTop: 10 }}>
        Subscriptions aren't available in this build of the app. Please update GO / NO-GO from
        {" "}{storeName()} and try again.
      </div>
    );
  }

  /* ---------- the store route (iOS / Android) ---------- */
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.foam, marginBottom: 2 }}>GO / NO-GO Premium</div>
      {note && <div style={{ fontSize: 13, lineHeight: 1.5, color: noteTone, margin: "4px 0 8px" }}>{note}</div>}

      {loadErr && <Msg>{loadErr}</Msg>}
      {!plans && !loadErr && (
        <div style={{ fontSize: 13, color: C.slate, padding: "8px 0" }}>{`Loading plans from ${storeName()}…`}</div>
      )}

      {plans?.map((p) => (
        <Btn key={p.id} onClick={() => buy(p)} disabled={!!busy}
          kind={p.plan === "annual" ? "primary" : "secondary"}>
          {busy === p.id
            ? "Opening…"
            : `${p.plan === "annual" ? "Yearly" : "Monthly"} — ${p.price} / ${p.plan === "annual" ? "year" : "month"}`}
        </Btn>
      ))}

      {plans && (
        <div style={{ fontSize: 12, lineHeight: 1.5, color: C.slate, marginTop: 10 }}>
          {/* The auto-renewal disclosure. Apple and Google both require it. */}
          Each plan renews automatically at the price shown above, for the same period, until you
          cancel it. Cancel any time in {storeName()}; you keep Premium until the end of the period
          you've paid for. Payment is taken by {storeName()}.
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        <TextLink onClick={doRestore} style={{ fontSize: 13 }}>
          {busy === "restore" ? "Checking…" : "I already subscribed — restore it"}
        </TextLink>
      </div>

      <Msg>{err}</Msg>
      <Msg kind="ok">{ok}</Msg>

      {/* Required: functional links to both documents, on the paywall itself. */}
      <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
        <TextLink href={`${SITE}/terms`} style={{ fontSize: 12.5 }}>Terms of Use</TextLink>
        <TextLink href={`${SITE}/privacy.html`} style={{ fontSize: 12.5 }}>Privacy Policy</TextLink>
      </div>
    </div>
  );
}

export default Upgrade;
