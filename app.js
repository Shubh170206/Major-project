/* ============================================================
   AgriSense v2 — Real-Time Environmental & Crop Health Monitoring
   ------------------------------------------------------------
   Modules:
   1. Live data acquisition (Open-Meteo API - virtual sensor layer)
   2. Crop health model (Health Score + estimated NDVI)
   3. Alert rule engine + automatic alert history log
   4. 7-day forecast strip
   5. Smart irrigation advisory (ET0 + rain credit + soil deficit)
   6. Disease & pest risk index (forecast humidity/temperature hours)
   7. Crop growth stage tracker (from sowing date)
   8. Leaf photo health analyzer (color-based pixel analysis)
   9. Data logging to browser storage + CSV export
   ============================================================ */

/* ---------------- Configuration ---------------- */

// Preset farm locations (quick demo picks). ANY place on Earth also works
// via the search box (Open-Meteo geocoding) or the GPS button.
const PRESETS = [
  { name: "Ghaziabad, Uttar Pradesh",  lat: 28.67, lon: 77.42 },
  { name: "Ludhiana, Punjab",          lat: 30.90, lon: 75.85 },
  { name: "Karnal, Haryana",           lat: 29.69, lon: 76.99 },
  { name: "Lucknow, Uttar Pradesh",    lat: 26.85, lon: 80.95 },
  { name: "Jaipur, Rajasthan",         lat: 26.92, lon: 75.79 },
  { name: "Indore, Madhya Pradesh",    lat: 22.72, lon: 75.86 },
  { name: "Pune, Maharashtra",         lat: 18.52, lon: 73.86 },
  { name: "Bengaluru, Karnataka",      lat: 12.97, lon: 77.59 },
  { name: "Coimbatore, Tamil Nadu",    lat: 11.02, lon: 76.96 },
  { name: "Kolkata, West Bengal",      lat: 22.57, lon: 88.36 },
];

// Free, keyless geocoding APIs - search any place on Earth / name GPS coordinates
const GEOCODE_API = "https://geocoding-api.open-meteo.com/v1/search";
const REVERSE_API = "https://api.bigdatacloud.net/data/reverse-geocode-client";

// Crop-specific optimal growing ranges + climate zones where each crop suits best.
// temp: °C | moisture: % (volumetric) | humidity: % RH
// zones: Tropical (<23.5°), Subtropical (23.5-35°), Temperate (35-55°), Cold (>55°)
const CROPS = {
  wheat: {
    name: "Wheat", temp: [12, 25], moisture: [15, 30], humidity: [40, 70],
    zones: ["Subtropical", "Temperate", "Cold"],
    stages: [["Sowing & germination", 0, 10], ["Crown root & tillering", 10, 45],
             ["Jointing (stem extension)", 45, 70], ["Flowering & ear emergence", 70, 95],
             ["Grain filling", 95, 120], ["Maturity - harvest ready", 120, 150]],
  },
  rice: {
    name: "Rice (Paddy)", temp: [20, 35], moisture: [25, 45], humidity: [50, 90],
    zones: ["Tropical", "Subtropical"],
    stages: [["Germination", 0, 10], ["Nursery / transplanting", 10, 30],
             ["Active tillering", 30, 55], ["Panicle initiation & flowering", 55, 90],
             ["Grain filling", 90, 115], ["Maturity - harvest ready", 115, 145]],
  },
  maize: {
    name: "Maize (Corn)", temp: [18, 32], moisture: [18, 32], humidity: [40, 75],
    zones: ["Tropical", "Subtropical", "Temperate"],
    stages: [["Germination", 0, 7], ["Vegetative growth", 7, 35],
             ["Tasseling & silking", 35, 60], ["Grain filling", 60, 95],
             ["Maturity - harvest ready", 95, 120]],
  },
  cotton: {
    name: "Cotton", temp: [21, 35], moisture: [18, 35], humidity: [40, 70],
    zones: ["Tropical", "Subtropical"],
    stages: [["Germination", 0, 10], ["Squaring (vegetative)", 10, 50],
             ["Flowering", 50, 90], ["Boll development", 90, 130],
             ["Boll opening & picking", 130, 170]],
  },
  sugarcane: {
    name: "Sugarcane", temp: [20, 35], moisture: [25, 40], humidity: [50, 85],
    zones: ["Tropical", "Subtropical"],
    stages: [["Germination", 0, 30], ["Tillering", 30, 120],
             ["Grand growth", 120, 270], ["Maturation & ripening", 270, 360]],
  },
  mustard: {
    name: "Mustard", temp: [10, 25], moisture: [15, 30], humidity: [30, 65],
    zones: ["Subtropical", "Temperate", "Cold"],
    stages: [["Germination", 0, 8], ["Rosette (vegetative)", 8, 35],
             ["Flowering", 35, 75], ["Pod (siliqua) filling", 75, 105],
             ["Maturity - harvest ready", 105, 140]],
  },
  // ---- global crops (for locations outside India) ----
  soybean: {
    name: "Soybean", temp: [20, 30], moisture: [18, 32], humidity: [40, 75],
    zones: ["Tropical", "Subtropical", "Temperate"],
    stages: [["Germination", 0, 8], ["Vegetative growth", 8, 40],
             ["Flowering", 40, 65], ["Pod development", 65, 95],
             ["Maturity - harvest ready", 95, 120]],
  },
  potato: {
    name: "Potato", temp: [14, 22], moisture: [18, 30], humidity: [50, 80],
    zones: ["Subtropical", "Temperate", "Cold"],
    stages: [["Emergence", 0, 15], ["Vegetative growth", 15, 40],
             ["Tuber initiation", 40, 65], ["Tuber bulking", 65, 90],
             ["Maturity - harvest ready", 90, 125]],
  },
  tomato: {
    name: "Tomato", temp: [18, 30], moisture: [18, 32], humidity: [40, 75],
    zones: ["Tropical", "Subtropical", "Temperate"],
    stages: [["Germination", 0, 10], ["Vegetative growth", 10, 35],
             ["Flowering", 35, 60], ["Fruit development", 60, 90],
             ["Harvest window", 90, 120]],
  },
  coffee: {
    name: "Coffee", temp: [18, 28], moisture: [20, 38], humidity: [60, 85],
    zones: ["Tropical", "Subtropical"],   // perennial - no sowing stages
  },
  banana: {
    name: "Banana", temp: [20, 35], moisture: [22, 40], humidity: [60, 90],
    zones: ["Tropical"],                   // perennial - no sowing stages
  },
};

