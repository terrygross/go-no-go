// Small shared UI bits for the account screens. Inline styles, same palette as GoNoGo.jsx.
import { useState } from "react";

export const C = {
  ink: "#081826", ink2: "#0D2436", foam: "#F2F7F7", slate: "#7C99AD",
  hair: "rgba(242,247,247,0.14)",
  green: "#1FB871", greenDeep: "#0E5A3C",
  amber: "#F2A21C", amberDeep: "#7A4E08",
  red: "#E5484D", redDeep: "#6E1A1E",
};

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');`;

export const HEAD = { fontFamily: "'Archivo',sans-serif", fontWeight: 800, fontStretch: "125%" };

/** The phone-shaped frame the whole app lives in (390px on desktop, full screen on phones). */
export function Shell({ children }) {
  return (
    <div className="acct-outer">
      <style>{FONTS + `
        html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#04101C}
        .acct-outer{min-height:100dvh;background:#04101C;display:flex;justify-content:center;align-items:flex-start;padding:24px 12px;font-family:'IBM Plex Sans',sans-serif;box-sizing:border-box}
        .acct-frame{width:390px;max-width:100%;border-radius:28px;overflow:hidden;border:1px solid rgba(242,247,247,0.14);box-shadow:0 24px 60px rgba(0,0,0,.5);height:min(780px,calc(100dvh - 48px));display:flex;flex-direction:column;background:${C.ink};color:${C.foam}}
        .acct-scroll{flex:1;overflow-y:auto;padding:28px 22px 32px;-webkit-overflow-scrolling:touch}
        .acct-scroll::-webkit-scrollbar{display:none}
        .acct-input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;color:${C.foam};background:${C.ink2};border:1px solid ${C.hair};border-radius:12px;padding:13px 14px;outline:none}
        .acct-input:focus{border-color:${C.green};box-shadow:0 0 0 2px rgba(31,184,113,.3)}
        .acct-btn:focus-visible,.acct-link:focus-visible{outline:2px solid ${C.foam};outline-offset:2px}
        @media(max-width:430px){.acct-outer{padding:0;align-items:stretch}.acct-frame{width:100%;border-radius:0;height:100dvh;max-height:100dvh;box-shadow:none;border:none}}
      `}</style>
      <div className="acct-frame">
        <div style={{ height: 28, flexShrink: 0 }} />
        <div className="acct-scroll">{children}</div>
      </div>
    </div>
  );
}

export function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
      <div style={{ ...HEAD, fontSize: 22, letterSpacing: "0.02em" }}>GO <span style={{ color: C.green }}>/</span> NO-GO</div>
    </div>
  );
}

export function Title({ children, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ ...HEAD, fontSize: 26, lineHeight: 1.1 }}>{children}</div>
      {sub && <div style={{ fontSize: 14, lineHeight: 1.5, color: C.slate, marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

export function Field({ label, type = "text", value, onChange, autoComplete, inputMode, maxLength, placeholder, name, style, autoFocus, right }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.slate, marginBottom: 6 }}>{label}</span>
      <span style={{ position: "relative", display: "block" }}>
        <input className="acct-input" type={type} value={value} name={name} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength} placeholder={placeholder} autoFocus={autoFocus}
          autoCapitalize={type === "email" ? "none" : undefined} autoCorrect="off" spellCheck={false}
          style={{ ...(right ? { paddingRight: 64 } : null), ...style }} />
        {right}
      </span>
    </label>
  );
}

export function PasswordField({ label = "Password", value, onChange, autoComplete = "current-password" }) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} type={show ? "text" : "password"} value={value} onChange={onChange} autoComplete={autoComplete} name="password"
      right={<button type="button" className="acct-btn" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: 8, top: 6, bottom: 6, background: "transparent", border: "none", color: C.slate, fontWeight: 600, fontSize: 13, cursor: "pointer", padding: "0 10px" }}>
        {show ? "Hide" : "Show"}</button>} />
  );
}

export function Btn({ children, onClick, type = "button", disabled, kind = "primary", style }) {
  const base = { width: "100%", minHeight: 50, borderRadius: 100, fontFamily: "inherit", fontSize: 16, fontWeight: 700, cursor: disabled ? "default" : "pointer", marginTop: 6, opacity: disabled ? 0.55 : 1 };
  const kinds = {
    primary: { background: C.green, color: "#04210f", border: "none" },
    secondary: { background: "transparent", color: C.foam, border: `1px solid ${C.hair}` },
    danger: { background: C.red, color: "#fff", border: "none" },
  };
  return <button type={type} className="acct-btn" onClick={onClick} disabled={disabled} style={{ ...base, ...kinds[kind], ...style }}>{children}</button>;
}

export function TextLink({ children, onClick, href, style }) {
  const s = { background: "none", border: "none", color: C.green, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 0", textDecoration: "none", ...style };
  if (href) return <a className="acct-link" href={href} target="_blank" rel="noopener noreferrer" style={s}>{children}</a>;
  return <button type="button" className="acct-link" onClick={onClick} style={s}>{children}</button>;
}

export function Msg({ kind = "err", children }) {
  if (!children) return <div style={{ minHeight: 0 }} />;
  const col = kind === "ok" ? C.green : kind === "info" ? C.slate : C.red;
  return <div role={kind === "err" ? "alert" : "status"} style={{ fontSize: 13.5, lineHeight: 1.45, color: col, margin: "8px 0 4px" }}>{children}</div>;
}

export function Check({ checked, onChange, children, name }) {
  return (
    <label style={{ display: "flex", gap: 12, alignItems: "flex-start", margin: "6px 0 12px", fontSize: 13.5, lineHeight: 1.45, color: C.foam, cursor: "pointer" }}>
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.target.checked)}
        style={{ width: 22, height: 22, marginTop: 1, accentColor: C.green, flexShrink: 0 }} />
      <span>{children}</span>
    </label>
  );
}

export function Notice({ tone = "green", children }) {
  const bg = tone === "amber" ? C.amberDeep : C.greenDeep;
  return <div style={{ background: bg, border: `1px solid ${C.hair}`, borderRadius: 12, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.45, marginBottom: 16 }}>{children}</div>;
}
