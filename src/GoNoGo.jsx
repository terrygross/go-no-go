import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Share } from "@capacitor/share";

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
`;

const C = {
  ink: "#081826", ink2: "#0D2436", foam: "#F2F7F7", slate: "#7C99AD",
  hair: "rgba(242,247,247,0.14)",
  green: "#1FB871", greenDeep: "#0E5A3C",
  amber: "#F2A21C", amberDeep: "#7A4E08",
  red: "#E5484D", redDeep: "#6E1A1E",
};

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Fallback used while loading or if API fails
const DEMO = {
  forecast: {
    wind:   [5,6,6,7,8,10,12,13,15,17,18,16,13,10,8],
    gust:   [7,8,9,10,11,14,16,18,21,24,25,22,18,14,11],
    wave:   [0.2,0.2,0.2,0.3,0.3,0.4,0.5,0.6,0.7,0.8,0.8,0.7,0.6,0.4,0.3],
    period: [7,7,7,6,6,5,5,4,4,4,4,4,5,6,6],
    vis:    [10,10,10,10,10,10,10,10,9,9,9,10,10,10,10],
    dir:    [175,180,185,200,215,230,245,255,265,270,272,268,258,248,235],
  },
  sunrise: "06:04", sunset: "19:52", nowHour: 8,
  airTemp: 31, sst: 27, uv: 9, rainProb: 5,
};
const DEMO_DAYS = [
  { d:"Sun 2",  am:0, pm:1, wMax:18, hMax:0.8, conf:3 },
  { d:"Mon 3",  am:0, pm:1, wMax:16, hMax:0.7, conf:3 },
  { d:"Tue 4",  am:0, pm:0, wMax:11, hMax:0.4, conf:3 },
  { d:"Wed 5",  am:0, pm:0, wMax:10, hMax:0.4, conf:3 },
  { d:"Thu 6",  am:1, pm:2, wMax:22, hMax:1.2, conf:2 },
  { d:"Fri 7",  am:2, pm:2, wMax:26, hMax:1.5, conf:2 },
  { d:"Sat 8",  am:1, pm:1, wMax:17, hMax:0.9, conf:2 },
  { d:"Sun 9",  am:0, pm:1, wMax:14, hMax:0.6, conf:1 },
  { d:"Mon 10", am:0, pm:0, wMax:12, hMax:0.5, conf:1 },
  { d:"Tue 11", am:0, pm:1, wMax:15, hMax:0.6, conf:1 },
];

const MARINAS = [
  { name: "Paphos Harbour", lat: 34.7542, lon: 32.4083 },
  { name: "Latchi Marina",  lat: 35.0294, lon: 32.3842 },
  { name: "Coral Bay",      lat: 34.8386, lon: 32.3642 },
  { name: "Yeroskipou",     lat: 34.7380, lon: 32.4578 },
  { name: "Custom",         lat: null,    lon: null     },
];

const HULLS = ["RIB", "Bowrider", "Cabin cruiser", "PWC", "Power Cat", "Sailboat", "Sailing Cat"];
const SKIPPER = ["Novice", "Confident", "Experienced"];
const ACTIVITY = ["Pottering the bay", "Tubing / watersports", "Fishing offshore"];
const CREW    = ["Just me", "Adults", "Kids aboard"];

// ── Live data fetcher ─────────────────────────────────────────────────────────
async function fetchLiveData(lat, lon) {
  const today = new Date().toISOString().slice(0, 10);
  const nowHour = Math.min(20, Math.max(6, new Date().getHours()));

  const [wRes, mRes] = await Promise.all([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,uv_index` +
      `&daily=sunrise,sunset,temperature_2m_max,precipitation_probability_max,uv_index_max` +
      `&wind_speed_unit=kn&timezone=auto&forecast_days=10`
    ),
    fetch(
      `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
      `&hourly=wave_height,wave_period,wave_direction,sea_surface_temperature` +
      `&timezone=auto&forecast_days=7`
    ),
  ]);

  if (!wRes.ok || !mRes.ok) throw new Error("forecast unavailable");
  const w = await wRes.json();
  const m = await mRes.json();

  // Build index maps for O(1) lookup
  const wMap = {};
  w.hourly.time.forEach((ts, i) => { wMap[ts] = i; });
  const mMap = {};
  m.hourly.time.forEach((ts, i) => { mMap[ts] = i; });

  function ts(date, h) { return `${date}T${String(h).padStart(2,"0")}:00`; }
  function wv(date, h, key, fallback = 0) {
    const i = wMap[ts(date, h)];
    return i != null ? (w.hourly[key][i] ?? fallback) : fallback;
  }
  function mv(date, h, key, fallback = 0) {
    const i = mMap[ts(date, h)];
    return i != null ? (m.hourly[key][i] ?? fallback) : fallback;
  }

  // Today's 15-slot forecast
  const forecast = { wind:[], gust:[], wave:[], period:[], vis:[], dir:[] };
  for (const h of HOURS) {
    forecast.wind.push(Math.round(wv(today, h, "wind_speed_10m")));
    forecast.gust.push(Math.round(wv(today, h, "wind_gusts_10m")));
    forecast.dir.push(Math.round(wv(today, h, "wind_direction_10m", 180)));
    forecast.vis.push(Math.round(wv(today, h, "visibility", 10000) / 1000));
    forecast.wave.push(parseFloat((mv(today, h, "wave_height", 0.1)).toFixed(1)));
    forecast.period.push(Math.max(2, Math.round(mv(today, h, "wave_period", 6))));
  }

  // Return raw hourly data for computing 10-day bands reactively in the component
  const raw = {
    wTime: w.hourly.time,
    wind:  w.hourly.wind_speed_10m,
    gust:  w.hourly.wind_gusts_10m,
    mTime: m.hourly.time,
    wave:  m.hourly.wave_height,
    period: m.hourly.wave_period,
    wMap, mMap,
  };

  // Daily values for Day Kit
  const airTemp  = Math.round(w.daily.temperature_2m_max?.[0] ?? 31);
  const uv       = Math.round(w.daily.uv_index_max?.[0] ?? 9);
  const rainProb = w.daily.precipitation_probability_max?.[0] ?? 0;
  const sunrise  = w.daily.sunrise?.[0]?.slice(11, 16) ?? "06:00";
  const sunset   = w.daily.sunset?.[0]?.slice(11, 16) ?? "20:00";
  const sst      = Math.round(mv(today, 12, "sea_surface_temperature", 27));
  const dailyTimes = w.daily.time ?? [];

  return { forecast, raw, dailyTimes, sunrise, sunset, nowHour, airTemp, uv, rainProb, sst, today };
}

// ── Verdict engine ────────────────────────────────────────────────────────────
function baseLimits(hull, lengthM) {
  const table = {
    "RIB":           { w:[14,20], h:[0.6,1.1] },
    "Bowrider":      { w:[14,20], h:[0.65,1.1] },
    "Cabin cruiser": { w:[17,23], h:[0.9,1.5] },
    "PWC":           { w:[13,18], h:[0.5,0.9] },
    "Power Cat":     { w:[18,25], h:[1.0,1.6] },
    "Sailboat":      { w:[22,30], h:[1.3,2.2] },
    "Sailing Cat":   { w:[20,28], h:[1.1,1.9] },
  };
  const t = table[hull];
  const scale = Math.min(1.35, Math.max(0.75, lengthM / 6));
  return { w: t.w.map(v => v * scale), h: t.h.map(v => v * scale) };
}

function verdictForData({ wind, gust, wave, period }, boat, trip) {
  let { w, h } = baseLimits(boat.hull, boat.length);
  let mult = 1;
  if (trip.crew === "Kids aboard") mult *= 0.8;
  if (trip.activity === "Tubing / watersports") mult *= 0.85;
  if (trip.activity === "Fishing offshore") mult *= 0.85;
  if (boat.skipper === "Novice") mult *= 0.85;
  if (boat.skipper === "Experienced") mult *= 1.1;
  w = w.map(v => v * mult);
  h = h.map(v => v * mult);
  const gustFactor = gust > wind * 2.0 ? 0.9 : 1;
  const chopFactor = period <= 4 ? 0.85 : 1;
  const wLim = w.map(v => v * gustFactor);
  const hLim = h.map(v => v * chopFactor);
  const windBand = wind <= wLim[0] ? 0 : wind <= wLim[1] ? 1 : 2;
  const waveBand = wave <= hLim[0] ? 0 : wave <= hLim[1] ? 1 : 2;
  return Math.max(windBand, waveBand);
}

const BAND = [
  { name:"GOOD TO LAUNCH", color:C.green, deep:C.greenDeep, word:"green" },
  { name:"THINK TWICE",    color:C.amber, deep:C.amberDeep, word:"amber" },
  { name:"STAY ASHORE",   color:C.red,   deep:C.redDeep,   word:"red"   },
];

function fmtHour(h) { return `${String(h).padStart(2,"0")}:00`; }
function fmtTime(d) { return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function cardinal(deg) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}
function haversineNm(lat1,lon1,lat2,lon2) {
  const R=3440.065, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.asin(Math.sqrt(a));
}

// ── Unit Formatting Helpers ───────────────────────────────────────────────────
// Units: "metric" (meters / km/h) vs "imperial" (feet / knots)
function formatWind(knots, system = "imperial") {
  if (knots == null || isNaN(knots)) return { val: "--", unit: system === "metric" ? "km/h" : "kn" };
  if (system === "metric") {
    return { val: Math.round(knots * 1.852), unit: "km/h" };
  }
  return { val: Math.round(knots), unit: "kn" };
}

function formatWave(meters, system = "imperial") {
  if (meters == null || isNaN(meters)) return { val: "--", unit: system === "metric" ? "m" : "ft" };
  if (system === "metric") {
    return { val: Number(meters).toFixed(1), unit: "m" };
  }
  return { val: (meters * 3.28084).toFixed(1), unit: "ft" };
}

function formatSpeed(knots, system = "imperial") {
  if (knots == null || isNaN(knots)) return { val: "--", unit: system === "metric" ? "km/h" : "kn" };
  if (system === "metric") {
    return { val: Math.round(knots * 1.852), unit: "km/h" };
  }
  return { val: Math.round(knots), unit: "kn" };
}

function formatLength(meters, system = "imperial") {
  if (meters == null || isNaN(meters)) return { val: "--", unit: system === "metric" ? "m" : "ft" };
  if (system === "metric") {
    return { val: Number(meters).toFixed(1), unit: "m" };
  }
  return { val: (meters * 3.28084).toFixed(1), unit: "ft" };
}

function formatVis(km, system = "imperial") {
  if (km == null || isNaN(km)) return { val: "--", unit: system === "metric" ? "km" : "nm" };
  if (system === "metric") {
    return { val: km, unit: "km" };
  }
  return { val: (km * 0.539957).toFixed(1), unit: "nm" };
}

function formatTemp(celsius, system = "imperial") {
  if (celsius == null || isNaN(celsius)) return { val: "--", unit: system === "metric" ? "°C" : "°F" };
  if (system === "metric") return { val: Math.round(celsius), unit: "°C" };
  return { val: Math.round(celsius * 9 / 5 + 32), unit: "°F" };
}

function UnitToggle({ unitSystem, onChange, compact = false }) {
  return (
    <div
      title="Switch between Metric (m, km/h) and Imperial (ft, kn)"
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "rgba(13, 36, 54, 0.85)",
        border: `1px solid ${C.hair}`,
        borderRadius: 999,
        padding: 2,
        gap: 2,
      }}>
      <button
        type="button"
        onClick={() => onChange("metric")}
        title="Metric: meters & km/h"
        style={{
          background: unitSystem === "metric" ? C.green : "transparent",
          color: unitSystem === "metric" ? C.foam : C.slate,
          border: "none",
          borderRadius: 999,
          padding: compact ? "2px 7px" : "3px 9px",
          fontSize: compact ? 10 : 11,
          fontFamily: "'IBM Plex Sans',sans-serif",
          fontWeight: unitSystem === "metric" ? 700 : 500,
          cursor: "pointer",
          transition: "all 0.15s ease",
          lineHeight: 1.2,
        }}>
        {compact ? "m · km/h" : "Metric (m, km/h)"}
      </button>
      <button
        type="button"
        onClick={() => onChange("imperial")}
        title="Imperial: feet & knots"
        style={{
          background: unitSystem === "imperial" ? C.green : "transparent",
          color: unitSystem === "imperial" ? C.foam : C.slate,
          border: "none",
          borderRadius: 999,
          padding: compact ? "2px 7px" : "3px 9px",
          fontSize: compact ? 10 : 11,
          fontFamily: "'IBM Plex Sans',sans-serif",
          fontWeight: unitSystem === "imperial" ? 700 : 500,
          cursor: "pointer",
          transition: "all 0.15s ease",
          lineHeight: 1.2,
        }}>
        {compact ? "ft · kn" : "Imperial (ft, kn)"}
      </button>
    </div>
  );
}

// ── Audio Foghorn Synthesizer ──────────────────────────────────────────────────
function playFoghornSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const now = ctx.currentTime;

    // Deep dual-tone nautical foghorn blast (130 Hz fundamental + 195 Hz fifth + harmonics)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(130.81, now); // C3
    osc1.frequency.linearRampToValueAtTime(129.5, now + 2.2);

    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(196.00, now); // G3
    osc2.frequency.linearRampToValueAtTime(194.0, now + 2.2);

    sub.type = "sine";
    sub.frequency.setValueAtTime(65.4, now); // C2 sub-bass foundation

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.linearRampToValueAtTime(320, now + 2.2);

    // Envelope: slow swell in, sustained deep blast, gentle echo trail
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.35);
    gain.gain.setValueAtTime(0.35, now + 1.8);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.6);

    osc1.connect(filter);
    osc2.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    sub.start(now);

    osc1.stop(now + 2.7);
    osc2.stop(now + 2.7);
    sub.stop(now + 2.7);
  } catch (err) {
    console.warn("Foghorn sound unable to play:", err);
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function WaveDivider({ waveM, periodS, color }) {
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{ const mq=window.matchMedia("(prefers-reduced-motion:reduce)"); setReduced(mq.matches); },[]);
  const amp=4+waveM*26, cycles=periodS<=4?5:periodS<=6?3.5:2.5;
  const W=800,H=90,mid=45, pts=[];
  for(let x=0;x<=W;x+=8){ const y=mid+Math.sin((x/W)*Math.PI*2*cycles)*amp; pts.push(`${x},${y.toFixed(1)}`); }
  const path=`M0,${H} L0,${mid} L${pts.join(" L")} L${W},${H} Z`;
  return (
    <div style={{position:"relative",height:56,overflow:"hidden",marginTop:-8}}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{position:"absolute",left:"-25%",width:"150%",height:"100%",
          animation:reduced?"none":`drift ${Math.max(4,periodS*1.2)}s linear infinite alternate`}}>
        <path d={path} fill={color} opacity="0.24"/>
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" opacity="0.9"/>
      </svg>
    </div>
  );
}

function Chip({label,active,onClick,tone}) {
  return (
    <button onClick={onClick} style={{fontFamily:"'IBM Plex Sans',sans-serif",fontSize:13,fontWeight:500,
      padding:"8px 13px",borderRadius:999,border:`1px solid ${active?tone:C.hair}`,
      background:active?`${tone}22`:"transparent",color:active?C.foam:C.slate,cursor:"pointer"}}>
      {label}
    </button>
  );
}

function Row({label,value,unit,warn}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",
      padding:"10px 0",borderBottom:`1px solid ${C.hair}`}}>
      <span style={{fontSize:13,color:C.slate}}>{label}</span>
      <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:15,color:warn?C.amber:C.foam}}>
        {value}<span style={{fontSize:11,color:C.slate,marginLeft:4}}>{unit}</span>
      </span>
    </div>
  );
}

function Field({label,children}) {
  return (
    <div style={{marginBottom:18}}>
      <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:C.slate,marginBottom:8}}>{label}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{children}</div>
    </div>
  );
}

const INPUT = {
  background:"#04101C",border:`1px solid rgba(242,247,247,0.14)`,borderRadius:8,
  padding:"9px 12px",color:"#F2F7F7",fontFamily:"'IBM Plex Sans',sans-serif",
  fontSize:13,width:"100%",boxSizing:"border-box",outline:"none",
};

function fmtCoords(lat, lon) {
  if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return "--";
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lon).toFixed(4)}°${ew}`;
}