/* Climate zone of any latitude - drives regional crop adaptation */
function climateZone(lat) {
  const a = Math.abs(lat);
  if (a < 23.5) return "Tropical";
  if (a < 35)   return "Subtropical";
  if (a < 55)   return "Temperate";
  return "Cold";
}
const zoneEmoji = { Tropical: "🌴", Subtropical: "⛅", Temperate: "🌤️", Cold: "❄️" };

// WMO weather codes -> text + emoji
const WEATHER_CODES = {
  0: "☀️ Clear sky", 1: "🌤️ Mainly clear", 2: "⛅ Partly cloudy", 3: "☁️ Overcast",
  45: "🌫️ Fog", 48: "🌫️ Icy fog",
  51: "🌦️ Light drizzle", 53: "🌦️ Drizzle", 55: "🌦️ Heavy drizzle",
  61: "🌧️ Light rain", 63: "🌧️ Rain", 65: "🌧️ Heavy rain",
  71: "🌨️ Light snow", 73: "🌨️ Snow", 75: "🌨️ Heavy snow",
  80: "🌦️ Light showers", 81: "🌧️ Showers", 82: "⛈️ Violent showers",
  95: "⛈️ Thunderstorm", 96: "⛈️ Thunderstorm + hail", 99: "⛈️ Thunderstorm + heavy hail",
};

const REFRESH_INTERVAL_S = 60; // real-time polling every 60 seconds

/* ---------------- App state ---------------- */
const state = {
  lat: PRESETS[0].lat,
  lon: PRESETS[0].lon,
  sel: { kind: "preset", idx: 0 }, // which entry of the dropdown is active
  cropKey: "wheat",
  custom: [],                      // searched / GPS places saved by the user
  tempChart: null,
  soilChart: null,
  countdown: REFRESH_INTERVAL_S,
};

const STORE = {
  prefs:   "agrisense_prefs",
  custom:  "agrisense_custom_locs",
  history: "agrisense_history",
  alerts:  "agrisense_alert_log",
  sowing:  (crop) => `agrisense_sowing_${crop}`,
};

/* ---------------- Helpers ---------------- */
const $ = (id) => document.getElementById(id);
const num = (v) => (v === null || v === undefined || isNaN(v)) ? null : v;

function setChip(el, level, text) {
  el.className = "card-chip chip-" + level;
  el.textContent = text;
}
function statusFor(value, [lo, hi], margin) {
  if (value >= lo && value <= hi) return ["ok", "Optimal"];
  if (value >= lo - margin && value <= hi + margin) return ["warn", "Warning"];
  return ["bad", "Critical"];
}
const loadJSON = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};
const saveJSON = (key, val) => localStorage.setItem(key, JSON.stringify(val));

/* ---------------- Health model ---------------- */
function computeHealth(t, moisture, humidity, crop) {
  let score = 100;
  const [tLo, tHi] = crop.temp;
  const [mLo, mHi] = crop.moisture;
  const [hLo, hHi] = crop.humidity;

  if (t < tLo)      score -= Math.min(30, (tLo - t) * 4);
  else if (t > tHi) score -= Math.min(30, (t - tHi) * 4);

  if (moisture < mLo)      score -= Math.min(25, (mLo - moisture) * 2);
  else if (moisture > mHi) score -= Math.min(25, (moisture - mHi) * 2);

  if (humidity > hHi + 10)      score -= Math.min(12, (humidity - hHi - 10) * 1.5);
  else if (humidity < hLo - 10) score -= Math.min(10, (hLo - 10 - humidity));

  return Math.max(5, Math.min(100, Math.round(score)));
}
function healthLabel(score) {
  if (score >= 80) return ["Excellent — Crop is healthy", "#16a34a"];
  if (score >= 60) return ["Good — Mild stress", "#65a30d"];
  if (score >= 40) return ["Moderate stress — needs attention", "#d97706"];
  return ["Severe stress — action required", "#dc2626"];
}

