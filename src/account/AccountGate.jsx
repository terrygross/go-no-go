// Registration wall around the whole app.
//
// Nobody uses the app until they have an account, a VERIFIED email and the CURRENT terms
// accepted. That includes free users and legacy ("founding") users from v1.2 / v1.3.
//
// OFFLINE SAFETY: a saved session is trusted immediately (children render from the cached user,
// no waiting for the network) and refreshed in the background. Only a genuine server 401 sends
// anyone back to sign-in; a network failure never signs anybody out.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  SITE, api, clearAllLocalData, clearSession, clearStoredReferral, detectLegacy, getSession,
  isLegacyMember, onSessionChange, saveSession, storedReferral, updateSessionUser,
} from "./session.js";
import { Btn, C, Check, Field, Logo, Msg, Notice, PasswordField, Shell, TextLink, Title } from "./ui.jsx";

// Runs once when this module loads, i.e. BEFORE the app mounts and writes its own defaults.
detectLegacy();

const FREE = { planDays: 1, maxMarinas: 1, homeCall: false, earnsCommission: false };
const DEFAULT_CTX = {
  user: null, entitlements: FREE, hasPremiumAccess: false, onTrial: false, trialDaysLeft: 0,
  grandfathered: false, referralCode: "", firstName: "",
  signOut() {}, async refresh() {}, async deleteAccount() {}, openSite() {},
};
const AccountContext = createContext(DEFAULT_CTX);
export const useAccount = () => useContext(AccountContext);

const PENDING_KEY = "gonogo_pending_email";
const readPending = () => { try { return sessionStorage.getItem(PENDING_KEY) || ""; } catch { return ""; } };
const writePending = (v) => { try { v ? sessionStorage.setItem(PENDING_KEY, v) : sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ } };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GUIDANCE = "GO / NO-GO gives conditions guidance only. The final call is always the skipper's.";

function openSite(path) {
  try { window.open(SITE + path, "_blank", "noopener,noreferrer"); } catch { /* ignore */ }
}

export default function AccountGate({ children }) {
  const [session, setSession] = useState(() => getSession());
  const [mode, setMode] = useState(null);                 // only used when there is no session
  const [pending, setPendingState] = useState(readPending);
  const [prefillEmail, setPrefillEmail] = useState("");
  const [notice, setNotice] = useState("");               // one-shot message for the next screen
  const setPending = (v) => { writePending(v); setPendingState(v); };

  // Follow session changes. If a session we had disappears (the server said 401, or the account was
  // removed), take the person to sign-in rather than the first-time welcome screen.
  const hadSession = useRef(!!getSession());
  useEffect(() => onSessionChange((s) => {
    if (!s && hadSession.current) { setMode("signin"); setNotice("Please sign in again."); }
    hadSession.current = !!s;
    setSession(s);
  }), []);

  const hasSession = !!session;
  const refresh = useCallback(async () => {
    if (!getSession()) return;
    try { const r = await api("/auth/me"); if (r && r.user) updateSessionUser(r.user); }
    catch { /* api() already cleared the session on a real 401; network errors change nothing */ }
  }, []);

  // Refresh in the background: on start, when a session appears, when the phone comes back online,
  // and when the app returns to the foreground (at most once a minute).
  const lastRefresh = useRef(0);
  useEffect(() => {
    if (!hasSession) return undefined;
    const go = () => { lastRefresh.current = Date.now(); refresh(); };
    go();
    const onVisible = () => { if (document.visibilityState === "visible" && Date.now() - lastRefresh.current > 60000) go(); };
    window.addEventListener("online", go);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("online", go); document.removeEventListener("visibilitychange", onVisible); };
  }, [hasSession, refresh]);

  const signOut = useCallback(() => { clearSession(); setPending(""); setMode("signin"); setNotice(""); }, []);
  const deleteAccount = useCallback(async (password) => {
    const u = getSession()?.user;
    if (!u) throw new Error("You are not signed in.");
    await api("/auth/delete-account", { method: "POST", auth: false, body: { email: u.email, password } });
    clearAllLocalData();
    setPending(""); setMode("welcome"); setNotice("Your account has been deleted.");
  }, []);

  const user = session?.user || null;
  const ctx = useMemo(() => ({
    user,
    entitlements: user?.entitlements || FREE,
    hasPremiumAccess: !!user?.hasPremiumAccess,
    onTrial: !!user?.onTrial,
    trialDaysLeft: user?.trialDaysLeft || 0,
    grandfathered: !!user?.grandfathered,
    referralCode: user?.referralCode || "",
    firstName: user?.firstName || "",
    signOut, refresh, deleteAccount, openSite,
  }), [user, signOut, refresh, deleteAccount]);

  // ---- which screen? ----
  let screen;
  if (session) screen = !user.emailVerified ? "verify" : user.termsCurrent === false ? "terms" : "ready";
  else screen = mode || (isLegacyMember() ? "signup" : "welcome");

  let body = null;
  if (screen === "ready") return <AccountContext.Provider value={ctx}>{children}</AccountContext.Provider>;
  if (screen === "welcome") body = <Welcome notice={notice} onSignup={() => { setNotice(""); setMode("signup"); }} onSignin={() => { setNotice(""); setMode("signin"); }} />;
  if (screen === "signup") body = <SignUp onSignin={() => setMode("signin")} onCreated={(email, r) => { setPending(email); clearStoredReferral(); saveSession(r); }} />;
  if (screen === "signin") body = (
    <SignIn prefill={prefillEmail} notice={notice} onSignup={() => setMode("signup")} onForgot={() => setMode("forgot")}
      onSignedIn={(r) => { setPending(""); saveSession(r); }}
      onNeedsVerification={(email) => { setPending(email); setMode("verify"); }} />
  );
  if (screen === "forgot") body = <Forgot onBack={() => setMode("signin")} onDone={(email) => { setPrefillEmail(email); setNotice("Password changed. Sign in with your new password."); setMode("signin"); }} />;
  if (screen === "verify") body = (
    <Verify email={user?.email || pending} signedUp={hasSession}
      onVerified={(r) => { setPending(""); saveSession(r); }}
      onBack={() => { clearSession(); setPending(""); setMode("signup"); }} />
  );
  if (screen === "terms") body = (
    <Terms onSignOut={signOut} onAccepted={async () => {
      await refresh();
      // The server accepted it. If the refresh could not reach the server, don't leave the user stuck on this screen.
      const s = getSession();
      if (s && s.user.termsCurrent === false) updateSessionUser({ ...s.user, termsCurrent: true });
    }} />
  );

  return (
    <AccountContext.Provider value={ctx}>
      <Shell><Logo />{body}</Shell>
    </AccountContext.Provider>
  );
}

