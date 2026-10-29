# 🌾 AgriSense — Real-Time Environmental & Crop Health Monitoring System

A **software-only** web application that monitors environmental and crop health
parameters **in real time** — without any IoT hardware. Live data comes from a
free agro-meteorological API (satellite + weather-model data), and crop health is
computed by a rule-based software model.

---

## 1. Why there is no hardware (and why that's OK)

Every IoT monitoring system has the same pipeline:

```
Sensors → Data Acquisition → Processing/Analysis → Dashboard & Alerts
```

This project implements **everything except the physical sensor layer**, which is
replaced by the **Open-Meteo agro-meteorological API**. The API provides the exact
same variables field sensors would measure:

| IoT hardware sensor        | API equivalent (used here)              |
|----------------------------|------------------------------------------|
| DHT22 (air temp/humidity)  | `temperature_2m`, `relative_humidity_2m` |
| Soil moisture probe        | `soil_moisture_1_to_3cm` (satellite/model)|
| Soil temperature probe     | `soil_temperature_0cm`                   |
| Rain gauge                 | `precipitation`                          |
| Anemometer (wind)          | `wind_speed_10m`                         |

Because the pipeline is unchanged, real sensors can be plugged in later
(future scope) **without modifying the dashboard**.

---

## 2. Features

**Core monitoring**
- 🌍 **Farm location anywhere via GPS** — pick from Indian presets, or press **"GPS My Location"** to instantly monitor the exact farm you're standing on, anywhere in the world — with automatic place-name detection (reverse geocoding). GPS locations are saved into the dropdown and remembered
- 🌱 Crop selector — Wheat, Rice, Maize, Cotton, Sugarcane, Mustard
- 📊 Live parameter cards: air temp, humidity, soil moisture, soil temp, rainfall, wind
- 🧪 Advanced agro parameters: ET₀ (evapotranspiration), dew point, VPD, solar radiation
- 🌿 **Crop Health Score (0–100)** gauge + **estimated NDVI** bar (crop-specific optimal ranges)
- 🔔 **Real-time rule-based alerts** with automatic timestamped alert history log
- 📈 Live charts — past 24 h (solid) + next 24 h forecast (dashed), 🗓️ 7-day forecast strip
- 🔁 Auto-refresh every **60 seconds** with visible countdown

**Advanced modules (v2)**
- 💧 **Smart Irrigation Advisory** — net water need (mm + litres/acre) from ET₀, expected rain and soil-moisture deficit
- 🦠 **Disease & Pest Risk Index** — fungal and pest risk % from forecast humidity/temperature hours
- 📅 **Crop Growth Stage Tracker** — enter sowing date → current stage, progress and harvest ETA (saved per crop)
- 🍃 **Leaf Photo Health Analyzer (experimental)** — uploads a leaf photo and estimates healthy/yellow/brown tissue % by color analysis
- 📊 **Data logging + CSV export** — every reading stored in the browser (up to 2000), download for Excel
- 🖨️ **Print Report** — one-click print/PDF of the whole dashboard
- 📱 Responsive design (works on phone and laptop)

---

## 3. Tech stack (deliberately simple)

| Layer       | Technology                                  |
|-------------|---------------------------------------------|
| Frontend    | HTML5, CSS3, vanilla JavaScript (no framework)|
| Charts      | Chart.js 4 (CDN)                            |
| Live data   | Open-Meteo API — free, **no API key**, no signup |
| Backend     | **None required** — runs entirely in browser |

## 4. How to run

**Option A (easiest):** open `index.html` in Chrome. Done.

**Option B (recommended for demo):** a tiny local server —

```bash
cd crop-health-monitor
python -m http.server 8000
# then open http://localhost:8000
```

(Or use the VS Code "Live Server" extension.)

Internet is required (the page fetches live data + Chart.js library).

---

## 5. Project structure

```
crop-health-monitor/
├── index.html   → page layout (cards, gauge, alerts, charts)
├── style.css    → green farm-theme styling
├── app.js       → data fetching + health model + alerts + charts
└── README.md    → this file
```

## 6. How the Crop Health Score works (for your report)

1. Each crop has a documented optimal range for temperature, soil moisture, humidity.
2. Score starts at 100; penalties are subtracted proportionally to how far each
   parameter deviates from its optimal range.
3. Bands: **≥ 80 Excellent**, **60–79 Good**, **40–59 Moderate stress**, **< 40 Severe stress**.
4. NDVI is estimated as `0.15 + 0.7 × (score/100)` → range 0.20–0.85.
5. The alert engine applies agronomic rules (e.g. humidity > 85% + warm → fungal risk).

---

## 7. Viva / presentation — likely questions & answers

**Q. Where does the "real-time" data come from without sensors?**
A: Open-Meteo's forecast API, which outputs satellite-validated weather-model data
(updated every few minutes) for soil + atmosphere variables. The dashboard polls it
every 60 seconds — identical polling to how a sensor gateway would push data.

**Q. Is the NDVI real?**
A: It is a *modelled estimate* from environmental parameters. True NDVI needs
multispectral satellite imagery (e.g. Sentinel-2 via AgroMonitoring API) — listed
as future scope.

**Q. How is this "real time"?**
A: Continuous polling loop (`setInterval` 60 s) + live DOM/chart updates + a
rule engine that raises alerts the moment a parameter crosses its threshold.

**Q. What changes to make it a hardware project?**
A: Replace the API fetch with an ESP32 + DHT22 + capacitive soil-moisture sensor
sending JSON over HTTP/MQTT. The health model, alerts and dashboard stay the same.

---

## 8. Suggested report chapters

1. Introduction & Problem Statement
2. Objectives & Scope
3. Literature Review (precision agriculture, remote monitoring)
4. System Architecture (pipeline diagram above)
5. Technologies Used
6. Implementation (data acquisition, health model, alert engine, UI)
7. Results & Screenshots (run for 2–3 locations and crops)
8. Limitations (modelled NDVI, model-based soil data)
9. Future Scope (hardware sensors, real satellite NDVI, ML disease detection, SMS alerts)
10. Conclusion & References

---

## 9. Easy extensions (if examiner asks for more)

- **Leaf disease detection** from uploaded photos — train a free model on
  teachablemachine.google.com, export as TensorFlow.js, drop into the page.
- **History page** — store readings in `localStorage` and chart trends over days.
- **More crops/locations** — just add entries to `CROPS` / `LOCATIONS` in `app.js`.

---

*Data source: https://open-meteo.com (CC-BY 4.0). Charts: https://www.chartjs.org.*