/* ---------------- Alert rule engine ---------------- */
function buildAlerts(t, moisture, humidity, wind, rainNext24, crop) {
  const alerts = [];
  const [tLo, tHi] = crop.temp;
  const [mLo, mHi] = crop.moisture;

  if (moisture < mLo)
    alerts.push(["critical", `🔴 <b>Low soil moisture (${moisture}%).</b> Irrigation recommended for ${crop.name}.`]);
  if (moisture > mHi + 8)
    alerts.push(["warning", `🟠 <b>Excess soil moisture (${moisture}%).</b> Waterlogging risk — pause irrigation, check drainage.`]);
  if (t > tHi + 3)
    alerts.push(["critical", `🔴 <b>Heat stress (${t}°C).</b> ${crop.name} optimal maximum is ${tHi}°C. Provide irrigation/shade.`]);
  else if (t > tHi)
    alerts.push(["warning", `🟡 <b>Temperature above optimal (${t}°C).</b> ${crop.name} prefers ${tLo}–${tHi}°C. Monitor closely.`]);
  if (t < tLo - 3)
    alerts.push(["warning", `🟡 <b>Cold stress (${t}°C).</b> ${crop.name} growth slows below ${tLo}°C. Frost protection may be needed.`]);
  if (humidity > 85 && t >= 18)
    alerts.push(["warning", `🟡 <b>High humidity (${humidity}%) + warmth.</b> Fungal disease risk (blight, mildew, rust). Scout the field.`]);
  if (rainNext24 >= 2)
    alerts.push(["info", `🔵 <b>Rain expected in next 24 h (~${rainNext24.toFixed(1)} mm).</b> Delay irrigation and spraying.`]);
  if (wind > 25)
    alerts.push(["info", `🔵 <b>High wind (${wind} km/h).</b> Avoid pesticide spraying — drift risk.`]);
  if (alerts.length === 0)
    alerts.push(["ok", `✅ <b>All parameters are within the optimal range</b> for ${crop.name}. No action required.`]);
  return alerts;
}

