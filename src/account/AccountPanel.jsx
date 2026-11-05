// "My account" content, mounted inside the app (no frame of its own).
import { useState } from "react";
import { Share } from "@capacitor/share";
import { SITE } from "./session.js";
import { useAccount } from "./AccountGate.jsx";
import { Btn, C, Field, HEAD, Msg, PasswordField, TextLink } from "./ui.jsx";

const card = { background: C.ink2, border: `1px solid ${C.hair}`, borderRadius: 16, padding: "16px 16px", marginBottom: 14 };
const h3 = { ...HEAD, fontSize: 15, margin: "0 0 10px", letterSpacing: "0.01em" };

function planLine(u) {
  if (u.isPremium) return { text: "Premium", tone: C.green };
  if (u.grandfathered) return { text: "Founding member: Premium features kept free", tone: C.green };
  if (u.onTrial) return { text: `Premium trial: ${u.trialDaysLeft} day${u.trialDaysLeft === 1 ? "" : "s"} left`, tone: C.amber };
  return { text: "Free", tone: C.slate };
}

export function AccountPanel() {
  const a = useAccount();
  const u = a.user;
  const [copied, setCopied] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!u) return null;

  const plan = planLine({ isPremium: u.isPremium, grandfathered: a.grandfathered, onTrial: a.onTrial, trialDaysLeft: a.trialDaysLeft });
  const link = `${SITE}/?ref=${a.referralCode}`;

  const share = async () => {
    try { await Share.share({ title: "GO / NO-GO", text: "Check today's boating conditions with GO / NO-GO!", url: link, dialogTitle: "Share GO / NO-GO" }); }
    catch (e) {
      if (e && e.message === "Share canceled") return;
      try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* nothing more we can do */ }
    }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ } };

  const doDelete = async (e) => {
    e.preventDefault(); setErr("");
    if (!pw) return setErr("Enter your password to confirm.");
    setBusy(true);
    try { await a.deleteAccount(pw); }          // on success the gate takes over and this panel unmounts
    catch (ex) { setErr(ex.message); setBusy(false); }
  };

  const feat = (ok, text) => (
    <div style={{ display: "flex", gap: 8, fontSize: 13.5, lineHeight: 1.45, marginBottom: 5, color: ok ? C.foam : C.slate }}>
      <span style={{ color: ok ? C.green : C.slate, width: 14 }}>{ok ? "✓" : "–"}</span><span>{text}</span>
    </div>
  );

  return (
    <div style={{ fontFamily: "'IBM Plex Sans',sans-serif", color: C.foam }}>
      <div style={card}>
        <div style={{ ...HEAD, fontSize: 20 }}>{a.firstName ? `${a.firstName} ${u.lastName || ""}`.trim() : "My account"}</div>
        <div style={{ fontSize: 13.5, color: C.slate, marginTop: 2, wordBreak: "break-all" }}>{u.email}</div>
        <div style={{ marginTop: 12, display: "inline-block", fontSize: 13, fontWeight: 700, color: plan.tone, border: `1px solid ${C.hair}`, borderRadius: 100, padding: "5px 12px" }}>{plan.text}</div>
      </div>

      <div style={card}>
        <h3 style={h3}>What's included</h3>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: ".06em", margin: "0 0 6px" }}>Free</div>
        {feat(true, "Today's GO / THINK TWICE / NO-GO verdict")}
        {feat(true, "Day-of planner (today only)")}
        {feat(true, "1 launch site / marina")}
        {feat(false, "No home call, no commission")}
        <div style={{ fontSize: 12, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: ".06em", margin: "12px 0 6px" }}>Premium</div>
        {feat(true, "10-day planner")}
        {feat(true, "Unlimited launch sites / marinas")}
        {feat(true, "The home call: when to head back to the dock")}
        {feat(true, "Earn commission on referrals")}
        <div style={{ fontSize: 13, lineHeight: 1.5, color: C.slate, marginTop: 10 }}>
          Premium purchase is coming soon. Your account is ready for it, and we'll tell you when it opens.
          {a.hasPremiumAccess && !u.isPremium ? " Until then you have full Premium features." : ""}
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>Share and earn</h3>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: C.slate, marginBottom: 10 }}>
          {a.entitlements.earnsCommission
            ? "You earn commission on paying subscribers who join with your link."
            : "Commission is for paying Premium members and approved creators."}
        </div>
        <div style={{ background: C.ink, border: `1px solid ${C.hair}`, borderRadius: 12, padding: "10px 12px", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12.5, wordBreak: "break-all" }}>{link}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn onClick={share} style={{ marginTop: 0 }}>Share</Btn>
          <Btn kind="secondary" onClick={copy} style={{ marginTop: 0 }}>{copied ? "Copied ✓" : "Copy link"}</Btn>
        </div>
        <Btn kind="secondary" onClick={() => a.openSite("/dashboard")}>Creator dashboard &amp; payouts</Btn>
      </div>

      <div style={card}>
        <h3 style={h3}>Legal</h3>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <TextLink href={`${SITE}/terms`}>Terms of Use</TextLink>
          <TextLink href={`${SITE}/creator-terms`}>Creator &amp; Referral Terms</TextLink>
          <TextLink href={`${SITE}/privacy.html`}>Privacy Policy</TextLink>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.slate, marginTop: 8 }}>GO / NO-GO gives conditions guidance only. The final call is always the skipper's.</div>
      </div>

      <div style={card}>
        <h3 style={h3}>Your account</h3>
        {!confirmOut ? <Btn kind="secondary" onClick={() => setConfirmOut(true)} style={{ marginTop: 0 }}>Sign out</Btn> : (
          <div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 8 }}>Sign out of GO / NO-GO? Your boat settings stay on this phone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={a.signOut} style={{ marginTop: 0 }}>Sign out</Btn>
              <Btn kind="secondary" onClick={() => setConfirmOut(false)} style={{ marginTop: 0 }}>Cancel</Btn>
            </div>
          </div>
        )}
        {!del ? <Btn kind="secondary" onClick={() => setDel(true)} style={{ color: C.red, borderColor: C.redDeep }}>Delete my account</Btn> : (
          <form onSubmit={doDelete} noValidate style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>
              This permanently deletes your account, your referral link, and any payout details we hold. It cannot be undone. Enter your password to confirm.
            </div>
            <PasswordField value={pw} onChange={setPw} />
            <Msg>{err}</Msg>
            <Btn type="submit" kind="danger" disabled={busy}>{busy ? "Deleting…" : "Permanently delete my account"}</Btn>
            <Btn kind="secondary" onClick={() => { setDel(false); setPw(""); setErr(""); }}>Cancel</Btn>
          </form>
        )}
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.slate, marginTop: 12 }}>
          Can't sign in to delete? Email <a href="mailto:support@gonogoboatapp.com" style={{ color: C.green }}>support@gonogoboatapp.com</a> and we'll delete it for you.
        </div>
      </div>
    </div>
  );
}

export default AccountPanel;
