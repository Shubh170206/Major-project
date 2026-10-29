/* Headless test: runs app.js with a fake DOM + REAL API,
   then verifies every dashboard element got populated.
   Usage: node test_app.js */
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("index.html", "utf8");
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

const problems = [];
const registry = {};

function makeEl(id) {
  return {
    id, _text: "", _html: "", value: "", className: "", max: "", src: "",
    style: {}, dataset: {}, children: [],
    set textContent(v) { this._text = String(v); }, get textContent() { return this._text; },
    set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    appendChild(c) { this.children.push(c); },
    addEventListener() {}, querySelector() { return null; },
    getContext() { return { drawImage() {}, getImageData() { return { data: new Uint8ClampedArray(0) }; } }; },
    click() {}, remove() {},
  };
}

const sandbox = {
  document: {
    getElementById(id) {
      if (!ids.has(id)) problems.push("app.js uses id NOT present in HTML: #" + id);
      if (!registry[id]) registry[id] = makeEl(id);
      return registry[id];
    },
    createElement(tag) { return makeEl("<" + tag + ">"); },
    addEventListener() {},
    body: makeEl("body"),
  },
  localStorage: {
    store: {},
    getItem(k) { return this.store[k] ?? null; },
    setItem(k, v) { this.store[k] = String(v); },
    removeItem(k) { delete this.store[k]; },
  },
  window: {},
  navigator: {},
  Image: function () {},
  Chart: function () { return { destroy() {} }; },
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  Blob: function () {},
  setInterval: () => 0, clearInterval: () => {},
  alert: (m) => console.log("ALERT:", m), confirm: () => true,
  console, Date, Math, JSON, Promise, fetch,
  location: { hostname: "" },
};
vm.createContext(sandbox);
process.on("unhandledRejection", (e) => problems.push("async crash: " + (e && e.message)));

vm.runInContext(fs.readFileSync("app.js", "utf8"), sandbox, { filename: "app.js" });

setTimeout(() => {
  const g = (id) => (registry[id] ? registry[id] : { _text: "(never touched)", _html: "(never touched)" });
  const check = (name, ok) => console.log((ok ? "PASS" : "FAIL") + "  " + name);

  check("API reachable, no error banner", !g("errorBanner")._text.includes("Could not"));
  if (g("errorBanner")._text) console.log("      errorBanner:", g("errorBanner")._text);
  check("core card temperature", g("tempVal")._text.match(/^-?\d/));
  check("advanced card ET0", g("et0Val")._text.match(/^\d/));
  check("advanced card dew point", g("dewVal")._text.match(/^-?\d/));
  check("advanced card VPD", g("vpdVal")._text.match(/^\d/));
  check("advanced card solar", g("solarVal")._text.match(/^\d/));
  check("7-day forecast strip", g("forecastStrip")._html.includes("fday") && (g("forecastStrip")._html.match(/fday/g) || []).length >= 6);
  check("crop health score", g("healthScore")._text.match(/^\d+$/));
  check("alerts rendered", g("alerts")._html.includes("<li"));
  check("irrigation need (mm)", g("irrNeed")._text.match(/^\d/));
  check("irrigation litres", g("irrLiters")._text.includes("litres/acre"));
  check("fungal risk %", g("riskFungalPct")._text.endsWith("%"));
  check("pest risk %", g("riskPestPct")._text.endsWith("%"));
  check("risk explanation", g("riskNote")._text.includes("forecast hours"));
  check("growth panel message", g("growthSummary")._text.length > 5);
  check("sow date input exists + max set", g("sowDate").max.length === 10);
  check("data logging count", g("histCount")._text === "1");
  check("data logging since", g("histSince")._text.length > 5);
  check("countdown element", g("countdown")._text.length > 0);
  check("no missing DOM ids", problems.filter((p) => p.startsWith("app.js uses")).length === 0);

  const fatal = problems.filter((p) => p.startsWith("async crash"));
  if (problems.length) console.log("\nPROBLEMS:\n - " + problems.join("\n - "));
  check("no async crashes", fatal.length === 0);
}, 6000);