/* ---------------- Data fetching ---------------- */
async function fetchData() {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${state.lat}&longitude=${state.lon}` +
    "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m" +
    "&hourly=temperature_2m,relative_humidity_2m,precipitation,soil_temperature_0cm,soil_moisture_1_to_3cm," +
    "et0_fao_evapotranspiration,vapour_pressure_deficit,shortwave_radiation,dew_point_2m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,et0_fao_evapotranspiration" +
    "&timezone=auto&past_days=1&forecast_days=7";
  const res = await fetch(url);
  if (!res.ok) throw new Error("API error " + res.status);
  return res.json();
}

/* ---------------- Main render ---------------- */
function render(data) {
  const crop = CROPS[state.cropKey];
  const cur = data.current;
  const hourly = data.hourly;
  const daily = data.daily;
  const times = hourly.time;

  let idx = 0; // current hour index in hourly arrays
  for (let i = 0; i < times.length; i++) if (times[i] <= cur.time) idx = i;
  const today = cur.time.slice(0, 10);
  let di = daily.time.findIndex((d) => d === today); // today's index in daily arrays
  if (di < 0) di = 0;

  /* ---- measurements ---- */
  const t        = cur.temperature_2m;
  const humidity = cur.relative_humidity_2m;
  const wind     = cur.wind_speed_10m;
  const rainNow  = cur.precipitation ?? 0;
  const soilT    = num(hourly.soil_temperature_0cm?.[idx]) ?? 0;
  const moisture = Math.round((num(hourly.soil_moisture_1_to_3cm?.[idx]) ?? 0) * 100);
  const rainNext24 = (hourly.precipitation || []).slice(idx + 1, idx + 25).reduce((a, b) => a + (b || 0), 0);

  const dew   = num(hourly.dew_point_2m?.[idx]);
  const vpd   = num(hourly.vapour_pressure_deficit?.[idx]);
  const solar = num(hourly.shortwave_radiation?.[idx]);
  const et0Today = num(daily.et0_fao_evapotranspiration?.[di]) ?? 0;

  /* ---- status bar ---- */
  $("weatherDesc").textContent = (WEATHER_CODES[cur.weather_code] || "—") + ` · Cloud cover ${cur.cloud_cover}%`;
  $("lastUpdated").textContent = new Date().toLocaleTimeString();

  /* ---- core cards ---- */
  $("tempVal").textContent  = t.toFixed(1);
  $("humVal").textContent   = humidity;
  $("soilMVal").textContent = moisture;
  $("soilTVal").textContent = soilT.toFixed(1);
  $("rainVal").textContent  = rainNow.toFixed(1);
  $("rainSub").textContent  = rainNext24 > 0 ? `≈ ${rainNext24.toFixed(1)} mm expected next 24 h` : "no rain expected next 24 h";
  $("windVal").textContent  = wind;

  setChip($("tempChip"),  ...statusFor(t, crop.temp, 3));
  setChip($("humChip"),   ...statusFor(humidity, crop.humidity, 10));
  setChip($("soilMChip"), ...statusFor(moisture, crop.moisture, 5));
  setChip($("soilTChip"), soilT >= crop.temp[0] - 2 && soilT <= crop.temp[1] + 6 ? ["ok", "Optimal"] : ["warn", "Watch"]);
  setChip($("windChip"),  wind <= 20 ? ["ok", "Calm"] : wind <= 35 ? ["warn", "Breezy"] : ["bad", "Strong"]);

  /* ---- advanced agro cards ---- */
  $("et0Val").textContent   = et0Today.toFixed(2);
  $("dewVal").textContent   = dew === null ? "—" : dew.toFixed(1);
  $("solarVal").textContent = solar === null ? "—" : Math.round(solar);
  $("vpdVal").textContent   = vpd === null ? "—" : vpd.toFixed(2);
  if (vpd !== null)
    setChip($("vpdChip"), vpd < 0.4 ? ["info", "Humid air"] : vpd <= 1.6 ? ["ok", "Ideal transpiration"] : ["warn", "Dry air — plants may close stomata"]);

  /* ---- forecast strip ---- */
  renderForecast(daily, di);

  /* ---- crop health ---- */
  const score = computeHealth(t, moisture, humidity, crop);
  const [label, color] = healthLabel(score);
  const ndvi = (0.15 + 0.7 * (score / 100)).toFixed(2);

  const LEN = 267;
  const gaugeFill = $("gaugeFill");
  gaugeFill.style.strokeDasharray = LEN;
  gaugeFill.style.strokeDashoffset = LEN * (1 - score / 100);
  gaugeFill.style.stroke = color;
  $("healthScore").textContent = score;
  $("healthScore").style.color = color;
  $("healthLabel").textContent = label;
  $("cropNameTag").textContent = crop.name;
  $("ndviVal").textContent = ndvi;
  $("ndviFill").style.width = (ndvi * 100) + "%";

  const check = (val, range, unit) => {
    const ok = val >= range[0] && val <= range[1];
    return `<li><span>${ok ? "✅" : "⚠️"} ${unit.label}: <b>${val}${unit.u}</b></span><span class="${ok ? "f-ok" : "f-bad"}">optimal ${range[0]}–${range[1]}${unit.u}</span></li>`;
  };
  $("factorList").innerHTML =
    check(t, crop.temp, { label: "Air temperature", u: "°C" }) +
    check(moisture, crop.moisture, { label: "Soil moisture", u: "%" }) +
    check(humidity, crop.humidity, { label: "Humidity", u: "%" });

  /* ---- alerts (+ auto history log) ---- */
  const alerts = buildAlerts(t, moisture, humidity, wind, rainNext24, crop);
  $("alerts").innerHTML = alerts.map(([level, msg]) => `<li class="al-${level}">${msg}</li>`).join("");
  logAlerts(alerts);

  /* ---- irrigation advisory ---- */
  renderIrrigation(et0Today, rainNext24, moisture, crop);

  /* ---- disease & pest risk ---- */
  renderRisk(hourly, idx);

  /* ---- charts ---- */
  const from = Math.max(0, idx - 23);
  const to = Math.min(times.length - 1, idx + 24);
  const labels = times.slice(from, to + 1).map((s) => s.slice(5, 10).replace("-", "/") + " " + s.slice(11, 16));
  const split = idx - from;
  const past = (arr) => arr.slice(from, to + 1).map((v, i) => (i <= split ? v : null));
  const future = (arr) => arr.slice(from, to + 1).map((v, i) => (i >= split ? v : null));

  drawTempChart(labels, past(hourly.temperature_2m), future(hourly.temperature_2m), past(hourly.relative_humidity_2m));
  const moistPct = (hourly.soil_moisture_1_to_3cm || []).map((v) => (v == null ? null : +(v * 100).toFixed(1)));
  drawSoilChart(labels, past(moistPct), future(moistPct), hourly.precipitation.slice(from, to + 1));

  /* ---- log this snapshot ---- */
  logSnapshot({ t, hum: humidity, soilM: moisture, soilT, score, ndvi });
}

/* ---------------- 7-day forecast ---------------- */
function renderForecast(daily, di) {
  const emoji = (code) => (WEATHER_CODES[code] || "❔").split(" ")[0];
  let html = "";
  const n = Math.min(daily.time.length, di + 7);
  for (let i = di; i < n; i++) {
    const d = new Date(daily.time[i] + "T12:00:00");
    const name = i === di ? "Today" : d.toLocaleDateString(undefined, { weekday: "short" });
    const rainP = daily.precipitation_probability_max?.[i];
    const rainSum = daily.precipitation_sum?.[i];
    html += `
      <div class="fday ${i === di ? "today" : ""}">
        <span class="day-name">${name}</span>
        <span class="fx">${emoji(daily.weather_code?.[i])}</span>
        <span class="hi">${Math.round(daily.temperature_2m_max?.[i] ?? 0)}°</span>
        <span class="lo">${Math.round(daily.temperature_2m_min?.[i] ?? 0)}°</span>
        <span class="rain">${rainP != null ? `☔ ${rainP}%` : ""}${rainSum > 0 ? ` ${rainSum.toFixed(1)}mm` : ""}</span>
      </div>`;
  }
  $("forecastStrip").innerHTML = html || "<span class='note'>Forecast unavailable</span>";
}

/* ---------------- Irrigation advisory ---------------- */
function renderIrrigation(et0, rainCredit, moisture, crop) {
  const optMin = crop.moisture[0];
  // soil deficit: each % below optimal ≈ 1.2 mm water needed
  const deficit = moisture < optMin ? +((optMin - moisture) * 1.2).toFixed(1) : 0;
  const net = Math.max(0, +(et0 - rainCredit).toFixed(1)) + deficit;
  const litersAcre = Math.round((net * 4047) / 100) * 100; // 1 mm over 1 acre ≈ 4047 litres

  $("irrNeed").textContent = net.toFixed(1);
  $("irrLiters").textContent = net > 0 ? `${litersAcre.toLocaleString()} litres/acre` : "0 litres/acre";
  $("kvEt0").textContent = et0.toFixed(2) + " mm";
  $("kvRain").textContent = rainCredit.toFixed(1) + " mm";
  $("kvDeficit").textContent = deficit.toFixed(1) + " mm";
  $("kvNet").textContent = net.toFixed(1) + " mm";

  if (net <= 0.5) {
    setChip($("irrChip"), "ok", "No irrigation needed");
    $("irrVerdict").textContent = `Soil moisture is adequate for ${crop.name}${rainCredit >= 1 ? ` and ≈${rainCredit.toFixed(1)} mm rain is on the way` : ""}. Skip today's irrigation and save water.`;
  } else if (net <= 5) {
    setChip($("irrChip"), "warn", "Light irrigation advised");
    $("irrVerdict").textContent = "Apply a light irrigation, preferably early morning or evening to reduce evaporation loss.";
  } else {
    setChip($("irrChip"), "bad", "Irrigation required");
    $("irrVerdict").textContent = `Crop water demand is high and soil moisture is below the optimal range for ${crop.name}. Irrigate today, in the morning or evening hours.`;
  }
}

