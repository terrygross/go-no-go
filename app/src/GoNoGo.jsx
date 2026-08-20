import { useState, useMemo, useEffect, useRef } from "react";

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

const HULLS   = ["RIB", "Bowrider", "Cabin cruiser", "PWC"];
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
    "RIB":           { w:[12,17], h:[0.5,0.9] },
    "Bowrider":      { w:[10,14], h:[0.4,0.7] },
    "Cabin cruiser": { w:[14,19], h:[0.7,1.1] },
    "PWC":           { w:[11,15], h:[0.4,0.8] },
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
  const gustFactor = gust > wind * 1.5 ? 0.9 : 1;
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

// ── Main component ─────────────────────────────────────────────────────────────
export default function GoNoGo() {
  const [screen, setScreen]   = useState("today");
  const [boat, setBoat]       = useState({
    hull:"Bowrider", length:5.5, skipper:"Confident", speed:20,
    marina:{ name:"Latchi Marina", lat:35.0294, lon:32.3842 },
  });
  const [trip, setTrip]       = useState({ crew:"Adults", activity:"Pottering the bay" });
  const [selectedHour, setSelectedHour] = useState(HOURS.indexOf(8));

  // Live data state
  const [liveData, setLiveData]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

  // GPS & alarm
  const [gps, setGps]                   = useState(null);
  const [alarmDismissed, setAlarmDismissed] = useState(false);
  const [currentTime, setCurrentTime]   = useState(new Date());
  const [marinaGpsLoading, setMarinaGpsLoading] = useState(false);
  const [marinaOrder, setMarinaOrder] = useState(
    MARINAS.filter(m=>m.name!=="Custom").map(m=>m.name)
  );
  const marinaOrderRef = useRef(marinaOrder);
  const [dragActive, setDragActive] = useState(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const marinaListRef = useRef(null);
  const dragState = useRef({ name: null, startY: 0, currentY: 0 });

  const contentRef = useRef(null);
  useEffect(()=>{ if(contentRef.current) contentRef.current.scrollTop=0; },[screen]);

  // Live clock
  useEffect(()=>{ const t=setInterval(()=>setCurrentTime(new Date()),30000); return()=>clearInterval(t); },[]);

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
    const {lat,lon}=boat.marina;
    if(!lat||!lon) return;
    setLoading(true);
    fetchLiveData(lat,lon)
      .then(data=>{
        setLiveData(data);
        setUpdatedAt(new Date());
        // Update selectedHour to real current hour
        const idx = HOURS.indexOf(data.nowHour);
        if(idx >= 0) setSelectedHour(idx);
      })
      .catch(()=>{ /* silent — falls back to DEMO data */ })
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

  // Return window
  const liveGps = gps&&!gps.error?gps:null;
  const distNm  = liveGps ? haversineNm(liveGps.lat,liveGps.lon,boat.marina.lat,boat.marina.lon) : null;
  const travelMins = distNm!=null ? Math.max(1,Math.ceil((distNm/boat.speed)*60)) : null;
  const simMinsUntilChange = changeIdx>-1 ? (HOURS[changeIdx]-nowHour)*60 : null;
  const minsRemaining = simMinsUntilChange!=null&&travelMins!=null ? simMinsUntilChange-travelMins-30 : null;
  const latestDeparture = minsRemaining!=null ? new Date(currentTime.getTime()+minsRemaining*60000) : null;
  const showReturnWindow = changeIdx>-1&&liveGps&&now===0;
  const showAlarm = showReturnWindow&&minsRemaining!=null&&minsRemaining<=0&&!alarmDismissed;
  const urgency   = minsRemaining!=null ? (minsRemaining<=0?"red":minsRemaining<=30?"red":minsRemaining<=60?"amber":"ok") : "ok";

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
  const sstLabel  = sst >= 24 ? `Sea ${sst}° — swim-warm` : `Sea ${sst}°`;

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
    const first = MARINAS.find(m=>m.name===newOrder[0]);
    if(first) setBoat(b=>({...b,marina:{name:first.name,lat:first.lat,lon:first.lon}}));
  }

  // Re-attach native touch listeners every time the boat screen becomes active.
  // The list element doesn't exist until screen==="boat" so [] would always get null.
  useEffect(()=>{
    if(screen!=="boat") return;
    const el = marinaListRef.current;
    if(!el) return;

    function onTouchStart(e) {
      const row = e.target.closest("[data-marina-row]");
      if(!row) return;
      const name = row.dataset.marinaRow;
      const isHandle = !!e.target.closest("[data-drag-handle]");
      dragState.current = { name, startY: e.touches[0].clientY, currentY: e.touches[0].clientY, isHandle };
      if(isHandle) {
        e.preventDefault(); // block scroll only when handle is grabbed
        setDragActive(name);
        setDragOffsetY(0);
      }
    }

    function onTouchMove(e) {
      if(!dragState.current.name || !dragState.current.isHandle) return;
      e.preventDefault();
      dragState.current.currentY = e.touches[0].clientY;
      setDragOffsetY(e.touches[0].clientY - dragState.current.startY);
    }

    function onTouchEnd() {
      if(!dragState.current.name) return;
      const { name, startY, currentY, isHandle } = dragState.current;
      const dy = currentY - startY;

      if(!isHandle || Math.abs(dy) < 8) {
        // Tap anywhere on row → move that marina to top (make it home)
        const order = [...marinaOrderRef.current];
        const from  = order.indexOf(name);
        if(from > 0) {
          order.splice(from, 1);
          order.unshift(name);
          applyMarinaOrder(order);
        }
      } else {
        // Drag via handle → reorder by distance dragged
        const ROW_H = 54;
        const steps = Math.round(dy / ROW_H);
        if(steps !== 0) {
          const order = [...marinaOrderRef.current];
          const from  = order.indexOf(name);
          if(from !== -1) {
            const to = Math.max(0, Math.min(order.length-1, from+steps));
            order.splice(from, 1);
            order.splice(to, 0, name);
            applyMarinaOrder(order);
          }
        }
      }

      dragState.current = { name: null, startY: 0, currentY: 0, isHandle: false };
      setDragActive(null);
      setDragOffsetY(0);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove",  onTouchMove,  { passive: false });
    el.addEventListener("touchend",   onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove",  onTouchMove);
      el.removeEventListener("touchend",   onTouchEnd);
    };
  // applyMarinaOrder uses only stable setters + refs — safe to omit from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // ── Header date string ────────────────────────────────────────────
  const dateLabel = (() => {
    const d = new Date(today+"T12:00:00");
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${d.toLocaleString("en",{month:"short"})}`;
  })();
  const updLabel = updatedAt ? `updated ${fmtTime(updatedAt)}` : loading ? "loading…" : "demo data";

  return (
    <div style={{minHeight:"100vh",background:"#04101C",display:"flex",
      justifyContent:"center",alignItems:"flex-start",
      padding:"24px 12px",fontFamily:"'IBM Plex Sans',sans-serif"}}>
      <style>{FONTS+`
        @keyframes drift{from{transform:translateX(0)}to{transform:translateX(-8%)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
        button:focus-visible{outline:2px solid ${C.foam};outline-offset:2px}
        .content-scroll::-webkit-scrollbar{display:none}
        .content-scroll{-ms-overflow-style:none;scrollbar-width:none}
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none}
      `}</style>

      {/* phone frame */}
      <div style={{width:390,maxWidth:"100%",background:C.ink,borderRadius:28,
        overflow:"hidden",border:`1px solid ${C.hair}`,
        boxShadow:"0 24px 60px rgba(0,0,0,0.5)",color:C.foam,
        height:"min(780px, calc(100dvh - 48px))",
        display:"flex",flexDirection:"column",position:"relative"}}>

        {/* ── ALARM OVERLAY ─────────────────────────────────────── */}
        {showAlarm&&(
          <div style={{position:"absolute",inset:0,zIndex:50,background:`${C.redDeep}F0`,
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            padding:"32px 28px",textAlign:"center"}}>
            <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontStretch:"125%",
              fontSize:44,lineHeight:1,color:C.red,animation:"pulse 1.4s ease-in-out infinite"}}>
              HEAD BACK<br/>NOW
            </div>
            <div style={{fontSize:15,color:C.foam,marginTop:18,lineHeight:1.6}}>
              Conditions turn {BAND[bands[changeIdx]].word} at {fmtHour(HOURS[changeIdx])}<br/>
              {travelMins} min cruise to {boat.marina.name}
            </div>
            <div style={{fontSize:12,color:C.slate,marginTop:10}}>
              Latest departure was {fmtTime(latestDeparture)}
            </div>
            <button onClick={()=>setAlarmDismissed(true)} style={{marginTop:32,
              padding:"14px 36px",borderRadius:999,background:C.red,border:"none",color:C.foam,
              fontFamily:"'IBM Plex Sans',sans-serif",fontSize:15,fontWeight:600,cursor:"pointer"}}>
              Acknowledged — heading back
            </button>
            <div style={{fontSize:10,color:C.slate,marginTop:16}}>
              Conditions guidance only — the final call is always the skipper's.
            </div>
          </div>
        )}

        {/* header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"18px 20px 10px",flexShrink:0}}>
          <div>
            <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,
              fontStretch:"125%",fontSize:15,letterSpacing:"0.04em"}}>GO / NO-GO</div>
            <div style={{fontSize:11,color:C.slate}}>
              {boat.marina.name} · {dateLabel}
            </div>
          </div>
          <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,
            color:C.slate,textAlign:"right"}}>
            ☀ {sunrise}<br/>☾ {sunset}
            <div style={{fontSize:9,marginTop:2,color:loading?C.amber:C.slate}}>{updLabel}</div>
          </div>
        </div>

        {/* scrollable content */}
        <div ref={contentRef} className="content-scroll" style={{flex:1,overflowY:"auto"}}>

          {/* ── TODAY ─────────────────────────────────────────────── */}
          {screen==="today"&&(
            <div>
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
              {showReturnWindow&&(
                <div style={{padding:"4px 20px 4px"}}>
                  <div style={{background:urgency==="ok"?C.ink2:urgency==="amber"?`${C.amber}1A`:`${C.red}1A`,
                    borderRadius:12,padding:"12px 14px",
                    border:`1px solid ${urgency==="ok"?C.hair:urgency==="amber"?`${C.amber}66`:`${C.red}66`}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div style={{fontSize:13,fontWeight:600,
                        color:urgency==="ok"?C.foam:urgency==="amber"?C.amber:C.red}}>
                        ⏱ Return by {fmtTime(latestDeparture)}
                      </div>
                      <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:11,
                        color:urgency==="ok"?C.slate:urgency==="amber"?C.amber:C.red}}>
                        {minsRemaining>0?`${minsRemaining} min`:"NOW"}
                      </div>
                    </div>
                    <div style={{fontSize:11,color:C.slate,marginTop:4}}>
                      {distNm.toFixed(1)} nm from {boat.marina.name} · {travelMins} min at {boat.speed} kn · 30 min buffer
                    </div>
                  </div>
                </div>
              )}
              {changeIdx>-1&&!liveGps&&now===0&&(
                <div style={{padding:"4px 20px 4px"}}>
                  <div style={{background:C.ink2,borderRadius:12,padding:"11px 14px",border:`1px solid ${C.hair}`}}>
                    <div style={{fontSize:12,color:C.slate}}>📍 Allow location access to see your return window</div>
                  </div>
                </div>
              )}

              {/* day kit */}
              <div style={{padding:"14px 20px 0"}}>
                <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:C.slate,marginBottom:8}}>Day kit</div>
                <div style={{display:"flex",gap:8}}>
                  {[
                    {icon:"🌡",big:`${airTemp}°`, small:sstLabel},
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
              <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontStretch:"125%",fontSize:22,marginBottom:2}}>Next 10 days</div>
              <p style={{fontSize:13,color:C.slate,margin:"0 0 14px"}}>
                For your {boat.hull.toLowerCase()}{trip.crew==="Kids aboard"?" with kids aboard":""}.{" "}
                Bars fade as forecasts get less certain.
              </p>
              {adjDays.map((day,i)=>{
                const isBest=i===bestDayIdx;
                return (
                  <div key={day.d||i} style={{display:"flex",alignItems:"center",gap:12,
                    padding:"9px 10px",borderRadius:10,marginBottom:4,
                    background:isBest?`${C.green}14`:"transparent",
                    border:isBest?`1px solid ${C.green}55`:`1px solid transparent`}}>
                    <div style={{width:52,fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:C.foam}}>{day.d}</div>
                    <div style={{flex:1,display:"flex",gap:3,height:20,opacity:day.conf===3?1:day.conf===2?0.7:0.45}}>
                      <div title="Morning" style={{flex:1,borderRadius:"5px 0 0 5px",background:BAND[day.am].color}}/>
                      <div title="Afternoon" style={{flex:1,borderRadius:"0 5px 5px 0",background:BAND[day.pm].color}}/>
                    </div>
                    <div style={{width:84,textAlign:"right",fontFamily:"'IBM Plex Mono',monospace",fontSize:11,color:C.slate}}>
                      {day.wMax}kn · {day.hMax.toFixed(1)}m
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
              <Row label="Wind"           value={selWind}            unit="kn"/>
              <Row label="Wind direction" value={cardinal(selDir)}   unit={`(${selDir}°)`}/>
              <Row label="Gusts"          value={selGust}            unit="kn" warn={selGust>selWind*1.5}/>
              <Row label="Wave height"    value={selWave.toFixed(1)} unit="m"/>
              <Row label="Wave period"    value={selPeriod}          unit="s"  warn={selPeriod<=4}/>
              <Row label="Visibility"     value={selVis}             unit="km"/>
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
              <div style={{fontFamily:"'Archivo',sans-serif",fontWeight:800,fontStretch:"125%",fontSize:22,marginBottom:14}}>My boat</div>

              <Field label="Hull type">
                {HULLS.map(h=><Chip key={h} label={h} active={boat.hull===h} tone={C.green} onClick={()=>setBoat({...boat,hull:h})}/>)}
              </Field>

              <Field label={`Length — ${boat.length.toFixed(1)} m`}>
                <input type="range" min="3.5" max="12" step="0.5" value={boat.length}
                  onChange={e=>setBoat({...boat,length:parseFloat(e.target.value)})}
                  style={{width:"100%",accentColor:C.green}}/>
              </Field>

              <Field label="Skipper experience">
                {SKIPPER.map(s=><Chip key={s} label={s} active={boat.skipper===s} tone={C.green} onClick={()=>setBoat({...boat,skipper:s})}/>)}
              </Field>

              <Field label={`Cruise speed — ${boat.speed} kn`}>
                <input type="range" min="5" max="40" step="1" value={boat.speed}
                  onChange={e=>setBoat({...boat,speed:parseInt(e.target.value)})}
                  style={{width:"100%",accentColor:C.green}}/>
                <div style={{display:"flex",justifyContent:"space-between",width:"100%",
                  fontFamily:"'IBM Plex Mono',monospace",fontSize:10,color:C.slate,marginTop:2}}>
                  <span>5 kn</span><span>40 kn</span>
                </div>
              </Field>

              <div style={{marginBottom:18}}>
                <div style={{fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase",color:C.slate,marginBottom:6}}>Home marina</div>
                <div style={{fontSize:11,color:C.slate,marginBottom:10,opacity:0.7}}>Tap to select · drag ☰ to reorder</div>

                {/* Draggable marina list — native touch listeners attached via useEffect */}
                <div ref={marinaListRef}
                  style={{borderRadius:12,overflow:"hidden",border:`1px solid ${C.hair}`,marginBottom:10}}>
                  {marinaOrder.map((name,i)=>{
                    const m = MARINAS.find(x=>x.name===name);
                    if(!m) return null;
                    const isHome    = i===0;
                    const isDragging = dragActive===name;
                    return (
                      <div key={name} data-marina-row={name}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"13px 14px",
                          background:isDragging?`${C.green}22`:isHome?`${C.green}0E`:"transparent",
                          borderBottom:i<marinaOrder.length-1?`1px solid ${C.hair}`:"none",
                          transform:isDragging?`translateY(${dragOffsetY}px)`:"none",
                          transition:isDragging?"none":"transform 0.18s ease",
                          zIndex:isDragging?10:1,
                          position:"relative",
                          opacity:isDragging?0.85:1,
                          cursor:"pointer"}}>
                        {/* drag handle */}
                        <div data-drag-handle={name}
                          style={{fontSize:18,color:C.slate,cursor:"grab",userSelect:"none",
                            touchAction:"none",padding:"4px 6px",lineHeight:1,WebkitUserSelect:"none"}}>
                          ☰
                        </div>
                        <div style={{flex:1,pointerEvents:"none"}}>
                          <div style={{fontSize:13,fontWeight:isHome?600:400,
                            color:isHome?C.foam:C.slate}}>
                            {name}
                          </div>
                          {m.lat&&<div style={{fontSize:10,color:C.slate,opacity:0.55,
                            fontFamily:"'IBM Plex Mono',monospace",marginTop:1}}>
                            {m.lat.toFixed(4)}, {m.lon.toFixed(4)}
                          </div>}
                        </div>
                        {isHome&&(
                          <div style={{fontSize:9,letterSpacing:"0.07em",textTransform:"uppercase",
                            background:`${C.green}2A`,color:C.green,
                            borderRadius:999,padding:"3px 8px",fontWeight:600,flexShrink:0}}>
                            Home
                          </div>
                        )}
                      </div>
                    );
                  })}
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
              </div>

              <div style={{marginTop:8,padding:14,borderRadius:12,background:C.ink2,fontSize:13,lineHeight:1.55,color:C.slate}}>
                Set once. Every verdict is calculated for{" "}
                <span style={{color:C.foam}}>this boat and this skipper</span> — a 4 m bowrider and a 9 m cruiser get different answers to the same sea.
              </div>

              <button onClick={()=>setScreen("legal")}
                style={{marginTop:24,width:"100%",background:"transparent",
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
        <div style={{display:"flex",borderTop:`1px solid ${C.hair}`,flexShrink:0}}>
          {nav.map(n=>(
            <button key={n.id} onClick={()=>setScreen(n.id)} style={{
              flex:1,padding:"14px 0",background:"transparent",border:"none",
              fontFamily:"'IBM Plex Sans',sans-serif",fontSize:13,fontWeight:600,
              color:screen===n.id?C.foam:C.slate,cursor:"pointer",
              borderTop:screen===n.id?`2px solid ${B.color}`:"2px solid transparent"}}>
              {n.label}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