/* ---------------------------------------------------------------- screens */

function Welcome({ onSignup, onSignin, notice }) {
  return (
    <>
      <Title sub="Create your free account to use GO / NO-GO. It takes a minute, and you start with a 14-day Premium trial.">Welcome aboard</Title>
      {notice && <Notice>{notice}</Notice>}
      <Btn onClick={onSignup}>Create free account</Btn>
      <Btn kind="secondary" onClick={onSignin}>I already have an account</Btn>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.slate, marginTop: 22 }}>{GUIDANCE}</div>
    </>
  );
}

function SignUp({ onSignin, onCreated }) {
  const legacy = isLegacyMember();
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", password: "", referralCode: storedReferral(), terms: false, marketing: false });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault(); setErr("");
    const email = f.email.trim();
    if (!f.firstName.trim() || !f.lastName.trim()) return setErr("Please add your first and last name.");
    if (!EMAIL_RE.test(email)) return setErr("Please enter a valid email address.");
    if (f.password.length < 8) return setErr("Your password needs at least 8 characters.");
    if (!f.terms) return setErr("Please accept the Terms of Use and Privacy Policy to continue.");
    setBusy(true);
    try {
      const body = {
        firstName: f.firstName.trim(), lastName: f.lastName.trim(), email, password: f.password,
        marketingConsent: f.marketing, acceptedTerms: true,
      };
      if (f.referralCode.trim()) body.referralCode = f.referralCode.trim();
      if (legacy) body.legacyUser = true;
      const r = await api("/auth/signup", { method: "POST", auth: false, body });
      onCreated(email, r);
    } catch (ex) {
      setErr(ex.status === 409 ? "That email already has an account. Try signing in." : ex.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Title>Create your free account</Title>
      {legacy && <Notice>Welcome back! You were here before accounts existed. Create your free account to keep your Premium features free.</Notice>}
      <Field label="First name" value={f.firstName} onChange={set("firstName")} autoComplete="given-name" name="firstName" />
      <Field label="Last name" value={f.lastName} onChange={set("lastName")} autoComplete="family-name" name="lastName" />
      <Field label="Email" type="email" value={f.email} onChange={set("email")} autoComplete="email" inputMode="email" name="email" />
      <PasswordField label="Password (at least 8 characters)" value={f.password} onChange={set("password")} autoComplete="new-password" />
      <Field label="Referral code (optional)" value={f.referralCode} onChange={set("referralCode")} autoComplete="off" name="referralCode" maxLength={32} />
      <Check name="terms" checked={f.terms} onChange={set("terms")}>
        I have read and accept the{" "}
        <a href={`${SITE}/terms`} target="_blank" rel="noopener noreferrer" style={{ color: C.green }}>Terms of Use</a> and{" "}
        <a href={`${SITE}/privacy.html`} target="_blank" rel="noopener noreferrer" style={{ color: C.green }}>Privacy Policy</a>.
      </Check>
      <Check name="marketing" checked={f.marketing} onChange={set("marketing")}>Email me offers and news (optional)</Check>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.slate, margin: "2px 0 10px" }}>{GUIDANCE}</div>
      <Msg>{err}</Msg>
      <Btn type="submit" disabled={busy}>{busy ? "Creating your account…" : "Create account"}</Btn>
      <div style={{ textAlign: "center", marginTop: 8 }}><TextLink onClick={onSignin}>I already have an account</TextLink></div>
    </form>
  );
}