/* ---------------- Disease & pest risk ---------------- */
function renderRisk(hourly, idx) {
  const t24 = hourly.temperature_2m.slice(idx + 1, idx + 25);
  const h24 = hourly.relative_humidity_2m.slice(idx + 1, idx + 25);

  const fungalHours = t24.filter((t, i) => t >= 18 && h24[i] >= 85).length;
  const pestHours   = t24.filter((t, i) => t >= 25 && t <= 33 && h24[i] >= 60 && h24[i] <= 85).length;
  const fungalPct = Math.round((fungalHours / Math.max(1, t24.length)) * 100);
  const pestPct   = Math.round((pestHours / Math.max(1, t24.length)) * 100);

  const level = (p) => (p < 25 ? ["ok", "LOW"] : p < 50 ? ["warn", "MODERATE"] : ["bad", "HIGH"]);
  const set = (fillId, pctId, chipId, p) => {
    $(fillId).style.width = p + "%";
    $(pctId).textContent = p + "%";
    setChip($(chipId), ...level(p));
  };
  set("riskFungalFill", "riskFungalPct", "riskFungalLabel", fungalPct);
  set("riskPestFill", "riskPestPct", "riskPestLabel", pestPct);

  $("riskNote").textContent =
    `Computed from forecast hours: ${fungalHours}/24 h are humid (>85% RH) & warm - fungal-friendly; ` +
    `${pestHours}/24 h are warm & moderately humid - pest-friendly. ` +
    (fungalPct >= 50 || pestPct >= 50
      ? "High risk: scout the field within 24-48 h and consider preventive measures."
      : "Risk is manageable - continue routine monitoring.");
}

/* ---------------- Crop growth stage tracker ---------------- */
function renderGrowth() {
  const crop = CROPS[state.cropKey];
  const saved = localStorage.getItem(STORE.sowing(state.cropKey)) || "";
  if ($("sowDate").value !== saved) $("sowDate").value = saved;
  $("sowDate").max = new Date().toISOString().slice(0, 10);

  const stages = crop.stages;
  if (!stages) { // perennial crop (coffee, banana) - no sowing cycle
    $("stageList").innerHTML = "";
    $("growthFill").style.width = "0%";
    $("growthSummary").textContent = `${crop.name} is a perennial crop - it has no fixed sowing cycle. Monitor its health parameters continuously instead.`;
    $("harvestEta").textContent = "";
    return;
  }
  if (!saved) {
    $("stageList").innerHTML = "";
    $("growthFill").style.width = "0%";
    $("growthSummary").textContent = "Enter your sowing date above to track the crop stage.";
    $("harvestEta").textContent = "";
    return;
  }

  const das = Math.floor((Date.now() - new Date(saved + "T00:00:00").getTime()) / 86400000);
  if (das < 0) {
    $("growthSummary").textContent = "Sowing date is in the future - crop not sown yet.";
    return;
  }
  const total = stages[stages.length - 1][2];
  const ci = stages.findIndex(([, f, t2]) => das >= f && das < t2);
  const current = ci === -1 ? stages.length - 1 : ci;
  const done = ci === -1;

  $("stageList").innerHTML = stages.map(([name, f, t2], i) => {
    const cls = done || i < current ? "done" : i === current && !done ? "current" : "";
    const icon = done || i < current ? "✅" : i === current && !done ? "🌱" : "⏳";
    return `<li class="${cls}"><span>${icon} ${name}</span><span>day ${f}–${t2}</span></li>`;
  }).join("");

  $("growthFill").style.width = Math.min(100, (das / total) * 100) + "%";
  $("growthSummary").textContent = done
    ? `${crop.name}: crop cycle complete (${das} days after sowing).`
    : `${crop.name}: day ${das} after sowing - stage "${stages[current][0]}" (day ${stages[current][1]}–${stages[current][2]}).`;
  $("harvestEta").textContent = done
    ? "🌾 Harvest window reached - crop should be ready for harvest."
    : `🌾 Expected harvest readiness: in ~${Math.max(0, total - das)} days (typical cycle ≈ ${total} days).`;
}