function GpsLocationStatus({ gps, marina, onRetry, rawDistNm, isOffshore, isAtSlip, boatName, hullType }) {
  const [retrying, setRetrying] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const handleRetry = () => {
    setRetrying(true);
    if (onRetry) onRetry();
    setTimeout(() => setRetrying(false), 1200);
  };

  const hasPos = gps && !gps.error && gps.lat != null && gps.lon != null;
  const isError = Boolean(gps?.error);
  const displayLat = hasPos ? gps.lat : marina?.lat;
  const displayLon = hasPos ? gps.lon : marina?.lon;

  // Build clean free embed URL for interactive map / satellite
  const embedUrl = (displayLat != null && displayLon != null)
    ? `https://maps.google.com/maps?q=${displayLat},${displayLon}&t=m&z=14&hl=en&output=embed`
    : null;

  const externalMapsUrl = (displayLat != null && displayLon != null)
    ? `https://www.google.com/maps/search/?api=1&query=${displayLat},${displayLon}`
    : null;

  return (
    <>
      <div style={{
        margin:"0 20px 14px",
        background:C.ink2,
        borderRadius:12,
        padding:"11px 13px",
        border:`1px solid ${hasPos ? `${C.green}44` : isError ? `${C.red}44` : `${C.amber}44`}`,
        display:"flex",
        flexDirection:"column",
        gap:10
      }}>
        <div style={{
          display:"flex",
          alignItems:"center",
          justifyContent:"space-between",
          gap:10
        }}>
          <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
            <div style={{
              width:34,height:34,borderRadius:8,
              background:hasPos ? `${C.green}1F` : isError ? `${C.red}1F` : `${C.amber}1F`,
              border:`1px solid ${hasPos ? C.green : isError ? C.red : C.amber}`,
              display:"flex",alignItems:"center",justifyContent:"center",
              flexShrink:0,fontSize:15
            }}>
              {hasPos ? "📍" : isError ? "⚠️" : "🛰️"}
            </div>

            <div style={{minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{
                  fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase",
                  fontWeight:700,color:hasPos ? C.green : isError ? C.red : C.amber
                }}>
                  {hasPos ? "GPS Position Locked" : isError ? "GPS Unavailable" : "Acquiring GPS Position"}
                </span>
                {hasPos && (
                  <span style={{
                    width:6,height:6,borderRadius:"50%",background:C.green,
                    boxShadow:`0 0 6px ${C.green}`,display:"inline-block"
                  }} />
                )}
              </div>

              <div style={{
                fontFamily:"'IBM Plex Mono',monospace",fontSize:12,fontWeight:600,
                color:hasPos ? C.foam : C.slate,marginTop:2,
                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"
              }}>
                {hasPos 
                  ? fmtCoords(gps.lat, gps.lon)
                  : isError 
                    ? (marina?.lat ? `Marina: ${fmtCoords(marina.lat, marina.lon)}` : "Coordinates unavailable")
                    : "Acquiring satellite fix..."}
              </div>

              {hasPos && rawDistNm != null && (
                <div style={{fontSize:10.5,color:C.slate,marginTop:1}}>
                  {isAtSlip 
                    ? `At ${marina?.name || "marina"} slip (<0.3 nm)` 
                    : `${rawDistNm.toFixed(1)} nm from ${marina?.name || "marina"}`}
                </div>
              )}
              {isError && (
                <div style={{fontSize:10,color:C.slate,marginTop:1}}>
                  {gps.error || "Permission required for live offshore range"}
                </div>
              )}
            </div>
          </div>

          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <button
              type="button"
              onClick={handleRetry}
              title="Refresh GPS location"
              style={{
                background:"transparent",border:`1px solid ${C.hair}`,borderRadius:8,
                color:retrying ? C.amber : C.foam,padding:"6px 9px",fontSize:11,
                fontFamily:"'IBM Plex Sans',sans-serif",cursor:"pointer",
                display:"flex",alignItems:"center",gap:4,transition:"all .2s"
              }}>
              <span style={{
                display:"inline-block",
                transform:retrying ? "rotate(180deg)" : "none",
                transition:"transform .4s ease-out"
              }}>
                ↻
              </span>
              <span>{hasPos ? "Refresh" : "Retry"}</span>
            </button>
          </div>
        </div>

        {/* View on Map Trigger Button */}
        {(hasPos || marina?.lat != null) && (
          <div style={{
            display:"flex",
            alignItems:"center",
            justifyContent:"space-between",
            paddingTop:8,
            borderTop:`1px solid ${C.hair}`,
            gap:8
          }}>
            <button
              type="button"
              onClick={() => setShowMap(true)}
              style={{
                flex:1,
                background:`linear-gradient(180deg, rgba(29, 158, 117, 0.18) 0%, rgba(29, 158, 117, 0.08) 100%)`,
                border:`1px solid ${C.green}66`,
                borderRadius:8,
                padding:"7px 12px",
                color:C.foam,
                fontFamily:"'IBM Plex Sans',sans-serif",
                fontSize:12,
                fontWeight:600,
                cursor:"pointer",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                gap:7,
                transition:"all 0.15s ease"
              }}>
              <span>🗺️</span>
              <span>View Boat on Map</span>
            </button>

            {externalMapsUrl && (
              <a
                href={externalMapsUrl}
                target="_blank"
                rel="noreferrer"
                title="Open in Google Maps App / Tab"
                style={{
                  background:"transparent",
                  border:`1px solid ${C.hair}`,
                  borderRadius:8,
                  padding:"7px 10px",
                  color:C.slate,
                  fontFamily:"'IBM Plex Sans',sans-serif",
                  fontSize:11,
                  textDecoration:"none",
                  display:"flex",
                  alignItems:"center",
                  gap:4,
                  whiteSpace:"nowrap"
                }}>
                <span>↗</span> Google Maps
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Popup Map Modal ────────────────────────────────────────── */}
      {showMap && (
        <div style={{
          position:"fixed",
          inset:0,
          background:"rgba(2, 10, 18, 0.82)",
          backdropFilter:"blur(6px)",
          zIndex:9999,
          display:"flex",
          alignItems:"center",
          justifyContent:"center",
          padding:16,
          boxSizing:"border-box"
        }}>
          <div style={{
            background:C.ink,
            border:`1px solid rgba(242,247,247,0.18)`,
            borderRadius:16,
            width:"100%",
            maxWidth:440,
            maxHeight:"90vh",
            display:"flex",
            flexDirection:"column",
            overflow:"hidden",
            boxShadow:"0 20px 40px rgba(0,0,0,0.6)"
          }}>
            {/* Modal Header */}
            <div style={{
              display:"flex",
              alignItems:"center",
              justifyContent:"space-between",
              padding:"14px 16px",
              borderBottom:`1px solid ${C.hair}`,
              background:C.ink2
            }}>
              <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                <span style={{fontSize:18}}>🛥️</span>
                <div style={{minWidth:0}}>
                  <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontSize:14,color:C.foam,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {boatName ? boatName.toUpperCase() : "VESSEL LOCATION"}
                  </div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10.5,color:C.green}}>
                    {hasPos ? fmtCoords(gps.lat, gps.lon) : `Marina: ${fmtCoords(marina.lat, marina.lon)}`}
                  </div>
                </div>
              </div>

              {/* Close Button on Top */}
              <button
                type="button"
                onClick={() => setShowMap(false)}
                aria-label="Close map"
                style={{
                  background:"transparent",
                  border:`1px solid ${C.hair}`,
                  borderRadius:8,
                  color:C.foam,
                  width:32,
                  height:32,
                  fontSize:16,
                  cursor:"pointer",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"center"
                }}>
                ✕
              </button>
            </div>

            {/* Map Frame */}
            <div style={{position:"relative",flex:1,minHeight:320,background:"#081b2a"}}>
              {embedUrl ? (
                <iframe
                  title="Boat Location Map"
                  src={embedUrl}
                  style={{
                    width:"100%",
                    height:"100%",
                    minHeight:320,
                    border:"none",
                    display:"block"
                  }}
                  loading="lazy"
                />
              ) : (
                <div style={{padding:40,textAlign:"center",color:C.slate,fontSize:13}}>
                  Unable to load map without valid coordinates.
                </div>
              )}

              {/* Vessel Pin Floating Overlay Tag */}
              <div style={{
                position:"absolute",
                bottom:12,
                left:12,
                right:12,
                background:"rgba(4, 16, 28, 0.92)",
                backdropFilter:"blur(4px)",
                border:`1px solid ${C.hair}`,
                borderRadius:10,
                padding:"8px 12px",
                display:"flex",
                alignItems:"center",
                justifyContent:"space-between",
                gap:8,
                pointerEvents:"auto"
              }}>
                <div style={{fontSize:11,color:C.foam}}>
                  <span style={{color:hasPos ? C.green : C.amber,fontWeight:600}}>
                    {hasPos ? "Live Vessel Fix" : "Marina Reference"}
                  </span>
                  {rawDistNm != null && (
                    <span style={{color:C.slate,marginLeft:6}}>
                      ({rawDistNm.toFixed(1)} nm from {marina?.name || "port"})
                    </span>
                  )}
                </div>
                {externalMapsUrl && (
                  <a
                    href={externalMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color:C.green,
                      fontSize:11,
                      fontWeight:600,
                      textDecoration:"none"
                    }}>
                    Open Google Maps ↗
                  </a>
                )}
              </div>
            </div>

            {/* Modal Footer with Primary "Close Map" Button */}
            <div style={{padding:"12px 16px",borderTop:`1px solid ${C.hair}`,background:C.ink2}}>
              <button
                type="button"
                onClick={() => setShowMap(false)}
                style={{
                  width:"100%",
                  background:C.green,
                  color:C.foam,
                  border:"none",
                  borderRadius:10,
                  padding:"11px 16px",
                  fontSize:14,
                  fontFamily:"'IBM Plex Sans',sans-serif",
                  fontWeight:600,
                  cursor:"pointer",
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"center",
                  gap:6,
                  transition:"opacity .15s"
                }}>
                <span>←</span>
                <span>Close Map & Return to App</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── LocalStorage Helpers ──────────────────────────────────────────────────
const STORAGE_KEYS = {
  BOAT: "gonogo_boat_settings_v2",
  TRIP: "gonogo_trip_settings_v1",
  MARINA_ORDER: "gonogo_marina_order_v1",
  LAST_FORECAST: "gonogo_last_forecast_data_v1",
  SUBSCRIPTION: "gonogo_subscription_plan_v1",
  UNITS: "gonogo_units_preference_v1",
};

function getStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota/privacy errors
  }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function GoNoGo() {
  const [screen, setScreen]   = useState("today");

  const insets = {top: 28, bottom: 48};
  const [unitSystem, setUnitSystem] = useState(() => getStoredJson(STORAGE_KEYS.UNITS, "imperial"));
  useEffect(() => { setStoredJson(STORAGE_KEYS.UNITS, unitSystem); }, [unitSystem]);

  const [boat, setBoat]       = useState(() => getStoredJson(STORAGE_KEYS.BOAT, {
    hull:"Bowrider", length:5.5, skipper:"Confident", speed:20,
    marina:{ name:"Latchi Marina", lat:35.0294, lon:32.3842 },
    boatName: "", regNumber: "", vhfCallSign: "",
    ownerName: "", email: "", phone: "", address: "",
    emergencyContact: "", emergencyPhone: "",
    boatPhoto: null,
  }));
  const [subPlan, setSubPlan] = useState(() => getStoredJson(STORAGE_KEYS.SUBSCRIPTION, "yearly"));
  useEffect(() => { setStoredJson(STORAGE_KEYS.SUBSCRIPTION, subPlan); }, [subPlan]);
  const [trip, setTrip]       = useState(() => getStoredJson(STORAGE_KEYS.TRIP, {
    crew:"Adults", activity:"Pottering the bay"
  }));
  const [selectedHour, setSelectedHour] = useState(HOURS.indexOf(8));

  // Live & cached data state
  const cachedInitial = useMemo(() => getStoredJson(STORAGE_KEYS.LAST_FORECAST, null), []);
  const [liveData, setLiveData]   = useState(() => cachedInitial?.data || null);
  const [loading, setLoading]     = useState(true);
  const [updatedAt, setUpdatedAt] = useState(() => cachedInitial?.timestamp ? new Date(cachedInitial.timestamp) : null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Save boat, trip, order changes to localStorage
  useEffect(() => { setStoredJson(STORAGE_KEYS.BOAT, boat); }, [boat]);
  useEffect(() => { setStoredJson(STORAGE_KEYS.TRIP, trip); }, [trip]);

  // GPS & clock & alarm states
  const [gps, setGps]                   = useState(null);
  const [currentTime, setCurrentTime]   = useState(new Date());
  const [marinaGpsLoading, setMarinaGpsLoading] = useState(false);
  const [shareToast, setShareToast]     = useState(false);

  // Return Alarm & Phone Wake Management
  const [alarmSnoozedUntil, setAlarmSnoozedUntil] = useState(null);
  const [lastAckCoords, setLastAckCoords]         = useState(null);
  const [soundEnabled, setSoundEnabled]           = useState(true);
  const wakeLockRef = useRef(null);
  const [marinaOrder, setMarinaOrder] = useState(() => {
    const saved = getStoredJson(STORAGE_KEYS.MARINA_ORDER, null);
    if (saved && Array.isArray(saved) && saved.length > 0) return saved;
    const list = MARINAS.filter(m => m.name !== "Custom").map(m => m.name);
    const home = boat.marina?.name || "Latchi Marina";
    return [home, ...list.filter(n => n !== home)];
  });
  const marinaOrderRef = useRef(marinaOrder);
  marinaOrderRef.current = marinaOrder;

  useEffect(() => { setStoredJson(STORAGE_KEYS.MARINA_ORDER, marinaOrder); }, [marinaOrder]);

  const [dragActive, setDragActive] = useState(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [planDayPopup, setPlanDayPopup] = useState(null);

  const contentRef = useRef(null);
  useEffect(()=>{ if(contentRef.current) contentRef.current.scrollTop=0; },[screen]);

  // Network online/offline listener
  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Live clock
  useEffect(()=>{ const t=setInterval(()=>setCurrentTime(new Date()),30000); return()=>clearInterval(t); },[]);

  // GPS request / refresh handler
  const requestGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGps({ error: "GPS unavailable on device" });
      return;
    }
    setGps(null);
    navigator.geolocation.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => setGps({ error: err.message || "Location access denied" }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  // GPS watch
  useEffect(()=>{
    if(!navigator.geolocation){ setGps({error:"GPS unavailable"}); return; }
    const id=navigator.geolocation.watchPosition(
      pos=>setGps({lat:pos.coords.latitude,lon:pos.coords.longitude}),
      err=>setGps({error:err.message}),
      {enableHighAccuracy:true,maximumAge:30000,timeout:15000}
    );
    return()=>navigator.geolocation.clearWatch(id);
  },[]);

  // Fetch forecast when marina changes
  useEffect(()=>{
    const {lat,lon,name}=boat.marina;
    if(!lat||!lon) return;
    setLoading(true);

    // If we have cached forecast for this specific location, load it immediately as preview
    const locCacheKey = `gonogo_cache_${lat.toFixed(3)}_${lon.toFixed(3)}`;
    const localCached = getStoredJson(locCacheKey, null) || getStoredJson(STORAGE_KEYS.LAST_FORECAST, null);
    if (localCached?.data) {
      setLiveData(localCached.data);
      if (localCached.timestamp) setUpdatedAt(new Date(localCached.timestamp));
    }

    fetchLiveData(lat,lon)
      .then(data=>{
        setLiveData(data);
        const now = new Date();
        setUpdatedAt(now);
        setIsOffline(false);
        setStoredJson(locCacheKey, { data, timestamp: now.getTime(), marinaName: name });
        setStoredJson(STORAGE_KEYS.LAST_FORECAST, { data, timestamp: now.getTime(), marinaName: name });

        // Update selectedHour to real current hour
        const idx = HOURS.indexOf(data.nowHour);
        if(idx >= 0) setSelectedHour(idx);
      })
      .catch((err)=>{
        console.warn("Offline/Network fetch failed at sea:", err.message);
        setIsOffline(true);
        // If fetch fails, keep current liveData / cached data from localStorage
      })
      .finally(()=>setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[boat.marina.name, boat.marina.lat, boat.marina.lon]);

  // Derived forecast data (live or demo fallback)
  const fc = liveData?.forecast ?? DEMO.forecast;
  const sunrise  = liveData?.sunrise  ?? DEMO.sunrise;
  const sunset   = liveData?.sunset   ?? DEMO.sunset;
  const nowHour  = liveData?.nowHour  ?? DEMO.nowHour;
  const airTemp  = liveData?.airTemp  ?? DEMO.airTemp;
  const sst      = liveData?.sst      ?? DEMO.sst;
  const uv       = liveData?.uv       ?? DEMO.uv;
  const rainProb = liveData?.rainProb ?? DEMO.rainProb;
  const today    = liveData?.today    ?? new Date().toISOString().slice(0,10);

  // Verdict bands for today's hours
  const bands = useMemo(()=>
    HOURS.map((_,i)=>verdictForData(
      {wind:fc.wind[i],gust:fc.gust[i],wave:fc.wave[i],period:fc.period[i]},
      boat,trip
    )),
    [fc,boat,trip]
  );

  // 10-day plan — computed from raw hourly or fallback
  const days = useMemo(()=>{
    if(!liveData) return DEMO_DAYS;
    const{raw,dailyTimes}=liveData;
    return dailyTimes.slice(0,10).map((date,d)=>{
      const dt=new Date(date+"T12:00:00");
      const label=`${WEEKDAYS[dt.getDay()]} ${dt.getDate()}`;
      const conf=d<3?3:d<6?2:1;
      let amBand=0,pmBand=0,wMax=0,hMax=0;
      for(let h=6;h<=20;h++){
        const wts=`${date}T${String(h).padStart(2,"0")}:00`;
        const mts=wts;
        const wi=raw.wMap[wts],mi=raw.mMap[mts];
        const wind=wi!=null?Math.round(raw.wind[wi]??0):0;
        const gust=wi!=null?Math.round(raw.gust[wi]??0):0;
        const wave=mi!=null?(raw.wave[mi]??0):0;
        const period=mi!=null?Math.max(2,Math.round(raw.period[mi]??6)):6;
        const band=verdictForData({wind,gust,wave,period},boat,trip);
        wMax=Math.max(wMax,wind); hMax=Math.max(hMax,wave);
        if(h<=11) amBand=Math.max(amBand,band);
        else pmBand=Math.max(pmBand,band);
      }
      return{d:label,date,am:amBand,pm:pmBand,wMax,hMax:parseFloat(hMax.toFixed(1)),conf};
    });
  },[liveData,boat,trip]);

  // Hourly breakdown for tapped plan day
  const popupHourly = useMemo(()=>{
    const day = planDayPopup != null ? days[planDayPopup] : null;
    if (!day?.date || !liveData?.raw) return null;
    const { raw } = liveData;
    return HOURS.map(h => {
      const ts = `${day.date}T${String(h).padStart(2,"0")}:00`;
      const wi = raw.wMap?.[ts];
      const mi = raw.mMap?.[ts];
      const wind   = wi != null ? Math.round(raw.wind[wi]   ?? 0) : 0;
      const gust   = wi != null ? Math.round(raw.gust[wi]   ?? 0) : 0;
      const wave   = mi != null ? parseFloat((raw.wave[mi]  ?? 0).toFixed(1)) : 0;
      const period = mi != null ? Math.max(2, Math.round(raw.period[mi] ?? 6)) : 6;
      const band   = verdictForData({ wind, gust, wave, period }, boat, trip);
      return { h, wind, gust, wave, period, band };
    });
  },[planDayPopup, days, liveData, boat, trip]);

  const nowIdx = HOURS.indexOf(nowHour);
  const safenowIdx = nowIdx >= 0 ? nowIdx : 0;
  const now = bands[safenowIdx];
  const B   = BAND[now];

  // Selected-hour data (Why? screen)
  const selB      = BAND[bands[selectedHour]];
  const selWind   = fc.wind[selectedHour];
  const selGust   = fc.gust[selectedHour];
  const selWave   = fc.wave[selectedHour];
  const selPeriod = fc.period[selectedHour];
  const selVis    = fc.vis[selectedHour];
  const selDir    = fc.dir[selectedHour];

  const wave   = fc.wave[safenowIdx];
  const period = fc.period[safenowIdx];

  // First colour change after now
  let changeIdx = -1;
  for(let i=safenowIdx+1;i<bands.length;i++){ if(bands[i]!==now){changeIdx=i;break;} }

  // Return window deadline determination (weather change or sunset)
  let deadlineDate = null;
  let deadlineReason = "";
  if (changeIdx > -1) {
    const d = new Date(currentTime);
    d.setHours(HOURS[changeIdx], 0, 0, 0);
    deadlineDate = d;
    deadlineReason = `Conditions turn ${BAND[bands[changeIdx]].word} at ${fmtHour(HOURS[changeIdx])}`;
  } else if (sunset) {
    const parts = sunset.split(":");
    if (parts.length === 2) {
      const d = new Date(currentTime);
      d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
      deadlineDate = d;
      deadlineReason = `Sunset at ${sunset}`;
    }
  }

  // When GPS is far from marina (>30 nm / ~55 km), offer to use GPS for weather
  const gpsFarFromMarina = (() => {
    if (!gps || gps.error || !boat.marina.lat || !boat.marina.lon) return false;
    return haversineNm(gps.lat, gps.lon, boat.marina.lat, boat.marina.lon) > 30;
  })();

  // Live GPS or planning range distance
  const liveGps = (gps && !gps.error) ? gps : null;
  const rawDistNm = (liveGps && boat.marina.lat && boat.marina.lon)
    ? haversineNm(liveGps.lat, liveGps.lon, boat.marina.lat, boat.marina.lon)
    : null;

  // If GPS is within reasonable boating range (under 35 nm), use it; otherwise use default 5 nm trip radius
  const isOffshore = rawDistNm != null && rawDistNm >= 0.3 && rawDistNm <= 35;
  const isAtSlip   = rawDistNm != null && rawDistNm < 0.3;
  const distNm     = isOffshore ? rawDistNm : 5.0; // 5 nm typical coastal day cruise for planning

  const cruiseSpeed = Math.max(5, boat.speed || 20);
  const travelMins = Math.max(1, Math.ceil((distNm / cruiseSpeed) * 60));
  const bufferMins = 30; // 30 min safety buffer

  let latestDeparture = null;
  let minsRemaining = null;
  const isPastDeadline = deadlineDate != null && currentTime.getTime() >= deadlineDate.getTime();

  if (deadlineDate && !isPastDeadline) {
    latestDeparture = new Date(deadlineDate.getTime() - (travelMins + bufferMins) * 60000);
    minsRemaining = Math.round((latestDeparture.getTime() - currentTime.getTime()) / 60000);
  }

  // Show return window whenever we have good conditions now and a defined daylight/weather window
  const showReturnWindow = deadlineDate != null && !isPastDeadline && now === 0;
  const urgency = minsRemaining != null
    ? (minsRemaining <= 0 ? "red" : minsRemaining <= 30 ? "red" : minsRemaining <= 60 ? "amber" : "ok")
    : "ok";

  // Check if boat moved significantly towards marina since acknowledgment (>0.25 nm closer)
  const movedTowardsMarina = (() => {
    if (!lastAckCoords || !liveGps || !boat.marina.lat || !boat.marina.lon) return false;
    const prevDist = haversineNm(lastAckCoords.lat, lastAckCoords.lon, boat.marina.lat, boat.marina.lon);
    const currDist = haversineNm(liveGps.lat, liveGps.lon, boat.marina.lat, boat.marina.lon);
    return (prevDist - currDist) >= 0.25;
  })();

  // Clear snooze if boat has clearly started moving home
  useEffect(() => {
    if (movedTowardsMarina && alarmSnoozedUntil) {
      setAlarmSnoozedUntil(null);
    }
  }, [movedTowardsMarina, alarmSnoozedUntil]);

  // Is alarm currently active? (When offshore/underway, minsRemaining <= 0, and not actively snoozed)
  const isSnoozed = alarmSnoozedUntil != null && currentTime.getTime() < alarmSnoozedUntil;
  const shouldTriggerAlarm = showReturnWindow && isOffshore && minsRemaining != null && minsRemaining <= 0 && !isSnoozed;

  // Screen Wake Lock API — keeps screen alive while alarm is prompting
  useEffect(() => {
    async function requestWake() {
      if (shouldTriggerAlarm && "wakeLock" in navigator && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        } catch (e) {
          console.log("WakeLock couldn't be granted:", e);
        }
      } else if (!shouldTriggerAlarm && wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch {}
      }
    }
    requestWake();
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(()=>{});
        wakeLockRef.current = null;
      }
    };
  }, [shouldTriggerAlarm]);

  // Sound foghorn when alarm triggers (gentle nautical double blast every 30s until acknowledged)
  const lastSoundTimeRef = useRef(0);
  useEffect(() => {
    if (shouldTriggerAlarm && soundEnabled) {
      const nowMs = Date.now();
      if (nowMs - lastSoundTimeRef.current > 25000) {
        playFoghornSound();
        lastSoundTimeRef.current = nowMs;
      }
    }
  }, [shouldTriggerAlarm, currentTime, soundEnabled]);

  function handleAcknowledgeReturn() {
    // Snooze for 10 minutes (600,000 ms)
    const snoozeTime = Date.now() + 10 * 60 * 1000;
    setAlarmSnoozedUntil(snoozeTime);
    if (liveGps) {
      setLastAckCoords({ lat: liveGps.lat, lon: liveGps.lon, time: Date.now() });
    }
    // Release wake lock
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(()=>{});
      wakeLockRef.current = null;
    }
  }

  // Sentence
  const sentence =
    now===0 ? changeIdx>-1
      ? `Calm for your ${boat.hull.toLowerCase()} this morning — ${BAND[bands[changeIdx]].word} from ${fmtHour(HOURS[changeIdx])}, so be back before then.`
      : `Calm for your ${boat.hull.toLowerCase()} right through to sunset at ${sunset}.`
    : now===1 ? changeIdx>-1&&bands[changeIdx]===0
      ? `Marginal for your setup right now — improves to green around ${fmtHour(HOURS[changeIdx])}.`
      : `Doable for an experienced hand, but conditions are on the edge for your setup today.`
    : `Wind and waves are beyond your boat's comfortable limits today. The sea will still be there tomorrow.`;

  // Day Kit
  const rainLabel = rainProb >= 50 ? `Rain likely (${rainProb}%)` : rainProb >= 25 ? `${rainProb}% chance of rain` : "No rain expected";
  const sstTemp = formatTemp(sst, unitSystem);
  const sstLabel  = sst >= 24 ? `Sea ${sstTemp.val}${sstTemp.unit} — swim-warm` : `Sea ${sstTemp.val}${sstTemp.unit}`;

  // 10-day best day
  const tighten = (trip.crew==="Kids aboard"?1:0)+(boat.skipper==="Novice"?1:0)+(boat.length<5?1:0);
  const adjDays = days.map(day=>({
    ...day,
    am: tighten>=2&&day.am===1?2:day.am,
    pm: tighten>=2&&day.pm===1?2:day.pm,
  }));
  const bestDayIdx = adjDays.reduce(
    (best,day,i)=>{ const s=day.am+day.pm-day.conf*0.1; return s<best.s?{i,s}:best; },
    {i:0,s:99}
  ).i;

  const nav = [
    {id:"today",label:"Today"},{id:"plan",label:"Plan"},
    {id:"why",  label:"Why?"},{id:"boat",label:"My boat"},
  ];

  const setMarina = k => v => setBoat(b=>({...b,marina:{...b.marina,[k]:v}}));

  function captureGPSForMarina() {
    if(!navigator.geolocation) return;
    setMarinaGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos=>{ setBoat(b=>({...b,marina:{...b.marina,lat:parseFloat(pos.coords.latitude.toFixed(5)),lon:parseFloat(pos.coords.longitude.toFixed(5))}})); setMarinaGpsLoading(false); },
      ()=>setMarinaGpsLoading(false),
      {enableHighAccuracy:true,timeout:12000}
    );
  }

  function applyMarinaOrder(newOrder) {
    marinaOrderRef.current = newOrder;
    setMarinaOrder(newOrder);
    const top = MARINAS.find(m => m.name === newOrder[0]);
    if (top && top.lat != null) {
      setBoat(b => ({ ...b, marina: { name: top.name, lat: top.lat, lon: top.lon } }));
    }
  }

  function selectMarina(name) {
    const m = MARINAS.find(x => x.name === name);
    if (!m) return;
    const current = [...marinaOrderRef.current];
    const fromIdx = current.indexOf(name);
    if (fromIdx > 0) {
      current.splice(fromIdx, 1);
      current.unshift(name);
      applyMarinaOrder(current);
    } else {
      if (m.lat != null) {
        setBoat(b => ({ ...b, marina: { name: m.name, lat: m.lat, lon: m.lon } }));
      }
    }
  }

  function moveMarina(name, dir) {
    const current = [...marinaOrderRef.current];
    const idx = current.indexOf(name);
    if (idx === -1) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= current.length) return;
    current.splice(idx, 1);
    current.splice(targetIdx, 0, name);
    applyMarinaOrder(current);
  }

  function handlePointerDown(e, name) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const initialOrder = [...marinaOrderRef.current];
    const initialIdx = initialOrder.indexOf(name);
    if (initialIdx === -1) return;

    setDragActive(name);
    setDragOffsetY(0);
    setDragOverIdx(initialIdx);

    const onPointerMove = (moveEvt) => {
      moveEvt.preventDefault();
      const dy = moveEvt.clientY - startY;
      setDragOffsetY(dy);

      const ROW_H = 56;
      const step = Math.round(dy / ROW_H);
      const targetIdx = Math.max(0, Math.min(initialOrder.length - 1, initialIdx + step));
      setDragOverIdx(targetIdx);
    };

    const onPointerUp = (upEvt) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);

      const dy = upEvt.clientY - startY;
      const ROW_H = 56;
      const step = Math.round(dy / ROW_H);

      if (Math.abs(dy) < 6) {
        selectMarina(name);
      } else if (step !== 0) {
        const order = [...marinaOrderRef.current];
        const from = order.indexOf(name);
        if (from !== -1) {
          const to = Math.max(0, Math.min(order.length - 1, from + step));
          order.splice(from, 1);
          order.splice(to, 0, name);
          applyMarinaOrder(order);
        }
      }

      setDragActive(null);
      setDragOffsetY(0);
      setDragOverIdx(null);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function handleDragStart(e, name) {
    e.dataTransfer.setData("text/plain", name);
    e.dataTransfer.effectAllowed = "move";
    setDragActive(name);
  }

  function handleDragOver(e, i) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx !== i) setDragOverIdx(i);
  }

  function handleDrop(e, targetIdx) {
    e.preventDefault();
    const sourceName = e.dataTransfer.getData("text/plain") || dragActive;
    if (sourceName) {
      const order = [...marinaOrderRef.current];
      const from = order.indexOf(sourceName);
      if (from !== -1 && from !== targetIdx) {
        order.splice(from, 1);
        order.splice(targetIdx, 0, sourceName);
        applyMarinaOrder(order);
      }
    }
    setDragActive(null);
    setDragOverIdx(null);
  }

  function handleDragEnd() {
    setDragActive(null);
    setDragOverIdx(null);
  }

  // ── Backup & Restore ────────────────────────────────────────────────────────
  const restoreInputRef = useRef(null);
  const [restoreState, setRestoreState] = useState(null); // null | "ok" | "err"

  function exportBackup() {
    const backup = {
      version: "1.0",
      appId: "gonogo",
      exportedAt: new Date().toISOString(),
      data: {
        boat:        getStoredJson(STORAGE_KEYS.BOAT, null),
        trip:        getStoredJson(STORAGE_KEYS.TRIP, null),
        marinaOrder: getStoredJson(STORAGE_KEYS.MARINA_ORDER, null),
        subscription:getStoredJson(STORAGE_KEYS.SUBSCRIPTION, null),
        units:       getStoredJson(STORAGE_KEYS.UNITS, null),
      },
    };
    const json     = JSON.stringify(backup, null, 2);
    const blob     = new Blob([json], { type: "application/json" });
    const filename = `gonogo-backup-${new Date().toISOString().slice(0,10)}.json`;

    // Android / modern browsers: share as file → opens share sheet (Drive, Files, etc.)
    if (navigator.canShare) {
      const file = new File([blob], filename, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({ title: "GO / NO-GO Backup", files: [file] })
          .catch(err => { if (err.name !== "AbortError") fallbackDownload(blob, filename); });
        return;
      }
    }
    fallbackDownload(blob, filename);
  }

  function fallbackDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href    = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }

  function handleRestoreFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const backup = JSON.parse(ev.target.result);
        if (backup.appId !== "gonogo" || !backup.data) throw new Error("bad format");
        const { data } = backup;
        if (data.boat)         { setStoredJson(STORAGE_KEYS.BOAT, data.boat);                setBoat(data.boat); }
        if (data.trip)         { setStoredJson(STORAGE_KEYS.TRIP, data.trip);                setTrip(data.trip); }
        if (data.marinaOrder)  { setStoredJson(STORAGE_KEYS.MARINA_ORDER, data.marinaOrder); setMarinaOrder(data.marinaOrder); }
        if (data.subscription) { setStoredJson(STORAGE_KEYS.SUBSCRIPTION, data.subscription); setSubPlan(data.subscription); }
        if (data.units)        { setStoredJson(STORAGE_KEYS.UNITS, data.units);              setUnitSystem(data.units); }
        setRestoreState("ok");
      } catch {
        setRestoreState("err");
      }
      setTimeout(() => setRestoreState(null), 3500);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleSocialShare() {
    const shareUrl = "https://go-no-go-692246708745.europe-west1.run.app";
    const shareTitle = "GO / NO-GO — Marine Weather";
    const shareText = `Check today's boating conditions for ${boat.marina.name} with GO / NO-GO!\n${shareUrl}`;
    try {
      await Share.share({ title: shareTitle, text: shareText, url: shareUrl, dialogTitle: "Share GO / NO-GO" });
    } catch (err) {
      if (err?.message !== "Share canceled") copyShareLink(shareUrl);
    }
  }

  function copyShareLink(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2500);
      }).catch(() => {
        setShareToast(true);
        setTimeout(() => setShareToast(false), 2500);
      });
    } else {
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    }
  }

  // ── Header date string ────────────────────────────────────────────
  const dateLabel = (() => {
    const d = new Date(today+"T12:00:00");
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${d.toLocaleString("en",{month:"short"})}`;
  })();
  const updLabel = updatedAt 
    ? (isOffline ? `cached ${fmtTime(updatedAt)}` : `updated ${fmtTime(updatedAt)}`) 
    : loading 
      ? "fetching data…" 
      : "demo data";

  return (
    <div className="app-outer">
      <style>{FONTS+`
        html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#04101C}
        .app-outer{min-height:100dvh;background:#04101C;display:flex;justify-content:center;align-items:flex-start;padding:24px 12px;font-family:'IBM Plex Sans',sans-serif;box-sizing:border-box}
        .phone-frame{width:390px;max-width:100%;border-radius:28px;overflow:hidden;border:1px solid rgba(242,247,247,0.14);box-shadow:0 24px 60px rgba(0,0,0,.5);height:min(780px,calc(100dvh - 48px));display:flex;flex-direction:column;position:relative}
        @media(max-width:430px){
          .app-outer{padding:0;align-items:stretch}
          .phone-frame{width:100%;border-radius:0;height:100dvh;max-height:100dvh;box-shadow:none;border:none}
        }
        @keyframes drift{from{transform:translateX(0)}to{transform:translateX(-8%)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
        button:focus-visible{outline:2px solid ${C.foam};outline-offset:2px}
        .content-scroll::-webkit-scrollbar{display:none}
        .content-scroll{-ms-overflow-style:none;scrollbar-width:none}
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
      `}</style>

      {/* phone frame */}
      <div className="phone-frame" style={{background:C.ink,color:C.foam}}>
        {/* Top spacer — pushes content below Android status bar */}
        <div style={{height:insets.top,flexShrink:0,background:C.ink}} />

        {/* ── HEAD BACK SAFETY PROMPT OVERLAY (Triggers when offshore past return window) ── */}
        {shouldTriggerAlarm && (
          <div style={{
            position:"absolute",inset:0,zIndex:60,background:`rgba(12, 1, 1, 0.94)`,
            backdropFilter:"blur(12px)",display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",padding:"28px 24px",textAlign:"center"
          }}>
            <div style={{
              width:60,height:60,borderRadius:"50%",background:`${C.red}22`,border:`2px solid ${C.red}`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,marginBottom:16,
              animation:"pulse 1.2s infinite ease-in-out"
            }}>
              ⚓
            </div>
            
            <div style={{
              fontFamily:"'Archivo',sans-serif",fontWeight:800,fontStretch:"125%",
              fontSize:32,lineHeight:1.1,color:C.red,letterSpacing:"0.02em"
            }}>
              HEAD BACK FOR SAFETY
            </div>

            <div style={{fontSize:14,color:C.foam,marginTop:14,lineHeight:1.5,maxWidth:300}}>
              {deadlineReason}
            </div>

            <div style={{
              marginTop:12,padding:"8px 14px",borderRadius:10,background:`${C.red}18`,
              border:`1px solid ${C.red}44`,fontSize:12,color:C.foam,display:"inline-block"
            }}>
              📍 {distNm.toFixed(1)} nm from {boat.marina.name} · ~{travelMins} min cruise
            </div>

            {/* Acknowledge button: silences for 10 min, re-checks GPS if stationary */}
            <button
              type="button"
              onClick={handleAcknowledgeReturn}
              style={{
                marginTop:24,width:"100%",maxWidth:290,background:C.red,
                border:"none",borderRadius:14,padding:"14px 20px",color:C.foam,
                fontFamily:"'IBM Plex Sans',sans-serif",fontSize:15,fontWeight:700,
                cursor:"pointer",boxShadow:"0 8px 24px rgba(224, 86, 36, 0.4)",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8
              }}>
              <span>✓</span> Acknowledge &amp; Head Back
            </button>

            <div style={{display:"flex",gap:12,marginTop:12,alignItems:"center"}}>
              <button
                type="button"
                onClick={playFoghornSound}
                style={{
                  background:"transparent",border:"none",color:C.slate,
                  fontSize:11,textDecoration:"underline",cursor:"pointer",padding:4
                }}>
                🔊 Test foghorn sound
              </button>
              <span style={{color:C.hair}}>·</span>
              <button
                type="button"
                onClick={()=>setSoundEnabled(s=>!s)}
                style={{
                  background:"transparent",border:"none",color:soundEnabled?C.slate:C.amber,
                  fontSize:11,textDecoration:"underline",cursor:"pointer",padding:4
                }}>
                {soundEnabled ? "Mute horn" : "Unmute horn"}
              </button>
            </div>

            <div style={{fontSize:10,color:C.slate,marginTop:16,lineHeight:1.4,maxWidth:280,opacity:0.8}}>
              Pauses alert for 10 minutes while you get underway. If GPS detects the boat has not moved towards the marina, safety prompt will repeat.
            </div>
          </div>
        )}

        {/* header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"14px 20px 10px",flexShrink:0,gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
            {boat.boatPhoto && (
              <div
                onClick={()=>setScreen("boat")}
                title="View boat profile"
                style={{
                  width:34,height:34,borderRadius:8,overflow:"hidden",
                  border:`1px solid ${C.hair}`,flexShrink:0,cursor:"pointer"
                }}>
                <img src={boat.boatPhoto} alt="Boat" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              </div>
            )}
            <div style={{minWidth:0}}>
              <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,
                fontStretch:"125%",fontSize:15,letterSpacing:"0.04em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {boat.boatName ? boat.boatName.toUpperCase() : "GO / NO-GO"}
              </div>
              <div style={{fontSize:11,color:C.slate,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {boat.marina.name} · {dateLabel}
              </div>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
            <UnitToggle unitSystem={unitSystem} onChange={setUnitSystem} compact={true} />
            <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:10,
              color:C.slate,textAlign:"right",display:"flex",gap:8}}>
              <span>☀ {sunrise}</span>
              <span>☾ {sunset}</span>
              <span style={{color:loading?C.amber:C.slate}}>{updLabel}</span>
            </div>
          </div>
        </div>

        {/* scrollable content */}
        <div ref={contentRef} className="content-scroll" style={{flex:1,overflowY:"auto"}}>

          {/* ── TODAY ─────────────────────────────────────────────── */}
          {screen==="today"&&(
            <div style={{paddingTop:6}}>
              {/* Live GPS Coordinates & Location Status */}
              <GpsLocationStatus
                gps={gps}
                marina={boat.marina}
                onRetry={requestGps}
                rawDistNm={rawDistNm}
                isOffshore={isOffshore}
                isAtSlip={isAtSlip}
                boatName={boat.boatName}
                hullType={boat.hull}
              />

              {/* Banner: GPS detected far from home marina — offer to use local weather */}
              {gpsFarFromMarina && (
                <div style={{margin:"0 20px 10px",padding:"10px 13px",borderRadius:10,
                  background:`${C.amber}15`,border:`1px solid ${C.amber}55`,
                  display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                  <div style={{fontSize:11,color:C.foam,lineHeight:1.4,minWidth:0}}>
                    <span style={{color:C.amber,fontWeight:700}}>📍 You're not near {boat.marina.name}.</span>{" "}
                    Get local weather for your current position?
                  </div>
                  <button
                    type="button"
                    onClick={()=>{
                      if(gps&&!gps.error){
                        setBoat(b=>({...b,marina:{name:"My Location",lat:parseFloat(gps.lat.toFixed(5)),lon:parseFloat(gps.lon.toFixed(5))}}));
                      }
                    }}
                    style={{flexShrink:0,background:C.amber,border:"none",borderRadius:8,
                      padding:"6px 11px",color:C.ink,fontFamily:"'IBM Plex Sans',sans-serif",
                      fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                    Use my location
                  </button>
                </div>
              )}

              <div style={{background:`linear-gradient(180deg,${B.deep} 0%,${C.ink} 115%)`,
                padding:"26px 20px 0",transition:"background .4s"}}>
                <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontStretch:"125%",
                  fontSize:40,lineHeight:1.02,color:B.color,transition:"color .3s"}}>{B.name}</div>
                <p style={{fontSize:15,lineHeight:1.5,color:C.foam,margin:"12px 0 6px",maxWidth:330}}>
                  {sentence}
                </p>
                <div style={{fontSize:11,color:C.slate,marginBottom:4}}>
                  Conditions guidance only — the final call is always the skipper's.
                </div>
                <WaveDivider waveM={wave} periodS={period} color={B.color}/>
              </div>

              {/* timeline */}
              <div style={{padding:"16px 20px 6px"}}>
                <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",
                  color:C.slate,marginBottom:8}}>Your day on the water</div>
                <div style={{display:"flex",gap:3,height:34,borderRadius:8,overflow:"hidden"}}>
                  {bands.map((b,i)=>(
                    <div key={i} title={fmtHour(HOURS[i])}
                      onClick={()=>{setSelectedHour(i);setScreen("why");}}
                      style={{flex:1,background:BAND[b].color,
                        opacity:i===safenowIdx?1:0.55,position:"relative",cursor:"pointer"}}>
                      {i===safenowIdx&&<div style={{position:"absolute",inset:0,border:`2px solid ${C.foam}`,borderRadius:4}}/>}
                      {i===selectedHour&&i!==safenowIdx&&<div style={{position:"absolute",inset:0,border:"2px solid rgba(242,247,247,0.55)",borderRadius:4}}/>}
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",
                  fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:C.slate,marginTop:5}}>
                  <span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>20</span>
                </div>
                <div style={{fontSize:10,color:C.slate,marginTop:4,textAlign:"center"}}>tap any hour for details</div>
              </div>

              {/* return window */}
              {showReturnWindow ? (
                <div style={{padding:"4px 20px 4px"}}>
                  <div style={{background:urgency==="ok"?C.ink2:urgency==="amber"?`${C.amber}1A`:`${C.red}1A`,
                    borderRadius:12,padding:"12px 14px",
                    border:`1px solid ${urgency==="ok"?C.hair:urgency==="amber"?`${C.amber}66`:`${C.red}66`}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontSize:13,fontWeight:600,
                        color:urgency==="ok"?C.foam:urgency==="amber"?C.amber:C.red}}>
                        ⏱ Return by {fmtTime(latestDeparture)}
                      </div>
                      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,fontWeight:600,
                        color:urgency==="ok"?C.foam:urgency==="amber"?C.amber:C.red}}>
                        {isSnoozed 
                          ? `Alert snoozed (10m)`
                          : minsRemaining > 0 
                            ? `${minsRemaining} min left` 
                            : minsRemaining > -30 
                              ? "Window closing" 
                              : "Past planned return"}
                      </div>
                    </div>
                    <div style={{fontSize:11,color:C.slate,marginTop:5,lineHeight:1.4}}>
                      {isOffshore 
                        ? `${distNm.toFixed(1)} nm offshore · ` 
                        : isAtSlip 
                          ? `At ${boat.marina.name} slip · ` 
                          : "Planning for 5 nm day cruise · "}
                      {travelMins} min at {formatSpeed(cruiseSpeed, unitSystem).val} {formatSpeed(cruiseSpeed, unitSystem).unit} · 30 min buffer
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,paddingTop:6,borderTop:`1px solid ${C.hair}`}}>
                      <div style={{fontSize:10,color:C.slate,opacity:0.8}}>
                        {deadlineReason}
                      </div>
                      <button
                        type="button"
                        onClick={playFoghornSound}
                        title="Test sound"
                        style={{
                          background:"transparent",border:"none",color:C.slate,
                          fontSize:10,textDecoration:"underline",cursor:"pointer",padding:0
                        }}>
                        🔊 Test horn
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* day kit */}
              <div style={{padding:"14px 20px 0"}}>
                <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:C.slate,marginBottom:8}}>Day kit</div>
                <div style={{display:"flex",gap:8}}>
                  {[
                    {icon:"🌡",big:`${formatTemp(airTemp,unitSystem).val}${formatTemp(airTemp,unitSystem).unit}`,small:sstLabel},
                    {icon:"🌧",big:rainProb>=50?"Rain":"Dry", small:rainLabel},
                    {icon:"☀",big:`UV ${uv}`, small:`${uv>=8?"Sunscreen essential — reapply after swims":uv>=5?"Use sunscreen":"Low UV today"}`, hot:uv>=8},
                  ].map(t=>(
                    <div key={t.icon} style={{flex:1,background:C.ink2,borderRadius:12,padding:"10px 10px 9px",
                      border:t.hot?`1px solid ${C.amber}55`:`1px solid transparent`}}>
                      <div style={{fontSize:13}}>{t.icon}{" "}
                        <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:15,color:t.hot?C.amber:C.foam}}>{t.big}</span>
                      </div>
                      <div style={{fontSize:10.5,lineHeight:1.35,color:C.slate,marginTop:4}}>{t.small}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* trip chips */}
              <div style={{padding:"14px 20px 28px"}}>
                <Field label="Aboard today">
                  {CREW.map(c=><Chip key={c} label={c} active={trip.crew===c} tone={B.color} onClick={()=>setTrip({...trip,crew:c})}/>)}
                </Field>
                <Field label="Plan">
                  {ACTIVITY.map(a=><Chip key={a} label={a} active={trip.activity===a} tone={B.color} onClick={()=>setTrip({...trip,activity:a})}/>)}
                </Field>
              </div>
            </div>
          )}

          {/* ── PLAN ──────────────────────────────────────────────── */}
          {screen==="plan"&&(
            <div style={{padding:"10px 20px 24px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:2}}>
                <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontStretch:"125%",fontSize:22}}>Next 10 days</div>
                <div style={{fontSize:11,color:C.slate,fontFamily:"'IBM Plex Mono',monospace"}}>
                  {unitSystem === "metric" ? "km/h · meters" : "knots · feet"}
                </div>
              </div>
              <p style={{fontSize:13,color:C.slate,margin:"0 0 14px"}}>
                For your {boat.hull.toLowerCase()}{trip.crew==="Kids aboard"?" with kids aboard":""}.{" "}
                Bars fade as forecasts get less certain.
              </p>
              {adjDays.map((day,i)=>{
                const isBest=i===bestDayIdx;
                const wObj = formatWind(day.wMax, unitSystem);
                const hObj = formatWave(day.hMax, unitSystem);
                return (
                  <div key={day.d||i}
                    onClick={()=>setPlanDayPopup(i)}
                    style={{display:"flex",alignItems:"center",gap:12,
                    padding:"9px 10px",borderRadius:10,marginBottom:4,cursor:"pointer",
                    background:isBest?`${C.green}14`:"transparent",
                    border:isBest?`1px solid ${C.green}55`:`1px solid transparent`}}>
                    <div style={{width:52,fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:C.foam}}>{day.d}</div>
                    <div style={{flex:1,display:"flex",gap:3,height:20,opacity:day.conf===3?1:day.conf===2?0.7:0.45}}>
                      <div title="Morning" style={{flex:1,borderRadius:"5px 0 0 5px",background:BAND[day.am].color}}/>
                      <div title="Afternoon" style={{flex:1,borderRadius:"0 5px 5px 0",background:BAND[day.pm].color}}/>
                    </div>
                    <div style={{width:104,textAlign:"right",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:C.slate,whiteSpace:"nowrap"}}>
                      {wObj.val} {wObj.unit} · {hObj.val} {hObj.unit}
                    </div>
                  </div>
                );
              })}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.slate,margin:"6px 10px 0"}}>
                <span>◧ morning · afternoon ◨</span><span>faded = lower confidence</span>
              </div>
              <div style={{marginTop:14,padding:14,borderRadius:12,background:C.ink2,fontSize:13,lineHeight:1.55}}>
                <span style={{color:C.green,fontWeight:600}}>Best window: </span>
                {adjDays[bestDayIdx]?.d} — lowest wind and wave in the next 10 days for your setup.
                {" "}Days 8–10 are an outlook — recheck as they approach.
              </div>
            </div>
          )}

          {/* ── WHY? ──────────────────────────────────────────────── */}
          {screen==="why"&&(
            <div style={{padding:"10px 20px 24px"}}>
              <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontStretch:"125%",fontSize:22,color:selB.color,marginBottom:4}}>
                Why {selB.word} at {fmtHour(HOURS[selectedHour])}
              </div>
              <p style={{fontSize:13,color:C.slate,margin:"0 0 10px"}}>
                Verdicts compare each hour's forecast against limits set by your boat, your crew and your plan. The worst factor decides.
              </p>
              {(() => {
                const wObj = formatWind(selWind, unitSystem);
                const gObj = formatWind(selGust, unitSystem);
                const hObj = formatWave(selWave, unitSystem);
                const vObj = formatVis(selVis, unitSystem);
                return (
                  <>
                    <Row label="Wind"           value={wObj.val}           unit={wObj.unit}/>
                    <Row label="Wind direction" value={cardinal(selDir)}   unit={`(${selDir}°)`}/>
                    <Row label="Gusts"          value={gObj.val}           unit={gObj.unit} warn={selGust>selWind*1.5}/>
                    <Row label="Wave height"    value={hObj.val}           unit={hObj.unit}/>
                    <Row label="Wave period"    value={selPeriod}          unit="s"  warn={selPeriod<=4}/>
                    <Row label="Visibility"     value={vObj.val}           unit={vObj.unit}/>
                  </>
                );
              })()}
              <div style={{marginTop:16,padding:14,borderRadius:12,background:C.ink2,fontSize:13,lineHeight:1.55,color:C.foam}}>
                <span style={{color:selB.color,fontWeight:600}}>Reading the sea: </span>
                {selPeriod<=4
                  ? "Short wave periods mean tight, steep chop — far rougher than the height alone suggests."
                  : "Longer wave periods mean rolling, spaced-out water — comfortable even when the height number looks similar."}
                {" "}This afternoon the westerly sea breeze builds, the period shortens, and conditions
                turn against small open boats — a classic summer pattern on this coast.
              </div>
              <div style={{marginTop:12,fontSize:11,color:C.slate}}>Tap any hour on the Today timeline to compare conditions across the day.</div>
            </div>
          )}

          {/* ── MY BOAT ───────────────────────────────────────────── */}
          {screen==="boat"&&(
            <div style={{padding:"10px 20px 24px"}}>
              <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontStretch:"125%",fontSize:22,marginBottom:14}}>My boat &amp; profile</div>

              {/* Vessel Photo (Local storage only, zero server footprint) */}
              <div style={{marginBottom:18,borderRadius:14,border:`1px solid ${C.hair}`,padding:14,background:C.ink2}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:C.slate,fontWeight:600}}>
                    Boat Photo (Local device only)
                  </div>
                  {boat.boatPhoto && (
                    <button
                      type="button"
                      onClick={()=>setBoat({...boat,boatPhoto:null})}
                      style={{background:"transparent",border:"none",color:C.red,fontSize:11,cursor:"pointer",padding:0}}>
                      Remove
                    </button>
                  )}
                </div>

                {boat.boatPhoto ? (
                  <div style={{position:"relative",borderRadius:10,overflow:"hidden",aspectRatio:"16/9",border:`1px solid ${C.hair}`}}>
                    <img
                      src={boat.boatPhoto}
                      alt="My boat"
                      style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                    />
                  </div>
                ) : (
                  <label style={{
                    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                    gap:8,padding:"20px 14px",borderRadius:10,border:`1px dashed ${C.slate}55`,
                    background:"rgba(255,255,255,0.02)",cursor:"pointer"
                  }}>
                    <span style={{fontSize:24}}>📷</span>
                    <span style={{fontSize:12,color:C.foam,fontWeight:500}}>Select boat photo from device</span>
                    <span style={{fontSize:10,color:C.slate}}>Stored privately on phone/browser only</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{display:"none"}}
                      onChange={(e)=>{
                        const file = e.target.files?.[0];
                        if(!file) return;
                        // Compress/resize into client data URL
                        const reader = new FileReader();
                        reader.onload = (re) => {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement("canvas");
                            const maxDim = 800;
                            let w = img.width;
                            let h = img.height;
                            if (w > maxDim || h > maxDim) {
                              if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                              else { w = Math.round((w * maxDim) / h); h = maxDim; }
                            }
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext("2d");
                            ctx?.drawImage(img, 0, 0, w, h);
                            const compressedData = canvas.toDataURL("image/jpeg", 0.75);
                            setBoat(b=>({...b, boatPhoto: compressedData}));
                          };
                          img.src = re.target?.result;
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Vessel Identification */}
              <div style={{marginBottom:18,borderRadius:14,border:`1px solid ${C.hair}`,padding:14,background:"#061624"}}>
                <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:C.slate,marginBottom:12,fontWeight:600}}>
                  Vessel Identification
                </div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:C.slate,marginBottom:4}}>Boat name</div>
                    <input
                      type="text"
                      placeholder="e.g. Sea Breeze"
                      value={boat.boatName || ""}
                      onChange={e=>setBoat({...boat,boatName:e.target.value})}
                      style={INPUT}
                    />
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:C.slate,marginBottom:4}}>Registration / SSR #</div>
                    <input
                      type="text"
                      placeholder="e.g. CY-12345"
                      value={boat.regNumber || ""}
                      onChange={e=>setBoat({...boat,regNumber:e.target.value})}
                      style={INPUT}
                    />
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.slate,marginBottom:4}}>VHF Call Sign / MMSI</div>
                  <input
                    type="text"
                    placeholder="e.g. 5B1234 / 209123456"
                    value={boat.vhfCallSign || ""}
                    onChange={e=>setBoat({...boat,vhfCallSign:e.target.value})}
                    style={INPUT}
                  />
                </div>
              </div>

              {/* Emergency Contact & Owner Info */}
              <div style={{marginBottom:18,borderRadius:14,border:`1px solid ${C.hair}`,padding:14,background:"#061624"}}>
                <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:C.slate,marginBottom:12,fontWeight:600}}>
                  Owner &amp; Emergency Contact
                </div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:C.slate,marginBottom:4}}>Owner name</div>
                    <input
                      type="text"
                      placeholder="Full name"
                      value={boat.ownerName || ""}
                      onChange={e=>setBoat({...boat,ownerName:e.target.value})}
                      style={INPUT}
                    />
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:C.slate,marginBottom:4}}>Email address</div>
                    <input
                      type="email"
                      placeholder="skipper@example.com"
                      value={boat.email || ""}
                      onChange={e=>setBoat({...boat,email:e.target.value})}
                      style={INPUT}
                    />
                  </div>
                </div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:C.slate,marginBottom:4}}>Skipper phone</div>
                    <input
                      type="tel"
                      placeholder="+357 99 000000"
                      value={boat.phone || ""}
                      onChange={e=>setBoat({...boat,phone:e.target.value})}
                      style={INPUT}
                    />
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:10,color:C.slate,marginBottom:4}}>Emergency contact phone</div>
                    <input
                      type="tel"
                      placeholder="Shore contact"
                      value={boat.emergencyPhone || ""}
                      onChange={e=>setBoat({...boat,emergencyPhone:e.target.value})}
                      style={INPUT}
                    />
                  </div>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.slate,marginBottom:4}}>Home / Marina slip address (for SAR emergency)</div>
                  <input
                    type="text"
                    placeholder="Slip # / Address"
                    value={boat.address || ""}
                    onChange={e=>setBoat({...boat,address:e.target.value})}
                    style={INPUT}
                  />
                </div>
              </div>

              {/* Measurement Units */}
              <div style={{marginBottom:18,borderRadius:14,border:`1px solid ${C.hair}`,padding:14,background:C.ink2}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:C.slate,fontWeight:600}}>
                    Measurement Units
                  </div>
                  <span style={{fontSize:9,padding:"2px 8px",borderRadius:999,background:`${C.green}2A`,color:C.green,fontWeight:600}}>
                    {unitSystem === "metric" ? "METRIC (m, km/h)" : "IMPERIAL (ft, kn)"}
                  </span>
                </div>
                <div style={{fontSize:12,color:C.slate,marginBottom:12,lineHeight:1.4}}>
                  Wind speed in {unitSystem === "metric" ? "km/h" : "knots"} (kn), wave height in {unitSystem === "metric" ? "meters (m)" : "feet (ft)"}.
                </div>
                <UnitToggle unitSystem={unitSystem} onChange={setUnitSystem} />
              </div>

              <Field label="Hull type">
                {HULLS.map(h=><Chip key={h} label={h} active={boat.hull===h} tone={C.green} onClick={()=>setBoat({...boat,hull:h})}/>)}
              </Field>

              <Field label={unitSystem === "metric" ? `Length — ${boat.length.toFixed(1)} m` : `Length — ${(boat.length * 3.28084).toFixed(1)} ft (${boat.length.toFixed(1)} m)`}>
                <input type="range" min="3.5" max="12" step="0.1" value={boat.length}
                  onChange={e=>setBoat({...boat,length:parseFloat(e.target.value)})}
                  style={{width:"100%",accentColor:C.green}}/>
                <div style={{display:"flex",justifyContent:"space-between",width:"100%",
                  fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:C.slate,marginTop:2}}>
                  <span>{formatLength(3.5, unitSystem).val} {formatLength(3.5, unitSystem).unit}</span>
                  <span>{formatLength(12, unitSystem).val} {formatLength(12, unitSystem).unit}</span>
                </div>
              </Field>

              <Field label="Skipper experience">
                {SKIPPER.map(s=><Chip key={s} label={s} active={boat.skipper===s} tone={C.green} onClick={()=>setBoat({...boat,skipper:s})}/>)}
              </Field>

              <Field label={unitSystem === "metric" ? `Cruise speed — ${Math.round(boat.speed * 1.852)} km/h (${boat.speed} kn)` : `Cruise speed — ${boat.speed} kn`}>
                <input type="range" min="5" max="40" step="1" value={boat.speed}
                  onChange={e=>setBoat({...boat,speed:parseInt(e.target.value)})}
                  style={{width:"100%",accentColor:C.green}}/>
                <div style={{display:"flex",justifyContent:"space-between",width:"100%",
                  fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:C.slate,marginTop:2}}>
                  <span>{formatSpeed(5, unitSystem).val} {formatSpeed(5, unitSystem).unit}</span>
                  <span>{formatSpeed(40, unitSystem).val} {formatSpeed(40, unitSystem).unit}</span>
                </div>
              </Field>

              <div style={{marginBottom:18}}>
                <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:C.slate,marginBottom:6}}>Home marina</div>
                <div style={{fontSize:11,color:C.slate,marginBottom:10,opacity:0.7}}>Tap to select · drag ☰ to reorder · ▲/▼ to shift</div>

                {/* Draggable & selectable marina list */}
                <div style={{borderRadius:12,overflow:"hidden",border:`1px solid ${C.hair}`,marginBottom:10,background:"#061624"}}>
                  {marinaOrder.map((name,i)=>{
                    const m = MARINAS.find(x=>x.name===name);
                    if(!m) return null;
                    const isHome     = i===0;
                    const isDragging = dragActive===name;
                    const isTarget   = dragOverIdx===i && dragActive && !isDragging;

                    return (
                      <div key={name}
                        onClick={()=>selectMarina(name)}
                        onDragOver={(e)=>handleDragOver(e,i)}
                        onDrop={(e)=>handleDrop(e,i)}
                        style={{
                          display:"flex",alignItems:"center",gap:8,padding:"10px 12px",
                          background:isDragging?`${C.green}33`:isTarget?`${C.green}18`:isHome?`${C.green}12`:"transparent",
                          borderBottom:i<marinaOrder.length-1?`1px solid ${C.hair}`:"none",
                          borderLeft:isHome?`3px solid ${C.green}`:"3px solid transparent",
                          transform:isDragging?`translateY(${dragOffsetY}px)`:"none",
                          transition:isDragging?"none":"transform 0.15s ease, background 0.15s ease",
                          zIndex:isDragging?20:1,
                          position:"relative",
                          opacity:isDragging?0.9:1,
                          cursor:"pointer",
                          userSelect:"none"
                        }}>
                        
                        {/* drag handle with pointer & html5 drag */}
                        <div
                          draggable={true}
                          onDragStart={(e)=>handleDragStart(e,name)}
                          onDragEnd={handleDragEnd}
                          onPointerDown={(e)=>handlePointerDown(e,name)}
                          title="Drag to reorder"
                          style={{
                            fontSize:18,color:isDragging?C.green:C.slate,cursor:"grab",
                            userSelect:"none",touchAction:"none",padding:"6px 8px",
                            lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",
                            borderRadius:6,background:isDragging?`${C.green}2A`:"transparent"
                          }}>
                          ☰
                        </div>

                        {/* marina info */}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:isHome?600:400,color:isHome?C.foam:C.slate,display:"flex",alignItems:"center",gap:6}}>
                            <span>{name}</span>
                            {isHome && (
                              <span style={{
                                fontSize:9,letterSpacing:"0.06em",textTransform:"uppercase",
                                background:`${C.green}2A`,color:C.green,borderRadius:999,
                                padding:"2px 7px",fontWeight:600
                              }}>Home</span>
                            )}
                          </div>
                          {m.lat&&<div style={{fontSize:10,color:C.slate,opacity:0.6,fontFamily:"'IBM Plex Mono',monospace",marginTop:2}}>
                            {m.lat.toFixed(4)}, {m.lon.toFixed(4)}
                          </div>}
                        </div>

                        {/* up / down arrow controls for quick reordering */}
                        <div style={{display:"flex",flexDirection:"column",gap:2}} onClick={(e)=>e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={i===0}
                            onClick={()=>moveMarina(name,-1)}
                            title="Move up"
                            style={{
                              background:"transparent",border:"none",color:i===0?"rgba(124,153,173,0.2)":C.slate,
                              fontSize:10,padding:"2px 4px",cursor:i===0?"default":"pointer",lineHeight:1
                            }}>
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={i===marinaOrder.length-1}
                            onClick={()=>moveMarina(name,1)}
                            title="Move down"
                            style={{
                              background:"transparent",border:"none",color:i===marinaOrder.length-1?"rgba(124,153,173,0.2)":C.slate,
                              fontSize:10,padding:"2px 4px",cursor:i===marinaOrder.length-1?"default":"pointer",lineHeight:1
                            }}>
                            ▼
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

                {/* Custom / GPS row */}
                <div style={{padding:"11px 14px",borderRadius:12,border:`1px solid ${C.hair}`,marginBottom:8}}>
                  <div style={{fontSize:11,color:C.slate,marginBottom:8,fontWeight:600}}>Custom location</div>
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    <input type="number" value={boat.marina.lat??""} step="0.00001" placeholder="Latitude"
                      onChange={e=>setMarina("lat")(parseFloat(e.target.value))}
                      style={{...INPUT,flex:1}}/>
                    <input type="number" value={boat.marina.lon??""} step="0.00001" placeholder="Longitude"
                      onChange={e=>setMarina("lon")(parseFloat(e.target.value))}
                      style={{...INPUT,flex:1}}/>
                  </div>
                  <button onClick={captureGPSForMarina} disabled={marinaGpsLoading}
                    style={{width:"100%",background:`${C.green}1A`,border:`1px solid ${C.green}55`,
                      borderRadius:10,padding:"11px 0",color:C.green,
                      fontFamily:"'IBM Plex Sans',sans-serif",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                    {marinaGpsLoading?"Getting location…":"📍 Set from current GPS location"}
                  </button>
                </div>

              {/* Subscription & Pricing */}
              <div style={{marginTop:16,marginBottom:18,borderRadius:14,border:`1px solid ${C.hair}`,padding:14,background:C.ink2}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:C.slate,fontWeight:600}}>
                    Go / No-Go Skipper Plan
                  </div>
                  <span style={{fontSize:9,padding:"2px 8px",borderRadius:999,background:`${C.green}2A`,color:C.green,fontWeight:600}}>
                    {subPlan==="yearly" ? "BEST VALUE" : "ACTIVE"}
                  </span>
                </div>

                <div style={{fontSize:12,color:C.slate,marginBottom:12,lineHeight:1.4}}>
                  Includes unlimited marine forecasts, continuous swell chop analysis, and live return window countdown alerts.
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  <div
                    onClick={()=>setSubPlan("monthly")}
                    style={{
                      padding:"12px 10px",borderRadius:10,cursor:"pointer",textAlign:"center",
                      border:subPlan==="monthly"?`2px solid ${C.green}`:`1px solid ${C.hair}`,
                      background:subPlan==="monthly"?`${C.green}15`:"transparent",
                      transition:"all 0.15s ease"
                    }}>
                    <div style={{fontSize:11,color:C.slate,marginBottom:2}}>Monthly</div>
                    <div style={{fontSize:16,fontWeight:700,color:C.foam}}>$1.99</div>
                    <div style={{fontSize:10,color:C.slate,opacity:0.7}}>/ month</div>
                  </div>

                  <div
                    onClick={()=>setSubPlan("yearly")}
                    style={{
                      padding:"12px 10px",borderRadius:10,cursor:"pointer",textAlign:"center",
                      border:subPlan==="yearly"?`2px solid ${C.green}`:`1px solid ${C.hair}`,
                      background:subPlan==="yearly"?`${C.green}15`:"transparent",
                      transition:"all 0.15s ease",position:"relative"
                    }}>
                    <div style={{fontSize:11,color:C.slate,marginBottom:2}}>Annual</div>
                    <div style={{fontSize:16,fontWeight:700,color:C.green}}>$19.00</div>
                    <div style={{fontSize:10,color:C.slate,opacity:0.7}}>($1.58 / mo)</div>
                  </div>
                </div>

                <div style={{fontSize:10,color:C.slate,textAlign:"center",opacity:0.75}}>
                  Standard in-app billing · Cancel anytime
                </div>
              </div>

              <div style={{marginTop:8,padding:14,borderRadius:12,background:C.ink2,fontSize:13,lineHeight:1.55,color:C.slate}}>
                Set once. Every verdict is calculated for{" "}
                <span style={{color:C.foam}}>this boat and this skipper</span> — a 4 m bowrider and a 9 m cruiser get different answers to the same sea.
              </div>

              {/* ── Backup & Restore ─────────────────────────────── */}
              <div style={{marginTop:16,marginBottom:8,borderRadius:14,border:`1px solid ${C.hair}`,padding:14,background:C.ink2}}>
                <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:C.slate,fontWeight:600,marginBottom:6}}>
                  Backup &amp; Restore
                </div>
                <div style={{fontSize:12,color:C.slate,marginBottom:14,lineHeight:1.5}}>
                  Save your boat profile as a file — restore it any time, on any phone. No account needed.
                </div>

                <div style={{display:"flex",gap:8}}>
                  <button
                    type="button"
                    onClick={exportBackup}
                    style={{flex:1,background:`${C.green}1A`,border:`1px solid ${C.green}55`,borderRadius:10,
                      padding:"11px 10px",color:C.green,fontFamily:"'IBM Plex Sans',sans-serif",
                      fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",
                      justifyContent:"center",gap:6}}>
                    <span>⬆</span> Back up data
                  </button>
                  <button
                    type="button"
                    onClick={()=>restoreInputRef.current?.click()}
                    style={{flex:1,background:`${C.amber}15`,border:`1px solid ${C.amber}44`,borderRadius:10,
                      padding:"11px 10px",color:C.amber,fontFamily:"'IBM Plex Sans',sans-serif",
                      fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",
                      justifyContent:"center",gap:6}}>
                    <span>⬇</span> Restore backup
                  </button>
                </div>

                {/* Hidden file input for restore */}
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept=".json,application/json"
                  style={{display:"none"}}
                  onChange={handleRestoreFile}
                />

                {restoreState === "ok" && (
                  <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:`${C.green}1A`,
                    border:`1px solid ${C.green}55`,fontSize:12,color:C.green,fontWeight:600,textAlign:"center"}}>
                    ✓ Profile restored successfully
                  </div>
                )}
                {restoreState === "err" && (
                  <div style={{marginTop:10,padding:"8px 12px",borderRadius:8,background:`${C.red}1A`,
                    border:`1px solid ${C.red}55`,fontSize:12,color:C.red,fontWeight:600,textAlign:"center"}}>
                    ✗ Could not read backup file — check it's a GO / NO-GO backup
                  </div>
                )}

                <div style={{marginTop:10,fontSize:10,color:C.slate,lineHeight:1.4,opacity:0.75}}>
                  Your data never leaves your device unless you choose to share it. Save to Google Drive, email it to yourself, or store in Files.
                </div>
              </div>

              <button onClick={()=>setScreen("legal")}
                style={{marginTop:16,width:"100%",background:"transparent",
                  border:`1px solid ${C.hair}`,borderRadius:10,padding:"12px 0",
                  fontFamily:"'IBM Plex Sans',sans-serif",fontSize:12,color:C.slate,cursor:"pointer"}}>
                Legal, Terms &amp; Privacy Policy
              </button>
            </div>
          )}

          {/* ── LEGAL ─────────────────────────────────────────────── */}
          {screen==="legal"&&(
            <div style={{padding:"10px 20px 32px"}}>
              <button onClick={()=>setScreen("boat")}
                style={{background:"transparent",border:"none",color:C.slate,
                  fontFamily:"'IBM Plex Sans',sans-serif",fontSize:13,cursor:"pointer",
                  padding:"4px 0 16px",display:"flex",alignItems:"center",gap:6}}>
                ← Back
              </button>
              <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontStretch:"125%",fontSize:20,marginBottom:4}}>
                Legal &amp; Privacy
              </div>
              <div style={{fontSize:10,color:C.slate,marginBottom:20}}>Last updated: 16 August 2026</div>
              {[
                {title:"1. What this app is — and is not",body:"GO / NO-GO provides weather and sea-condition guidance for recreational powerboaters. It is a decision-support tool only. It is not a navigation system, not a certified safety service, and not a substitute for proper seamanship, local knowledge, or professional maritime advice.\n\nEvery verdict is generated automatically using third-party forecast data. No verdict constitutes permission, clearance, or a professional recommendation to launch or remain ashore.\n\nTHE SKIPPER'S JUDGEMENT IS ALWAYS FINAL AND ALWAYS SOLE."},
                {title:"2. Disclaimer of liability",body:"To the fullest extent permitted by applicable law, GO / NO-GO and its developer(s) accept no liability whatsoever for:\n\n(a) any injury, death, loss, or damage arising from decisions made using this application;\n(b) inaccurate, delayed, or missing forecast data;\n(c) failure or unavailability of the application or any connected data source;\n(d) conditions that differ materially from those forecast.\n\nYou use this application entirely at your own risk.",warn:true},
                {title:"3. Data sources & third-party providers",body:"Forecast data is obtained from independent third-party providers including Open-Meteo (open-meteo.com) and Copernicus Marine Service. GO / NO-GO has no control over their accuracy or availability. All data is provided \"as received\" without modification."},
                {title:"4. No warranty",body:"This application is provided \"as is\" without warranty of any kind. Marine forecasts are inherently probabilistic. Conditions can and do change faster than any model can predict."},
                {title:"5. Privacy policy",body:"GO / NO-GO does not collect, store, transmit, or share any personal data. Your boat profile is stored locally on your device only and is never sent to any server. Location data is used solely to fetch weather forecasts and calculate your distance from your home marina."},
                {title:"6. Governing law",body:"These terms are governed by the laws of the Republic of Cyprus and, where applicable, European Union law including GDPR."},
              ].map(s=>(
                <div key={s.title} style={{marginBottom:22}}>
                  <div style={{fontSize:12,fontWeight:600,color:s.warn?C.amber:C.foam,marginBottom:7}}>{s.title}</div>
                  <div style={{fontSize:12,lineHeight:1.7,color:C.slate,whiteSpace:"pre-line"}}>{s.body}</div>
                </div>
              ))}
            </div>
          )}

        </div>{/* end scrollable content */}

        {/* nav */}
        <div style={{display:"flex",borderTop:`1px solid ${C.hair}`,flexShrink:0,background:"#061320"}}>
          {nav.map(n=>(
            <button key={n.id} onClick={()=>setScreen(n.id)} style={{
              flex:1,padding:"14px 0",background:"transparent",border:"none",
              fontFamily:"'IBM Plex Sans',sans-serif",fontSize:13,fontWeight:600,
              color:screen===n.id?C.foam:C.slate,cursor:"pointer",
              borderTop:screen===n.id?`2px solid ${B.color}`:"2px solid transparent"}}>
              {n.label}
            </button>
          ))}
          <button
            onClick={handleSocialShare}
            title="Share app with boating friends"
            style={{
              flex:1.1,padding:"14px 0",background:"transparent",border:"none",
              fontFamily:"'IBM Plex Sans',sans-serif",fontSize:13,fontWeight:800,
              color:C.green,cursor:"pointer",display:"flex",alignItems:"center",
              justifyContent:"center",gap:5,borderTop:"2px solid transparent",
              transition:"opacity 0.15s ease"
            }}>
            <span style={{fontSize:13}}>↗</span>
            <span style={{fontWeight:800,letterSpacing:"0.01em"}}>Share</span>
          </button>
        </div>
        {/* Bottom spacer — pushes nav above Android navigation bar */}
        <div style={{height:insets.bottom,flexShrink:0,background:"#061320"}} />

        {/* Share toast confirmation */}
        {shareToast && (
          <div style={{
            position:"absolute",bottom:60,left:"50%",transform:"translateX(-50%)",
            background:C.ink,border:`1px solid ${C.green}`,color:C.foam,
            padding:"8px 16px",borderRadius:999,fontSize:12,fontWeight:600,
            display:"flex",alignItems:"center",gap:6,boxShadow:"0 8px 24px rgba(0,0,0,0.6)",
            zIndex:99,pointerEvents:"none",animation:"pulse 0.3s ease"
          }}>
            <span style={{color:C.green}}>✓</span> Link copied to clipboard!
          </div>
        )}

        {/* Plan day hourly popup */}
        {planDayPopup != null && (
          <div onClick={()=>setPlanDayPopup(null)}
            style={{position:"absolute",inset:0,background:"rgba(6,19,32,0.82)",
              display:"flex",alignItems:"flex-end",zIndex:200,backdropFilter:"blur(4px)"}}>
            <div onClick={e=>e.stopPropagation()}
              style={{width:"100%",maxHeight:"75%",background:C.ink,borderRadius:"20px 20px 0 0",
                display:"flex",flexDirection:"column",overflow:"hidden"}}>
              {/* header */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                padding:"16px 20px 12px",borderBottom:`1px solid ${C.hair}`,flexShrink:0}}>
                <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontStretch:"125%",fontSize:18,color:C.foam}}>
                  {adjDays[planDayPopup]?.d} — Hourly
                </div>
                <button onClick={()=>setPlanDayPopup(null)}
                  style={{background:"transparent",border:"none",color:C.slate,fontSize:22,cursor:"pointer",lineHeight:1,padding:4}}>×</button>
              </div>
              {/* colour bar */}
              {popupHourly && (
                <div style={{display:"flex",height:18,margin:"12px 20px 4px",borderRadius:6,overflow:"hidden",flexShrink:0}}>
                  {popupHourly.map(row=>(
                    <div key={row.h} style={{flex:1,background:BAND[row.band].color,opacity:0.9}}/>
                  ))}
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",padding:"0 20px 8px",fontSize:10,color:C.slate,flexShrink:0}}>
                <span>{fmtHour(HOURS[0])}</span><span>{fmtHour(HOURS[Math.floor(HOURS.length/2)])}</span><span>{fmtHour(HOURS[HOURS.length-1])}</span>
              </div>
              {/* hour list */}
              <div style={{overflowY:"auto",padding:"0 20px 24px"}}>
                {(popupHourly||[]).map(row=>{
                  const wObj=formatWind(row.wind,unitSystem);
                  const gObj=formatWind(row.gust,unitSystem);
                  const hObj=formatWave(row.wave,unitSystem);
                  const b=BAND[row.band];
                  return (
                    <div key={row.h} style={{display:"flex",alignItems:"center",gap:10,
                      padding:"7px 0",borderBottom:`1px solid ${C.hair}`}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:b.color,flexShrink:0}}/>
                      <div style={{width:42,fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:C.foam,flexShrink:0}}>
                        {fmtHour(row.h)}
                      </div>
                      <div style={{flex:1,fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:C.slate}}>
                        {wObj.val}↑{gObj.val} {wObj.unit} · {hObj.val} {hObj.unit} · {row.period}s
                      </div>
                      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,fontWeight:600,color:b.color,flexShrink:0}}>
                        {b.word}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