function SignIn({ prefill, notice, onSignup, onForgot, onSignedIn, onNeedsVerification }) {
  const [email, setEmail] = useState(prefill || "");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr("");
    const em = email.trim();
    if (!EMAIL_RE.test(em) || !password) return setErr("Please enter your email and password.");
    setBusy(true);
    try {
      const r = await api("/auth/signin", { method: "POST", auth: false, body: { email: em, password } });
      onSignedIn(r);
    } catch (ex) {
      if (ex.status === 403 && ex.data && ex.data.needsVerification) {
        api("/auth/resend-code", { method: "POST", auth: false, body: { email: em } }).catch(() => {});
        onNeedsVerification(em);
        return;
      }
      setErr(ex.message); setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Title>Sign in</Title>
      {notice && <Notice>{notice}</Notice>}
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" inputMode="email" name="email" />
      <PasswordField value={password} onChange={setPassword} />
      <Msg>{err}</Msg>
      <Btn type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Btn>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <TextLink onClick={onForgot}>Forgot password?</TextLink>
        <TextLink onClick={onSignup}>Create account</TextLink>
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.slate, marginTop: 18 }}>{GUIDANCE}</div>
    </form>
  );
}

function useCooldown(seconds) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, () => setLeft(seconds)];
}

function Verify({ email, signedUp, onVerified, onBack }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, restart] = useCooldown(60);          // the email was only just sent

  const submit = async (e) => {
    e.preventDefault(); setErr(""); setInfo("");
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) return setErr("Enter the 6-digit code from your email.");
    setBusy(true);
    try { onVerified(await api("/auth/verify-email", { method: "POST", auth: false, body: { email, code: digits } })); }
    catch (ex) { setErr(ex.message); setBusy(false); }
  };
  const resend = async () => {
    setErr(""); setInfo("");
    try {
      await api("/auth/resend-code", { method: "POST", auth: false, body: { email } });
      setInfo("If that email is waiting to be verified, a new code is on its way.");
    } catch (ex) { setErr(ex.message); }
    restart();
  };

  return (
    <form onSubmit={submit} noValidate>
      <Title sub={<>We emailed a 6-digit code to <b style={{ color: C.foam }}>{email}</b>. It works for 15 minutes. Check your spam folder if it doesn't arrive.</>}>Check your email</Title>
      <Field label="6-digit code" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" inputMode="numeric"
        maxLength={6} placeholder="123456" name="code" autoFocus style={{ fontSize: 28, letterSpacing: 8, textAlign: "center" }} />
      <Msg>{err}</Msg><Msg kind="ok">{info}</Msg>
      <Btn type="submit" disabled={busy}>{busy ? "Checking…" : "Verify my email"}</Btn>
      <Btn kind="secondary" onClick={resend} disabled={left > 0}>{left > 0 ? `Send a new code (${left}s)` : "Send a new code"}</Btn>
      <div style={{ textAlign: "center", marginTop: 8 }}><TextLink onClick={onBack}>{signedUp ? "Wrong email? Start again" : "Back"}</TextLink></div>
    </form>
  );
}