/* ---------------- Leaf photo health analyzer ---------------- */
function initLeafAnalyzer() {
  $("leafFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      // draw scaled-down to canvas (max 300px) and read pixels
      const scale = Math.min(1, 300 / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      let green = 0, yellow = 0, brown = 0, other = 0, total = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 235 && g > 235 && b > 235) continue; // skip near-white background
        total++;
        if (g > r * 1.15 && g > b * 1.15 && g > 60) green++;                 // healthy green
        else if (r > 110 && g > 100 && b < 110 && Math.abs(r - g) < 70) yellow++; // yellowing
        else if (r >= g && g >= b && r - b > 25 && r > 60 && r < 200) brown++;    // necrosis
        else other++;
      }
      URL.revokeObjectURL(img.src);
      if (!total) return;

      const pct = (n) => Math.round((n / total) * 100);
      const gp = pct(green), yp = pct(yellow), bp = pct(brown);
      $("leafPreview").src = URL.createObjectURL(file);
      $("leafPreview").classList.remove("hidden");
      $("leafResult").classList.remove("hidden");
      $("leafHealthyPct").textContent = gp + "%";
      $("leafYellowPct").textContent = yp + "%";
      $("leafBrownPct").textContent = bp + "%";
      $("leafHealthyBar").style.width = gp + "%";
      $("leafYellowBar").style.width = yp + "%";
      $("leafBrownBar").style.width = bp + "%";

      const v = $("leafVerdict");
      v.classList.remove("warn", "bad");
      if (gp >= 70 && bp <= 10) {
        v.textContent = `✅ Leaf looks healthy (${gp}% green). No major stress detected.`;
      } else if (gp >= 45 && bp <= 25) {
        v.classList.add("warn");
        v.textContent = `🟡 Moderate stress signs: ${yp}% yellowing / ${bp}% dead tissue. Check nitrogen levels, water supply and possible early disease.`;
      } else {
        v.classList.add("bad");
        v.textContent = `🔴 Strong stress/damage signs: only ${gp}% green tissue. Inspect leaves closely for disease or severe nutrient deficiency.`;
      }
    };
    img.src = URL.createObjectURL(file);
  });
}

/* ---------------- Alert history log ---------------- */
function logAlerts(alerts) {
  const log = loadJSON(STORE.alerts, []);
  alerts.filter(([lvl]) => lvl !== "ok").forEach(([level, msg]) => {
    const last = log[log.length - 1];
    if (!last || last.msg !== msg) {
      log.push({ level, msg, time: new Date().toLocaleString() });
    }
  });
  while (log.length > 60) log.shift();
  saveJSON(STORE.alerts, log);
  renderAlertHistory();
}
function renderAlertHistory() {
  const log = loadJSON(STORE.alerts, []);
  $("alertHistory").innerHTML = log.slice(-8).reverse()
    .map((a) => `<li><span class="t">${a.time}</span>${a.msg}</li>`).join("") ||
    "<li>No alerts logged yet.</li>";
}

/* ---------------- Data logging + CSV export ---------------- */
function logSnapshot(s) {
  const hist = loadJSON(STORE.history, []);
  hist.push({ time: new Date().toLocaleString(), temp: s.t, hum: s.hum, soilM: s.soilM, soilT: s.soilT, score: s.score, ndvi: s.ndvi });
  while (hist.length > 2000) hist.shift();
  saveJSON(STORE.history, hist);
  renderHistoryUI();
}
function renderHistoryUI() {
  const hist = loadJSON(STORE.history, []);
  $("histCount").textContent = hist.length;
  $("histSince").textContent = hist.length ? hist[0].time : "—";
}
function exportCSV() {
  const hist = loadJSON(STORE.history, []);
  if (!hist.length) return alert("No data logged yet - let the dashboard run for a few minutes first.");
  const header = "time,temperature_C,humidity_%,soil_moisture_%,soil_temp_C,health_score,ndvi";
  const rows = hist.map((r) => `"${r.time}",${r.temp},${r.hum},${r.soilM},${r.soilT},${r.score},${r.ndvi}`);
  const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "agrisense_log_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------- Charts ---------------- */
function drawTempChart(labels, tempPast, tempFuture, humPast) {
  if (state.tempChart) state.tempChart.destroy();
  state.tempChart = new Chart($("tempChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Temperature °C (live)", data: tempPast, borderColor: "#dc2626", backgroundColor: "#dc2626", tension: .35, pointRadius: 0, borderWidth: 2, yAxisID: "y" },
        { label: "Temperature °C (forecast)", data: tempFuture, borderColor: "#dc2626", borderDash: [6, 5], tension: .35, pointRadius: 0, borderWidth: 2, yAxisID: "y" },
        { label: "Humidity %", data: humPast, borderColor: "#2563eb", tension: .35, pointRadius: 0, borderWidth: 2, yAxisID: "y1" },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y:  { title: { display: true, text: "°C" } },
        y1: { position: "right", min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: "%" } },
      },
    },
  });
}
function drawSoilChart(labels, moistPast, moistFuture, rain) {
  if (state.soilChart) state.soilChart.destroy();
  state.soilChart = new Chart($("soilChart"), {
    data: {
      labels,
      datasets: [
        { type: "bar", label: "Rainfall mm", data: rain, backgroundColor: "rgba(37,99,235,.45)", borderRadius: 3, yAxisID: "y1" },
        { type: "line", label: "Soil moisture % (live)", data: moistPast, borderColor: "#16a34a", backgroundColor: "rgba(22,163,74,.12)", fill: true, tension: .35, pointRadius: 0, borderWidth: 2, yAxisID: "y" },
        { type: "line", label: "Soil moisture % (forecast)", data: moistFuture, borderColor: "#16a34a", borderDash: [6, 5], tension: .35, pointRadius: 0, borderWidth: 2, yAxisID: "y" },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y:  { min: 0, suggestedMax: 50, title: { display: true, text: "Moisture %" } },
        y1: { position: "right", min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: "mm" } },
      },
    },
  });
}

