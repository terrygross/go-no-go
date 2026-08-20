# GO / NO-GO — Data Sources & Ensemble Strategy

**Core principle:** no single model is trusted. Multiple independent sources feed a weighted ensemble; disagreement between them is itself information — it drives the confidence score and biases the verdict toward caution. The verdict engine never sees raw API data; it only sees the normalised, fused output of the ensemble layer.

---

## Sources — in trust order

### 1. ECMWF Open Data ⭐ highest-skill global model
- **Gives:** wind speed + gusts, precipitation, pressure. The single most accurate global NWP model in operational use.
- **Access:** free open-data portal (ecmwf.int/en/forecasts/datasets/open-data). No API key. GRIB2 format — moderate integration effort, or consume free through Open-Meteo's `&models=ecmwf_ifs04` parameter.
- **Licence:** free including commercial.
- **Range:** 10 days, 6-hourly. Highest confidence 0–5 days.
- **Role:** anchor model. Highest weight in the ensemble for wind.

### 2. Open-Meteo Weather API — multi-model endpoint
- **Gives:** wind, gusts, air temp, precipitation, UV, visibility, cloud cover — from up to 5 independent models in one call: ECMWF IFS, GFS, DWD ICON, Météo-France ARPEGE, UKMO.
- **Access:** `https://api.open-meteo.com/v1/forecast?models=ecmwf_ifs04,gfs_global,icon_global,meteofrance_arpege_europe,ukmo_global`
- **Licence:** free non-commercial → €29/mo commercial (required on first paid subscriber).
- **Range:** 10-day hourly. This is how we get 5 models for the price of one API call.
- **Role:** wind/weather backbone AND the primary free ensemble. Requesting all 5 models returns separate arrays per model for the same coordinates — the spread between them IS the confidence score.

### 3. Open-Meteo Marine API — multi-model
- **Gives:** wave height, wave period, swell height + direction, sea surface temperature. Models: ECMWF WAM, NCEP WaveWatch III, CMEMS regional.
- **Access:** `https://marine-api.open-meteo.com/v1/marine?models=ecmwf_wam025,ncep_wavewatch3_global`
- **Licence:** same as above.
- **Role:** wave backbone. Wave period is the most safety-critical parameter we track — short choppy period is invisible to amateurs and the main cause of small-boat incidents.

### 4. Copernicus Marine Service / CMEMS
- **Gives:** Mediterranean-specific wave model (MEDSEA_ANALYSISFORECAST_WAV), currents, sea temperature. Purpose-built for the Med basin — better regional resolution than global models.
- **Access:** `https://data.marine.copernicus.eu` — free account, REST or Python toolbox. Attribution required in UI.
- **Licence:** free including commercial with attribution.
- **Role:** regional accuracy layer. Second opinion on wave height and period for Cyprus/Aegean/Adriatic. Higher weight than global models for Med locations.

### 5. Yr.no / MET Norway
- **Gives:** wind speed + gusts, precipitation, air temperature, symbol codes. Backed by MEPS (MetCoOp Ensemble Prediction System) — the Norwegian-Swedish-Finnish-Estonian joint model, excellent for Europe.
- **Access:** `https://api.met.no/weatherapi/locationforecast/2.0/compact` — no API key, just a valid User-Agent header.
- **Licence:** Norwegian Licence for Open Government Data (NLOD) — free including commercial.
- **Range:** 9 days, hourly for first 48h.
- **Role:** independent European model — valuable second opinion on wind, completely separate from the Open-Meteo pipeline. If Yr.no and ECMWF agree, confidence is high.

### 6. Cyprus Meteorological Service
- **Gives:** official local forecasts and warnings for Cyprus. The authoritative source for any Cyprus-specific weather events, sea-state advisories, and official gale warnings.
- **Access:** `https://www.moa.gov.cy/moa/ms/ms.nsf/` — open feeds. Also issues advisories via WMO channels.
- **Licence:** open government data.
- **Role:** official Cyprus override layer. If CMS issues a marine warning for the Paphos/Limassol area, it forces amber or red regardless of model output. Similar role to MeteoAlarm but specifically for Cyprus coastal waters.

### 7. MeteoAlarm — pan-European official warnings
- **Gives:** CAP/XML warning feeds for 35+ European countries including Cyprus (issued by CMS through the MeteoAlarm gateway). Wind, storm, rain, extreme heat — all severities.
- **Access:** free open CAP feeds, no key. `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-cyprus`
- **Licence:** free.
- **Role:** safety hard-override. Any active Level 2 (orange) or Level 3 (red) warning for sea/wind → verdict is locked RED. No model overrides this. Highest priority of any data source.

### 8. NOAA NDBC buoys — observed reality
- **Gives:** actual live wind and wave readings from moored buoys. Not a forecast — real observations.
- **Access:** `https://www.ndbc.noaa.gov/data/realtime2/{STATION_ID}.txt` — free, no key.
- **Limits:** sparse in the eastern Med. Nearest relevant stations are in the central Med and Aegean.
- **Role:** forecast-vs-reality ground truth. When a buoy reading differs significantly from the model consensus, apply a bias correction factor to all model outputs for that location. Big trust differentiator for v2 — "we check the models against real buoy data before showing you the forecast."

### 9. Sunrise / sunset — computed locally
- Library: `suncalc` (npm). Computed from lat/lon — no API, offline, exact.
- Role: day-length context in the header; bounds the Day Kit strip.

---

## Ensemble fusion — the math

This is how we turn 5–7 conflicting model outputs into one honest verdict.