function Forgot({ onBack, onDone }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e) => {
    e && e.preventDefault(); setErr(""); setInfo("");
    const em = email.trim();
    if (!EMAIL_RE.test(em)) return setErr("Please enter a valid email address.");
    setBusy(true);
    try { await api("/auth/forgot-password", { method: "POST", auth: false, body: { email: em } }); setStep(2); setInfo("If that email has an account, we've sent a 6-digit code. It works for 15 minutes."); }
    catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  const reset = async (e) => {
    e.preventDefault(); setErr(""); setInfo("");
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) return setErr("Enter the 6-digit code from your email.");
    if (pw.length < 8) return setErr("Your new password needs at least 8 characters.");
    if (pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    try { await api("/auth/reset-password", { method: "POST", auth: false, body: { email: email.trim(), code: digits, password: pw } }); onDone(email.trim()); return; }
    catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  if (step === 1) return (
    <form onSubmit={send} noValidate>
      <Title sub="Enter your email and we'll send you a 6-digit code to set a new one.">Forgot your password?</Title>
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="username" inputMode="email" name="email" />
      <Msg>{err}</Msg>
      <Btn type="submit" disabled={busy}>{busy ? "Sending…" : "Send me a code"}</Btn>
      <div style={{ textAlign: "center", marginTop: 8 }}><TextLink onClick={onBack}>Back to sign in</TextLink></div>
    </form>
  );
  return (
    <form onSubmit={reset} noValidate>
      <Title>Set a new password</Title>
      <Msg kind="ok">{info}</Msg>
      <Field label="6-digit code" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} autoComplete="one-time-code" inputMode="numeric"
        maxLength={6} placeholder="123456" name="code" autoFocus style={{ fontSize: 28, letterSpacing: 8, textAlign: "center" }} />
      <PasswordField label="New password (at least 8 characters)" value={pw} onChange={setPw} autoComplete="new-password" />
      <PasswordField label="Type it again" value={pw2} onChange={setPw2} autoComplete="new-password" />
      <Msg>{err}</Msg>
      <Btn type="submit" disabled={busy}>{busy ? "Saving…" : "Set my new password"}</Btn>
      <Btn kind="secondary" onClick={() => send()} disabled={busy}>Send a new code</Btn>
      <div style={{ textAlign: "center", marginTop: 8 }}><TextLink onClick={onBack}>Back to sign in</TextLink></div>
    </form>
  );
}

function Terms({ onAccepted, onSignOut }) {
  const [v, setV] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoadErr("");
    api("/legal/versions", { auth: false }).then(setV).catch((e) => setLoadErr(e.status === 0 ? "You need an internet connection to accept the updated terms." : e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const accept = async (e) => {
    e.preventDefault(); setErr("");
    if (!ok) return setErr("Please tick the box to accept the terms.");
    if (!v) return setErr("The terms haven't loaded yet. Please try again.");
    setBusy(true);
    try { await api("/auth/accept-terms", { method: "POST", body: { version: v.terms } }); await onAccepted(); }
    catch (ex) { setErr(ex.message); setBusy(false); }
  };

  return (
    <form onSubmit={accept} noValidate>
      <Title sub="We've updated our terms. Please read them and accept to keep using GO / NO-GO.">Updated terms</Title>
      <div style={{ marginBottom: 14, fontSize: 14, lineHeight: 1.7 }}>
        <TextLink href={(v && v.termsUrl) || `${SITE}/terms`}>Read the Terms of Use</TextLink><br />
        <TextLink href={(v && v.privacyUrl) || `${SITE}/privacy.html`}>Read the Privacy Policy</TextLink>
      </div>
      <Check name="accept" checked={ok} onChange={setOk}>I have read and accept the Terms of Use and Privacy Policy.</Check>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C.slate, margin: "2px 0 10px" }}>{GUIDANCE}</div>
      <Msg>{loadErr}</Msg><Msg>{err}</Msg>
      {loadErr && <Btn kind="secondary" onClick={load}>Try again</Btn>}
      <Btn type="submit" disabled={busy || !v}>{busy ? "Saving…" : "Accept and continue"}</Btn>
      <div style={{ textAlign: "center", marginTop: 8 }}><TextLink onClick={onSignOut}>Sign out</TextLink></div>
    </form>
  );
}