/* ---------------- Location management (global search + GPS + presets) ---------------- */

function updateCoordsTag() {
  $("coordsTag").textContent = `📐 ${state.lat.toFixed(3)}, ${state.lon.toFixed(3)}`;
}

/* ---------- Regional adaptation: climate zone + suitable crops ---------- */
function updateZoneTag() {
  const z = climateZone(state.lat);
  $("zoneTag").textContent = `${zoneEmoji[z]} ${z} zone`;
}

/* If the current crop doesn't fit the new location's climate zone,
   auto-switch to the best matching regional crop */
function ensureZoneFit() {
  const zone = climateZone(state.lat);
  if (CROPS[state.cropKey].zones.includes(zone)) return;
  const first = Object.entries(CROPS).find(([, c]) => c.zones.includes(zone));
  if (first) state.cropKey = first[0];
}

/* Crop dropdown: region-suitable crops on top, everything else below */
function buildCropSelect() {
  const sel = $("cropSelect");
  const zone = climateZone(latState());
  sel.innerHTML = "";
  const ok = Object.entries(CROPS).filter(([, c]) => c.zones.includes(zone));
  const rest = Object.entries(CROPS).filter(([, c]) => !c.zones.includes(zone));
  const g1 = document.createElement("optgroup");
  g1.label = `⭐ Suitable for ${zone} zone (this location)`;
  ok.forEach(([k, c]) => {
    const o = document.createElement("option");
    o.value = k; o.textContent = c.name; g1.appendChild(o);
  });
  sel.appendChild(g1);
  const g2 = document.createElement("optgroup");
  g2.label = "All other crops";
  rest.forEach(([k, c]) => {
    const o = document.createElement("option");
    o.value = k; o.textContent = c.name; g2.appendChild(o);
  });
  sel.appendChild(g2);
  sel.value = state.cropKey;
}
const latState = () => state.lat;

function savePrefs() {
  saveJSON(STORE.prefs, { cropKey: state.cropKey, sel: state.sel });
}
function saveCustom() {
  saveJSON(STORE.custom, state.custom);
}

function applySel(kind, idx) {
  const src = kind === "preset" ? PRESETS[idx] : state.custom[idx];
  if (!src) return;
  state.sel = { kind, idx };
  state.lat = +src.lat.toFixed(3);
  state.lon = +src.lon.toFixed(3);
  ensureZoneFit();          // auto-pick a regional crop if needed
  savePrefs();
  renderLocationOptions();
  buildCropSelect();        // re-order crops for this climate zone
  updateCoordsTag();
  updateZoneTag();
  load();
}

function renderLocationOptions() {
  const sel = $("locationSelect");
  sel.innerHTML = "";
  const g1 = document.createElement("optgroup");
  g1.label = "🇮🇳 Preset farm locations (India)";
  PRESETS.forEach((p, i) => {
    const o = document.createElement("option");
    o.value = "preset-" + i;
    o.textContent = p.name;
    g1.appendChild(o);
  });
  sel.appendChild(g1);
  if (state.custom.length) {
    const g2 = document.createElement("optgroup");
    g2.label = "🌍 My places (global)";
    state.custom.forEach((p, i) => {
      const o = document.createElement("option");
      o.value = "custom-" + i;
      o.textContent = p.name;
      g2.appendChild(o);
    });
    sel.appendChild(g2);
  }
  sel.value = state.sel.kind + "-" + state.sel.idx;
}

function addCustomPlace(name, lat, lon, src) {
  lat = +(+lat).toFixed(3); lon = +(+lon).toFixed(3);
  let p = state.custom.find((x) => Math.abs(x.lat - lat) < 0.01 && Math.abs(x.lon - lon) < 0.01);
  if (!p) {
    p = { name, lat, lon, src };
    state.custom.push(p);
    if (state.custom.length > 12) state.custom.shift(); // keep list short
    saveCustom();
  }
  return p;
}

const flagOf = (cc) =>
  cc ? String.fromCodePoint(...[...cc.toUpperCase()].map((ch) => 127397 + ch.charCodeAt(0))) : "🏳️";

/* Search ANY location on the globe via the Open-Meteo geocoding API.
   Results appear in a popup right under the search box; clicking one
   instantly switches the whole dashboard to that farm location. */