### Step 1 — Normalise all models to the same schema
Every source is converted to:
```
{ wind_kn, gust_kn, wave_m, period_s, swell_dir, temp_c, rain_mm, uv, vis_km, timestamp }
```

### Step 2 — Weighted mean per parameter

Model weights are based on documented regional skill scores:

| Model | Wind weight (global) | Wave weight (Med) |
|---|---|---|
| ECMWF IFS | 0.35 | 0.20 |
| CMEMS Med wave | — | 0.35 |
| DWD ICON | 0.20 | 0.15 |
| Yr.no / MEPS | 0.20 | 0.15 |
| GFS | 0.15 | 0.10 |
| Météo-France ARPEGE | 0.10 | 0.05 |

```
weighted_wind = Σ(weight[i] × wind[i]) / Σ(weight[i])
```

### Step 3 — Spread → confidence score

```
spread_wind   = max(wind_values)  − min(wind_values)
spread_wave   = max(wave_values)  − min(wave_values)
spread_period = max(period_values) − min(period_values)

rel_spread_wind  = spread_wind   / weighted_wind    (ratio)
rel_spread_wave  = spread_wave   / weighted_wave

confidence_wind  = 1 − clamp(rel_spread_wind  / 0.30, 0, 1)
confidence_wave  = 1 − clamp(rel_spread_wave  / 0.35, 0, 1)

overall_confidence = min(confidence_wind, confidence_wave)
```

Three tiers:
- `≥ 0.70` → HIGH — solid timeline bars, full opacity on Plan tab
- `0.40–0.69` → MEDIUM — slightly muted, subtitle note "models in moderate agreement"
- `< 0.40` → LOW — faded bars, "forecasts diverge — treat as outlook only"

### Step 4 — Conservative bias (safety-critical)

When models disagree, **don't use the mean — use the 75th percentile.**

```
sorted_wind = sort(wind_values)
p75_wind = sorted_wind[Math.floor(sorted_wind.length × 0.75)]
```

This means if three models say 12 kn and one says 18 kn, we use ~15 kn rather than 13.5 kn. The conservative skew ensures that a wrong-green verdict is harder to produce than a wrong-amber one. Matches the liability posture — wrong-red is annoying, wrong-green is dangerous.

### Step 5 — Override layer (always wins)

```
if (meteoalarm_active || cyprus_met_warning)  → verdict = RED (locked)
if (vis_km < 1.0)                             → verdict = RED
if (lightning_forecast)                        → verdict = RED
if (confidence < 0.40 && verdict === GREEN)   → verdict = AMBER  // low-confidence greens become amber
```

### Step 6 — Buoy reality check (v2)

```
buoy_bias = buoy_observed_wind − weighted_model_wind (rolling 6h average)
if (abs(buoy_bias) > 3 kn):
  corrected_wind = weighted_wind + (buoy_bias × 0.5)  // 50% correction factor
```

---

## What is currently connected

| Source | Status |
|---|---|
| All weather/wave data | **Simulated** — hardcoded August Paphos scenario in the mock-up |
| MeteoAlarm | Not connected |
| Cyprus Met | Not connected |
| Ensemble engine | Not built — verdict runs on single simulated dataset |
| GPS / live forecast by location | Not connected (browser GPS blocked on localhost) |

**Nothing is live yet.** The mock-up is for validation only — show it to boat owners, confirm they understand the screen in 5 seconds, then build.

---

## Build order for production

1. **Open-Meteo Weather + Marine → single location, real data**
   Replaces the hardcoded FORECAST object. One API call, live hourly data for any coordinates. This alone makes the app real.

2. **Multi-model request from same Open-Meteo call**
   Add `&models=ecmwf_ifs04,gfs_global,icon_global,meteofrance_arpege_europe` to the weather call. Returns separate arrays. Wire the spread calculation → confidence score → Plan tab opacity.

3. **MeteoAlarm + Cyprus Met override**
   Parse the CAP XML feed on app load. Any active warning → hard RED with the official warning text shown.

4. **Yr.no as independent second source**
   Single extra API call, no key needed. Gives a genuinely independent wind/gust reading outside the Open-Meteo pipeline. Wire into ensemble.

5. **CMEMS Marine for Med wave accuracy**
   Heavier integration (gridded data). Worth it for Cyprus — Mediterranean wave behaviour differs from global model assumptions.

6. **Buoy correction layer (v2)**
   Background job compares last 6h of model forecast vs nearest buoy observation, adjusts the bias correction factor.

---

## Honest gaps

| Gap | Impact | Fix |
|---|---|---|
| Open-Meteo is non-commercial free | Must buy €29/mo commercial licence on first subscriber | Budget as first cost of revenue |
| Most models reach us via Open-Meteo's pipes | Single point of failure if they go down | Cache last good forecast, show age. Add Yr.no as independent pipeline. Stormglass at ~50 subscribers. |
| No SLA on any free source | Can't guarantee 99.9% data freshness | Always show "forecast from HH:MM" — never fail blank |
| Eastern Med buoy coverage is sparse | Buoy correction is weakest in our home market | Use CMEMS analysis (hindcast) as partial substitute |
| Tides | Irrelevant in the Med (≤40 cm) | Add WorldTides for UK/Atlantic expansion only |

---

## Upgrade path

| Trigger | Upgrade | ~Cost/mo |
|---|---|---|
| First paying subscriber | Open-Meteo commercial licence | €29 |
| ~50 subscribers | Stormglass.io (true multi-source aggregator + tides) | €19 |
| UK / Atlantic expansion | WorldTides + Met Office DataHub | €0–50 |
| v2 trust features | Direct ECMWF GRIB ingestion, buoy network expansion | Engineering time |
