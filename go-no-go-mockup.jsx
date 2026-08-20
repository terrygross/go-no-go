import { useState, useMemo, useEffect } from "react";

// ---------------------------------------------------------------
// GO / NO-GO — boating verdict mock-up (Paphos coast, simulated data)
// Design: verdict-as-signal-flag. The screen IS the answer.
// Signature: the horizon wave divider — its amplitude & chop are
// driven by the actual forecast wave height / period.
// Type: Archivo Black (verdict) / IBM Plex Sans (body) / Plex Mono (data)
// ---------------------------------------------------------------

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
`;

const C = {
  ink: "#081826",
  ink2: "#0D2436",
  foam: "#F2F7F7",
  slate: "#7C99AD",
  hair: "rgba(242,247,247,0.14)",
  green: "#1FB871",
  greenDeep: "#0E5A3C",
  amber: "#F2A21C",
  amberDeep: "#7A4E08",
  red: "#E5484D",
  redDeep: "#6E1A1E",
};

// --- Simulated Open-Meteo-style hourly forecast: Paphos, Aug morning ---
// Classic pattern: calm dawn, afternoon westerly sea breeze builds, eases at dusk.
const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const FORECAST = {
  wind:   [5, 6, 6, 7, 8, 10, 12, 13, 15, 17, 18, 16, 13, 10, 8],   // knots
  gust:   [7, 8, 9, 10, 11, 14, 16, 18, 21, 24, 25, 22, 18, 14, 11],
  wave:   [0.2, 0.2, 0.2, 0.3, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.8, 0.7, 0.6, 0.4, 0.3], // metres
  period: [7, 7, 7, 6, 6, 5, 5, 4, 4, 4, 4, 4, 5, 6, 6],            // seconds
  vis:    [10, 10, 10, 10, 10, 10, 10, 10, 9, 9, 9, 10, 10, 10, 10], // km
};
const SUNRISE = "06:04";
const SUNSET = "19:52";
const NOW_HOUR = 8; // pretend it's 08:00

// --- 10-day outlook (simulated). am/pm = raw condition band before boat
// adjustments; conf = model agreement (drops with lead time & disagreement).
const DAYS = [
  { d: "Sun 2",  am: 0, pm: 1, wMax: 18, hMax: 0.8, conf: 3 },
  { d: "Mon 3",  am: 0, pm: 1, wMax: 16, hMax: 0.7, conf: 3 },
  { d: "Tue 4",  am: 0, pm: 0, wMax: 11, hMax: 0.4, conf: 3 },
  { d: "Wed 5",  am: 0, pm: 0, wMax: 10, hMax: 0.4, conf: 3 },
  { d: "Thu 6",  am: 1, pm: 2, wMax: 22, hMax: 1.2, conf: 2 },
  { d: "Fri 7",  am: 2, pm: 2, wMax: 26, hMax: 1.5, conf: 2 },
  { d: "Sat 8",  am: 1, pm: 1, wMax: 17, hMax: 0.9, conf: 2 },
  { d: "Sun 9",  am: 0, pm: 1, wMax: 14, hMax: 0.6, conf: 1 },
  { d: "Mon 10", am: 0, pm: 0, wMax: 12, hMax: 0.5, conf: 1 },
  { d: "Tue 11", am: 0, pm: 1, wMax: 15, hMax: 0.6, conf: 1 },
];
const CONF_LABEL = ["", "Low confidence", "Medium confidence", "High confidence"];

// --- Boat + trip model ---
const HULLS = ["RIB", "Bowrider", "Cabin cruiser", "PWC"];
const SKIPPER = ["Novice", "Confident", "Experienced"];
const ACTIVITY = ["Pottering the bay", "Tubing / watersports", "Fishing offshore"];
const CREW = ["Just me", "Adults", "Kids aboard"];

// Base wind/wave limits (green-max, amber-max) by hull, scaled by length.
function baseLimits(hull, lengthM) {
  const table = {
    "RIB":            { w: [12, 17], h: [0.5, 0.9] },
    "Bowrider":       { w: [10, 14], h: [0.4, 0.7] },
    "Cabin cruiser":  { w: [14, 19], h: [0.7, 1.1] },
    "PWC":            { w: [11, 15], h: [0.4, 0.8] },
  };
  const t = table[hull];
  const scale = Math.min(1.35, Math.max(0.75, lengthM / 6)); // 6 m = neutral
  return {
    w: t.w.map((v) => v * scale),
    h: t.h.map((v) => v * scale),
  };
}

function verdictForHour(i, boat, trip) {
  let { w, h } = baseLimits(boat.hull, boat.length);
  let mult = 1;
  if (trip.crew === "Kids aboard") mult *= 0.8;
  if (trip.activity === "Tubing / watersports") mult *= 0.85;
  if (trip.activity === "Fishing offshore") mult *= 0.85;
  if (boat.skipper === "Novice") mult *= 0.85;
  if (boat.skipper === "Experienced") mult *= 1.1;
  w = w.map((v) => v * mult);
  h = h.map((v) => v * mult);

  const wind = FORECAST.wind[i];
  const gustFactor = FORECAST.gust[i] > wind * 1.5 ? 0.9 : 1; // gusty = tighten
  const chopFactor = FORECAST.period[i] <= 4 ? 0.85 : 1;      // short period = nasty chop
  const wLim = w.map((v) => v * gustFactor);
  const hLim = h.map((v) => v * chopFactor);

  const windBand = wind <= wLim[0] ? 0 : wind <= wLim[1] ? 1 : 2;
  const waveBand = FORECAST.wave[i] <= hLim[0] ? 0 : FORECAST.wave[i] <= hLim[1] ? 1 : 2;
  return Math.max(windBand, waveBand); // worst factor wins
}

const BAND = [
  { name: "GOOD TO LAUNCH", color: C.green, deep: C.greenDeep, word: "green" },
  { name: "THINK TWICE", color: C.amber, deep: C.amberDeep, word: "amber" },
  { name: "STAY ASHORE", color: C.red, deep: C.redDeep, word: "red" },
];

function fmtHour(h) {
  return `${String(h).padStart(2, "0")}:00`;
}

// --- Animated horizon wave: amplitude from wave height, chop from period ---
function WaveDivider({ waveM, periodS, color }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
  }, []);
  const amp = 4 + waveM * 26;            // px
  const cycles = periodS <= 4 ? 5 : periodS <= 6 ? 3.5 : 2.5;
  const W = 800, H = 90, mid = 45;
  const pts = [];
  for (let x = 0; x <= W; x += 8) {
    const y = mid + Math.sin((x / W) * Math.PI * 2 * cycles) * amp;
    pts.push(`${x},${y.toFixed(1)}`);
  }
  const path = `M0,${H} L0,${mid} L${pts.map((p) => p).join(" L")} L${W},${H} Z`;
  return (
    <div style={{ position: "relative", height: 56, overflow: "hidden", marginTop: -8 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{
          position: "absolute", left: "-25%", width: "150%", height: "100%",
          animation: reduced ? "none" : `drift ${Math.max(4, periodS * 1.2)}s linear infinite alternate`,
        }}
      >
        <path d={path} fill={color} opacity="0.24" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" opacity="0.9" />
      </svg>
    </div>
  );
}

function Chip({ label, active, onClick, tone }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: 13, fontWeight: 500,
        padding: "8px 13px", borderRadius: 999,
        border: `1px solid ${active ? tone : C.hair}`,
        background: active ? `${tone}22` : "transparent",
        color: active ? C.foam : C.slate,
        cursor: "pointer", transition: "all .15s",
      }}
    >
      {label}
    </button>
  );
}

function Row({ label, value, unit, warn }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: `1px solid ${C.hair}` }}>
      <span style={{ fontSize: 13, color: C.slate }}>{label}</span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: warn ? C.amber : C.foam }}>
        {value}<span style={{ fontSize: 11, color: C.slate, marginLeft: 4 }}>{unit}</span>
      </span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.slate, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );
}

export default function GoNoGo() {
  const [screen, setScreen] = useState("today");
  const [boat, setBoat] = useState({ hull: "Bowrider", length: 5.5, skipper: "Confident" });
  const [trip, setTrip] = useState({ crew: "Adults", activity: "Pottering the bay" });

  const bands = useMemo(
    () => HOURS.map((_, i) => verdictForHour(i, boat, trip)),
    [boat, trip]
  );
  const nowIdx = HOURS.indexOf(NOW_HOUR);
  const now = bands[nowIdx];
  const B = BAND[now];

  // First change of colour after now → the plain sentence
  let changeIdx = -1;
  for (let i = nowIdx + 1; i < bands.length; i++) {
    if (bands[i] !== now) { changeIdx = i; break; }
  }
  const sentence =
    now === 0
      ? changeIdx > -1
        ? `Calm for your ${boat.hull.toLowerCase()} this morning — ${BAND[bands[changeIdx]].word} from ${fmtHour(HOURS[changeIdx])}, so be back before then.`
        : `Calm for your ${boat.hull.toLowerCase()} right through to sunset at ${SUNSET}.`
      : now === 1
      ? changeIdx > -1 && bands[changeIdx] === 0
        ? `Marginal for your setup right now — improves to green around ${fmtHour(HOURS[changeIdx])}.`
        : `Doable for an experienced hand, but conditions are on the edge for your setup today.`
      : `Wind and waves are beyond your boat's comfortable limits today. The sea will still be there tomorrow.`;

  const wind = FORECAST.wind[nowIdx], gust = FORECAST.gust[nowIdx],
        wave = FORECAST.wave[nowIdx], period = FORECAST.period[nowIdx];

  const nav = [
    { id: "today", label: "Today" },
    { id: "plan", label: "Plan" },
    { id: "why", label: "Why?" },
    { id: "boat", label: "My boat" },
  ];

  // Apply boat/trip sensitivity to the 10-day raw bands (simplified):
  // cautious setups bump marginal half-days up a band.
  const tighten =
    (trip.crew === "Kids aboard" ? 1 : 0) +
    (boat.skipper === "Novice" ? 1 : 0) +
    (boat.length < 5 ? 1 : 0);
  const dayBand = (b) => (tighten >= 2 && b === 1 ? 2 : tighten >= 1 && b === 0 ? b : b);
  const adjDays = DAYS.map((day) => ({
    ...day,
    am: tighten >= 2 && day.am === 1 ? 2 : day.am,
    pm: tighten >= 2 && day.pm === 1 ? 2 : day.pm,
  }));
  const bestDay = adjDays.reduce(
    (best, day, i) => {
      const score = day.am + day.pm - day.conf * 0.1;
      return score < best.score ? { i, score } : best;
    },
    { i: 0, score: 99 }
  );

  return (
    <div style={{ minHeight: "100vh", background: "#04101C", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "24px 12px", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{FONTS + `
        @keyframes drift { from { transform: translateX(0); } to { transform: translateX(-8%); } }
        button:focus-visible { outline: 2px solid ${C.foam}; outline-offset: 2px; }
      `}</style>

      {/* phone frame */}
      <div style={{ width: 390, maxWidth: "100%", background: C.ink, borderRadius: 28, overflow: "hidden", border: `1px solid ${C.hair}`, boxShadow: "0 24px 60px rgba(0,0,0,0.5)", color: C.foam }}>

        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px 10px" }}>
          <div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontStretch: "125%", fontSize: 15, letterSpacing: "0.04em" }}>GO / NO-GO</div>
            <div style={{ fontSize: 11, color: C.slate }}>Paphos harbour · Sun 2 Aug · 08:00</div>
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.slate, textAlign: "right" }}>
            ☀ {SUNRISE}<br />☾ {SUNSET}
          </div>
        </div>

        {/* ---------------- TODAY ---------------- */}
        {screen === "today" && (
          <div>
            {/* verdict block — the screen IS the flag */}
            <div style={{ background: `linear-gradient(180deg, ${B.deep} 0%, ${C.ink} 115%)`, padding: "26px 20px 0", transition: "background .4s" }}>
              <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontStretch: "125%", fontSize: 40, lineHeight: 1.02, color: B.color, transition: "color .3s" }}>
                {B.name}
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.5, color: C.foam, margin: "12px 0 6px", maxWidth: 330 }}>
                {sentence}
              </p>
              <div style={{ fontSize: 11, color: C.slate, marginBottom: 4 }}>
                Conditions guidance only — the final call is always the skipper's.
              </div>
              <WaveDivider waveM={wave} periodS={period} color={B.color} />
            </div>

            {/* timeline: the day as colour bands */}
            <div style={{ padding: "16px 20px 6px" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.slate, marginBottom: 8 }}>Your day on the water</div>
              <div style={{ display: "flex", gap: 3, height: 34, borderRadius: 8, overflow: "hidden" }}>
                {bands.map((b, i) => (
                  <div key={i} title={fmtHour(HOURS[i])} style={{ flex: 1, background: BAND[b].color, opacity: i === nowIdx ? 1 : 0.55, position: "relative" }}>
                    {i === nowIdx && <div style={{ position: "absolute", inset: 0, border: `2px solid ${C.foam}`, borderRadius: 4 }} />}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: C.slate, marginTop: 5 }}>
                <span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>20</span>
              </div>
            </div>

            {/* day kit: temp / rain / UV as decisions, not data */}
            <div style={{ padding: "14px 20px 0" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: C.slate, marginBottom: 8 }}>Day kit</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[
                  { icon: "🌡", big: "31°", small: "Sea 27° — swim-warm" },
                  { icon: "🌧", big: "Dry", small: "No rain till sunset" },
                  { icon: "☀", big: "UV 9", small: "Sunscreen essential — reapply after swims", hot: true },
                ].map((t) => (
                  <div key={t.icon} style={{ flex: 1, background: C.ink2, borderRadius: 12, padding: "10px 10px 9px", border: t.hot ? `1px solid ${C.amber}55` : `1px solid transparent` }}>
                    <div style={{ fontSize: 13 }}>{t.icon} <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: t.hot ? C.amber : C.foam }}>{t.big}</span></div>
                    <div style={{ fontSize: 10.5, lineHeight: 1.35, color: C.slate, marginTop: 4 }}>{t.small}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* per-trip inputs */}
            <div style={{ padding: "14px 20px 20px" }}>
              <Field label="Aboard today">
                {CREW.map((c) => (
                  <Chip key={c} label={c} active={trip.crew === c} tone={B.color} onClick={() => setTrip({ ...trip, crew: c })} />
                ))}
              </Field>
              <Field label="Plan">
                {ACTIVITY.map((a) => (
                  <Chip key={a} label={a} active={trip.activity === a} tone={B.color} onClick={() => setTrip({ ...trip, activity: a })} />
                ))}
              </Field>
            </div>
          </div>
        )}

        {/* ---------------- PLAN (10-day) ---------------- */}
        {screen === "plan" && (
          <div style={{ padding: "10px 20px 24px" }}>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontStretch: "125%", fontSize: 22, marginBottom: 2 }}>
              Next 10 days
            </div>
            <p style={{ fontSize: 13, color: C.slate, margin: "0 0 14px" }}>
              For your {boat.hull.toLowerCase()}{trip.crew === "Kids aboard" ? " with kids aboard" : ""}. Bars fade as forecasts get less certain.
            </p>
            {adjDays.map((day, i) => {
              const conf = day.conf;
              const opacity = conf === 3 ? 1 : conf === 2 ? 0.7 : 0.45;
              const isBest = i === bestDay.i;
              return (
                <div key={day.d} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "9px 10px",
                  borderRadius: 10, marginBottom: 4,
                  background: isBest ? `${C.green}14` : "transparent",
                  border: isBest ? `1px solid ${C.green}55` : `1px solid transparent`,
                }}>
                  <div style={{ width: 52, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: C.foam }}>{day.d}</div>
                  <div style={{ flex: 1, display: "flex", gap: 3, height: 20, opacity }}>
                    <div title="Morning" style={{ flex: 1, borderRadius: "5px 0 0 5px", background: BAND[day.am].color }} />
                    <div title="Afternoon" style={{ flex: 1, borderRadius: "0 5px 5px 0", background: BAND[day.pm].color }} />
                  </div>
                  <div style={{ width: 84, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.slate }}>
                    {day.wMax}kn · {day.hMax.toFixed(1)}m
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.slate, margin: "6px 10px 0" }}>
              <span>◧ morning · afternoon ◨</span>
              <span>faded = lower confidence</span>
            </div>
            <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: C.ink2, fontSize: 13, lineHeight: 1.55 }}>
              <span style={{ color: C.green, fontWeight: 600 }}>Best family window: </span>
              {adjDays[bestDay.i].d} — calm all day, forecast models in close agreement. Days 8–10 are an outlook, not a promise: recheck as they get closer.
            </div>
          </div>
        )}

        {/* ---------------- WHY ---------------- */}
        {screen === "why" && (
          <div style={{ padding: "10px 20px 24px" }}>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontStretch: "125%", fontSize: 22, color: B.color, marginBottom: 4 }}>
              Why {B.word} at 08:00
            </div>
            <p style={{ fontSize: 13, color: C.slate, margin: "0 0 10px" }}>
              Verdicts compare each hour's forecast against limits set by your boat, your crew and your plan. The worst factor decides.
            </p>
            <Row label="Wind" value={wind} unit="kn" />
            <Row label="Gusts" value={gust} unit="kn" warn={gust > wind * 1.5} />
            <Row label="Wave height" value={wave.toFixed(1)} unit="m" />
            <Row label="Wave period" value={period} unit="s" warn={period <= 4} />
            <Row label="Visibility" value={FORECAST.vis[nowIdx]} unit="km" />
            <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: C.ink2, fontSize: 13, lineHeight: 1.55, color: C.foam }}>
              <span style={{ color: B.color, fontWeight: 600 }}>Reading the sea: </span>
              {period <= 4
                ? "Short wave periods mean tight, steep chop — far rougher than the height alone suggests."
                : "Longer wave periods mean rolling, spaced-out water — comfortable even when the height number looks similar."}
              {" "}This afternoon the westerly sea breeze builds, the period shortens, and conditions turn against small open boats — a classic summer pattern on this coast.
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: C.slate }}>
              Forecast data simulated for this mock-up. Production build: live marine forecast (Open-Meteo Marine), refreshed hourly.
            </div>
          </div>
        )}

        {/* ---------------- MY BOAT ---------------- */}
        {screen === "boat" && (
          <div style={{ padding: "10px 20px 24px" }}>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontWeight: 800, fontStretch: "125%", fontSize: 22, marginBottom: 14 }}>
              My boat
            </div>
            <Field label="Hull type">
              {HULLS.map((h) => (
                <Chip key={h} label={h} active={boat.hull === h} tone={C.green} onClick={() => setBoat({ ...boat, hull: h })} />
              ))}
            </Field>
            <Field label={`Length — ${boat.length.toFixed(1)} m`}>
              <input
                type="range" min="3.5" max="12" step="0.5" value={boat.length}
                onChange={(e) => setBoat({ ...boat, length: parseFloat(e.target.value) })}
                style={{ width: "100%", accentColor: C.green }}
                aria-label="Boat length in metres"
              />
            </Field>
            <Field label="Skipper experience">
              {SKIPPER.map((s) => (
                <Chip key={s} label={s} active={boat.skipper === s} tone={C.green} onClick={() => setBoat({ ...boat, skipper: s })} />
              ))}
            </Field>
            <div style={{ marginTop: 8, padding: 14, borderRadius: 12, background: C.ink2, fontSize: 13, lineHeight: 1.55, color: C.slate }}>
              Set once. Every verdict is calculated for <span style={{ color: C.foam }}>this boat and this skipper</span> — a 4 m bowrider and a 9 m cruiser get different answers to the same sea.
            </div>
          </div>
        )}

        {/* nav */}
        <div style={{ display: "flex", borderTop: `1px solid ${C.hair}` }}>
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setScreen(n.id)}
              style={{
                flex: 1, padding: "14px 0", background: "transparent", border: "none",
                fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, fontWeight: 600,
                color: screen === n.id ? C.foam : C.slate,
                borderTop: screen === n.id ? `2px solid ${B.color}` : "2px solid transparent",
                cursor: "pointer",
              }}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