function searchPlaces() {
  const q = $("placeSearch").value.trim();
  const box = $("searchResults");
  if (q.length < 2) return;
  box.innerHTML = '<div class="item muted">Searching…</div>';
  box.classList.remove("hidden");
  fetch(`${GEOCODE_API}?name=${encodeURIComponent(q)}&count=8&language=en&format=json`)
    .then((r) => r.json())
    .then((data) => {
      const items = data.results || [];
      if (!items.length) {
        box.innerHTML = '<div class="item muted">No places found</div>';
        return;
      }
      box.innerHTML = "";
      items.forEach((it) => {
        const d = document.createElement("div");
        d.className = "item";
        d.textContent = `${flagOf(it.country_code)} ${it.name}${it.admin1 ? ", " + it.admin1 : ""}, ${it.country}`;
        d.addEventListener("click", () => {
          box.classList.add("hidden");
          $("placeSearch").value = "";
          const p = addCustomPlace(`${it.name}${it.admin1 ? ", " + it.admin1 : ""}, ${it.country}`, it.latitude, it.longitude, "search");
          applySel("custom", state.custom.indexOf(p));
        });
        box.appendChild(d);
      });
    })
    .catch(() => { box.innerHTML = '<div class="item muted">Search failed — check internet</div>'; });
}

/* Global GPS "My Location" — detects the farm's coordinates anywhere in the
   world and converts them to a real place name via reverse geocoding.
   Works for ANY farm location on Earth. */
function detectMyLocation() {
  if (!navigator.geolocation) return alert("Geolocation is not supported by this browser.");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = +pos.coords.latitude.toFixed(3);
      const lon = +pos.coords.longitude.toFixed(3);
      const p = addCustomPlace("📍 My Location ( detecting name… )", lat, lon, "gps");
      applySel("custom", state.custom.indexOf(p));
      // try to find the real place name; harmless if it fails
      fetch(`${REVERSE_API}?latitude=${lat}&longitude=${lon}&localityLanguage=en`)
        .then((r) => r.json())
        .then((d) => {
          const nm = [d.locality || d.city, d.countryName].filter(Boolean).join(", ");
          if (nm) {
            p.name = "📍 " + nm;
            saveCustom();
            renderLocationOptions();
          } else {
            p.name = "📍 My Location";
            saveCustom();
            renderLocationOptions();
          }
        })
        .catch(() => { p.name = "📍 My Location"; saveCustom(); renderLocationOptions(); });
    },
    () => alert("Location permission denied. Use the search box or a preset location instead.")
  );
}

function restorePrefs() {
  state.custom = loadJSON(STORE.custom, []);
  const p = loadJSON(STORE.prefs, null);
  if (p) {
    state.cropKey = CROPS[p.cropKey] ? p.cropKey : "wheat";
    if (p.sel && p.sel.kind === "preset" && PRESETS[p.sel.idx]) state.sel = p.sel;
    else if (p.sel && p.sel.kind === "custom" && state.custom[p.sel.idx]) state.sel = p.sel;
    else if (Number.isInteger(+p.locSel) && PRESETS[+p.locSel]) state.sel = { kind: "preset", idx: +p.locSel }; // legacy
    else state.sel = { kind: "preset", idx: 0 };
  }
  const src = state.sel.kind === "preset" ? PRESETS[state.sel.idx] : state.custom[state.sel.idx];
  state.lat = src.lat; state.lon = src.lon;
}

/* ---------------- Main load + timers ---------------- */
async function load() {
  const banner = $("errorBanner");
  try {
    const data = await fetchData();
    banner.classList.add("hidden");
    render(data);
  } catch (err) {
    banner.textContent = "⚠️ Could not fetch live data (" + err.message + "). Check your internet connection — retrying automatically…";
    banner.classList.remove("hidden");
  }
}

/* ---------------- App init ---------------- */
function init() {
  restorePrefs();                      // loads custom places + last selection
  renderLocationOptions();             // builds dropdown (presets + my places)

  $("locationSelect").addEventListener("change", (e) => {
    const [kind, i] = e.target.value.split("-");
    applySel(kind, +i);
  });

  buildCropSelect();
  $("cropSelect").addEventListener("change", (e) => {
    state.cropKey = e.target.value;
    savePrefs(); renderGrowth(); load();
  });

  // global place search - pick any location on the globe
  $("searchBtn").addEventListener("click", searchPlaces);
  $("placeSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); searchPlaces(); }
    if (e.key === "Escape") $("searchResults").classList.add("hidden");
  });
  document.addEventListener("click", (e) => {
    const box = $("searchResults");
    if (!box.contains(e.target) && e.target !== $("placeSearch")) box.classList.add("hidden");
  });

  // global GPS - any farm location on Earth
  $("geoBtn").addEventListener("click", detectMyLocation);
  $("refreshBtn").addEventListener("click", load);
  $("printBtn").addEventListener("click", () => window.print());
  $("csvBtn").addEventListener("click", exportCSV);
  $("clearHistBtn").addEventListener("click", () => {
    if (confirm("Delete all logged readings?")) {
      localStorage.removeItem(STORE.history);
      renderHistoryUI();
    }
  });
  $("sowDate").addEventListener("change", (e) => {
    localStorage.setItem(STORE.sowing(state.cropKey), e.target.value);
    renderGrowth();
  });

  renderGrowth();
  renderHistoryUI();
  renderAlertHistory();
  initLeafAnalyzer();
  updateCoordsTag();
  updateZoneTag();
  load();

  // real-time polling + visible countdown
  setInterval(() => { load(); state.countdown = REFRESH_INTERVAL_S; }, REFRESH_INTERVAL_S * 1000);
  setInterval(() => {
    state.countdown = Math.max(0, state.countdown - 1);
    $("countdown").textContent = state.countdown;
  }, 1000);
}

init();
