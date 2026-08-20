# GO / NO-GO — Project Handover for Claude (Desktop)

**Purpose of this file:** Load full project context in a new Claude session. Read completely before responding. This project was scoped, designed and prototyped in a prior session; do not re-litigate settled decisions unless a genuine flaw is found — flag it directly if so.

---

## 1. Who you're working with

Terry — self-taught inventor/engineer, based Paphos, Cyprus. Owns a speedboat; is the app's own target user. Communication rules: plain English, brief, direct, no filler, no flattery, no placeholders — complete copy-paste-ready output. Push back with reasons when something is wrong. Read back interpreted requirements for confirmation before generating large outputs.

## 2. The product in one paragraph

**Go / No-Go** is a mobile app for casual powerboat owners (not sailors) that answers one question in five seconds: *can I take my boat out today?* It fuses multi-model marine forecasts into a single traffic-light verdict — green / amber / red — personalised to the user's boat, skipper experience, crew and plan, with one plain-English sentence ("Calm this morning — amber from 12:00, be back before then"). All complexity lives one tap away. Existing marine apps (Windy, Navionics, Wavve, PredictWind) are data-rich and decision-poor, built by sailors for sailors; the documented market gap is decision-first simplicity for the far larger casual-powerboat audience.

## 3. Settled decisions (do not reopen without cause)

1. **Verdict-first design.** The screen IS the answer. Data is secondary, behind a "Why?" tap.
2. **Personalised thresholds, not raw conditions.** Boat profile (hull type, length, skipper level — set once) + per-trip inputs (crew, activity, distance — 2 taps) generate wind/wave limits. Worst factor wins. Modifiers: kids aboard −20%, watersports/offshore −15%, novice −15%, experienced +10%, gusty (gust >1.5× wind) −10%, short wave period (≤4s) −15% on wave limit.
3. **Wave period and trend are first-class.** Short-period chop is the danger amateurs miss; "green until 13:00" beats "green now."
4. **Liability framing baked in, not bolted on.** Verdicts are conditions-based, never permission-based. Persistent line: "Conditions guidance only — the final call is always the skipper's." Raw numbers always one tap away. Official warnings (MeteoAlarm) force red regardless of models. Incorporate as ltd company + legal review before public launch. Wrong-green is catastrophic, wrong-red is annoying → amber band is deliberately generous.
5. **Model disagreement = the confidence engine.** When independent models agree → high confidence; disagree → confidence drops, verdict tightens toward amber. This is the differentiator and the defensibility story ("verdict based on agreement across N independent models").
6. **10-day planner shows uncertainty as design.** Morning/afternoon colour blocks per day; bars FADE as model confidence drops with lead time. Days 8–10 are "an outlook, not a promise."
7. **Day Kit strip** (Today screen): air+sea temp ("swim-warm"), rain as decision ("Dry till sunset" / "Rain from 15:00 — out and back by 2"), UV as instruction ("UV 9 — sunscreen essential, reapply after swims"). Strip stays small — verdict remains the hero.
8. **Free-first data stack**, upgrade on revenue (see §6).
9. **Monetisation:** freemium. Today's verdict free; subscription ~£3–4/mo or ~£25–30/yr (seasonal pricing suits boating) for 10-day planner, multiple spots, departure-window alerts. NOT £0.99 — priced against problem value, not cheapness.
10. **Validation before deep build:** show mock-up to ~10 boat owners at Paphos marina; success test = they understand the screen in 5 seconds unprompted.

## 4. Design system (from the working mock-up — keep consistent)

- **Concept:** verdict-as-signal-flag. Signature element: animated horizon wave divider whose amplitude/chop is driven by actual forecast wave height and period.
- **Palette:** ink `#081826`, panel `#0D2436`, foam text `#F2F7F7`, slate secondary `#7C99AD`, green `#1FB871`, amber `#F2A21C`, red `#E5484D` (each with deep gradient variants).
- **Type:** Archivo (800, expanded 125%) for verdict words; IBM Plex Sans body; IBM Plex Mono for all numeric data (instrument-panel feel).
- **Verdict names:** GOOD TO LAUNCH / THINK TWICE / STAY ASHORE.
- **Screens:** Today (verdict + sentence + hourly colour timeline + Day Kit + trip chips), Plan (10-day am/pm blocks with confidence fade + best-day highlight), Why? (raw numbers + plain-English sea explainer), My Boat (hull, length slider, skipper level).
- Reduced-motion respected; timeline marks current hour.

## 5. Files in hand

- `go-no-go-mockup.jsx` — working React mock-up, all four screens, live verdict engine with the modifiers above, simulated Paphos August forecast (calm dawn → afternoon westerly builds → eases at dusk). Data layer is shaped to accept live API data with minimal refactor.
- `go-no-go-data-sources.md` — full free-first data source plan with endpoints, limits, upgrade triggers.

## 6. Data stack summary (detail in data-sources file)

**Free launch stack:** Open-Meteo Marine + Weather (backbone; free tier is NON-COMMERCIAL — must buy €29/mo commercial licence the day the first subscriber pays); free multi-model ensemble via Open-Meteo's model parameter (ECMWF, GFS, ICON, Météo-France); Copernicus Marine for Med-specific accuracy (free incl. commercial, attribution required); MeteoAlarm official warnings (free, powers the red-override); sunrise/sunset computed locally (suncalc, no API). **Post-revenue:** Stormglass (~€19/mo) for true side-by-side ensemble + tides at ~50 subs; NOAA NDBC buoy reality-checks as v2 trust feature; national met APIs per expansion country. **Known risk:** most free models arrive via Open-Meteo's pipes — single point of failure until Stormglass; cache last good forecast and display its age rather than fail blank.

## 7. Build roadmap

1. **Now:** marina validation with existing mock-up (10 conversations, 5-second comprehension test).
2. **MVP build:** wire Open-Meteo live data into existing mock-up structure → location search/GPS → real hourly + 10-day → MeteoAlarm red-override → free ensemble confidence score.
3. **Launch prep:** ltd company, legal review of all verdict wording, Play Store listing (iOS later — but note iOS users monetise better; revisit).
4. **v1 paid:** subscription gate on Plan tab + alerts; buy Open-Meteo commercial licence same day as first sale.
5. **v2:** buoy corrections, more spots, departure-window push alerts, additional countries via national feeds.

## 8. Open questions (not yet decided)

- App's public name ("Go / No-Go" is the working title; trademark/store-name check not done).
- Flutter vs React Native vs PWA for production build.
- Exact subscription price point and free/paid feature split.
- Whether marina/charter B2B tier (multiple boats, staff briefing screen) is worth pursuing later.
- Cyprus permit status for local business activity (Terry aware; immigration/accountant consult pending).

## 9. How to work on this project

Confirm understanding of any new requirement in one line before large builds. Keep every user-facing string in the app's voice: decisions, not data; plain English; calm, no drama. Any new feature must pass the test: *does it help answer "do I go out today?" faster — or is it gold-plating?*
