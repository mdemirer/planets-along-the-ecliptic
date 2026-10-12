/* Page logic: read the form, compute in a worker, draw the pages, build PDFs on request. */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const form = $("form"), errorEl = $("error"), goBtn = $("go");
  const STORE_KEY = "planets-along-the-ecliptic:v1";
  const DEFAULTS = { year: new Date().getFullYear(), place: "Istanbul", lat: 41.01, lon: 28.98, zone: "Europe/Istanbul" };

  // ------------------------------------------------------------------ form setup
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch (e) { /* private mode: fine */ }
  }
  const start = Object.assign({}, DEFAULTS, loadSaved() || {});
  $("year").value = start.year; $("place").value = start.place; $("lat").value = start.lat; $("lon").value = start.lon; $("zone").value = start.zone;

  try {
    const zones = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : [];
    $("zones").innerHTML = zones.map((z) => `<option value="${z}"></option>`).join("");
  } catch (e) { /* older browsers: free text still works */ }

  $("locate").addEventListener("click", () => {
    if (!navigator.geolocation) { showError("Your browser cannot share its location. Type the coordinates instead."); return; }
    $("locate").disabled = true;
    navigator.geolocation.getCurrentPosition((pos) => {
      $("lat").value = pos.coords.latitude.toFixed(2);
      $("lon").value = pos.coords.longitude.toFixed(2);
      try { $("zone").value = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* keep */ }
      $("locate").disabled = false;
      showError("");
    }, () => {
      $("locate").disabled = false;
      showError("Location was not shared. Type the coordinates instead.");
    }, { timeout: 15000, maximumAge: 600000 });
  });

  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = !msg; }

  function readForm() {
    const year = parseInt($("year").value, 10);
    const lat = parseFloat($("lat").value), lon = parseFloat($("lon").value);
    const zone = $("zone").value.trim(), place = $("place").value.trim();
    if (!(year >= 1900 && year <= 2100)) return { error: "Enter a year between 1900 and 2100." };
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lon) > 180) return { error: "Enter latitude and longitude in decimal degrees, for example 41.01 and 28.98." };
    if (Math.abs(lat) < 30 || Math.abs(lat) > 60) {
      return { error: "This chart works between 30° and 60° latitude, north or south. Closer to the equator planets can pass overhead and on both sides of the sky; further from it the summer nights never get dark." };
    }
    if (!zone || !PlanetAstro.isValidZone(zone)) return { error: "Choose a time zone from the list, for example Europe/Istanbul or America/New_York." };
    return { year, lat, lon, zone, place };
  }

  // ------------------------------------------------------------------ text measuring with the real font
  const canvas = document.createElement("canvas").getContext("2d");
  const measureCache = new Map();
  function measure(text, size, weight) {
    const key = `${weight}|${size}|${text}`;
    let w = measureCache.get(key);
    if (w === undefined) {
      canvas.font = `${weight >= 600 ? 600 : 400} ${size}px Jost`;
      w = canvas.measureText(text).width;
      measureCache.set(key, w);
    }
    return w;
  }
  const fontsReady = Promise.all([document.fonts.load("400 16px Jost"), document.fonts.load("600 16px Jost")]).catch(() => null);

  // ------------------------------------------------------------------ compute
  function compute(v, onProgress) {
    const d = PlanetChart.datesFor(v.year);
    const seen = new Set(), dates = [];
    for (const list of [d.monthly, d.biweekly, d.weekly]) {
      for (const dt of list) { const k = dt.join("-"); if (!seen.has(k)) { seen.add(k); dates.push(dt); } }
    }
    return new Promise((resolve, reject) => {
      const w = new Worker("js/worker.js");
      w.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "progress") onProgress(msg.done / msg.total);
        else if (msg.type === "done") { w.terminate(); resolve(msg); }
        else if (msg.type === "error") { w.terminate(); reject(new Error(msg.message)); }
      };
      w.onerror = (e) => { w.terminate(); reject(new Error(e.message || "The calculation failed.")); };
      w.postMessage({ lat: v.lat, lon: v.lon, zone: v.zone, dates });
    });
  }

  function timesLabel(offsets, zone) {
    if (offsets.length === 1) {
      const o = offsets[0], sign = o < 0 ? "-" : "+", a = Math.abs(o);
      const hm = a % 60 ? `${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}` : `${a / 60}`;
      return o === 0 ? "times UTC" : `times UTC${sign}${hm}`;
    }
    return `local time (${zone}), daylight saving included`;
  }

  // printed at the bottom right of every page; the page's own address once it is online
  const SITE_FALLBACK = "mdemirer.github.io/planets-along-the-ecliptic";
  function siteLabel() {
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return SITE_FALLBACK;
    return (location.host + location.pathname).replace(/index\.html$/, "").replace(/\/$/, "");
  }

  function slug(s) {
    return (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  // ------------------------------------------------------------------ PDF
  let fontData = null;
  async function loadFontData() {
    if (fontData) return fontData;
    const toB64 = (buf) => {
      const bytes = new Uint8Array(buf);
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    };
    const [r, b] = await Promise.all(["fonts/Jost-Regular.ttf", "fonts/Jost-SemiBold.ttf"].map((u) => fetch(u).then((x) => {
      if (!x.ok) throw new Error("Could not load the font " + u);
      return x.arrayBuffer();
    })));
    fontData = { regular: toB64(r), bold: toB64(b) };
    return fontData;
  }

  async function makePdf(pages, filename, title) {
    const { jsPDF } = window.jspdf;
    const fonts = await loadFontData();
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a3", compress: true });
    doc.addFileToVFS("Jost-Regular.ttf", fonts.regular);
    doc.addFont("Jost-Regular.ttf", "Jost", "normal");
    doc.addFileToVFS("Jost-SemiBold.ttf", fonts.bold);
    doc.addFont("Jost-SemiBold.ttf", "Jost", "bold");
    doc.setFont("Jost", "normal");
    doc.setProperties({ title, subject: "Planet visibility chart", creator: "Planets along the ecliptic" });
    const host = $("pdf-host");
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    for (let i = 0; i < pages.length; i++) {
      if (i) doc.addPage("a3", "portrait");
      host.innerHTML = pages[i];
      const el = host.querySelector("svg");
      await doc.svg(el, { x: 0, y: 0, width: W, height: H });
      host.innerHTML = "";
    }
    doc.save(filename);
  }

  // ------------------------------------------------------------------ results
  const KINDS = [
    { kind: "monthly", title: "Monthly", text: "One A3 page. A band for the 15th of every month, with the hour of each block written on it." },
    { kind: "biweekly", title: "Every two weeks", text: "Two A3 pages, January–June and July–December. Bands for the 1st and 15th of every month." },
    { kind: "weekly", title: "Weekly", text: "Two A3 pages. A band for every seventh day, to follow the planets closely through the year." },
  ];

  function showCards(v, pagesByKind) {
    const cards = $("cards");
    cards.innerHTML = "";
    const base = `planets-${v.year}${v.place ? "-" + slug(v.place) : ""}`;
    for (const k of KINDS) {
      const pages = pagesByKind[k.kind];
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `<div class="thumbs ${pages.length > 1 ? "two" : ""}">${pages.map((p) => `<div class="thumb">${p}</div>`).join("")}</div>` +
        `<div class="card-text"><h3>${k.title}</h3><p>${k.text}</p>` +
        `<button type="button" class="btn btn-main">Download PDF</button></div>`;
      const btn = card.querySelector("button");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = "Making the PDF…";
        try {
          await makePdf(pages, `${base}-${k.kind}.pdf`, `Planets along the ecliptic ${v.year} (${k.title.toLowerCase()})`);
        } catch (err) {
          showError("The PDF could not be made: " + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      });
      cards.appendChild(card);
    }
    $("intro").hidden = true;
    cards.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = readForm();
    if (v.error) { showError(v.error); return; }
    showError("");
    save({ year: v.year, place: v.place, lat: v.lat, lon: v.lon, zone: v.zone });
    goBtn.disabled = true;
    $("progress").hidden = false;
    const setP = (f, msg) => { $("bar").style.width = Math.round(f * 100) + "%"; $("status").textContent = msg; };
    setP(0, "Working out where the planets are…");
    try {
      const res = await compute(v, (f) => setP(f * 0.85, "Working out where the planets are…"));
      setP(0.9, "Drawing the charts…");
      await fontsReady;
      await new Promise((r) => setTimeout(r, 0));
      const half = Math.min(180, Math.max(135, Math.ceil((res.maxDev + 3) / 15) * 15));
      const opts = {
        year: v.year, lat: v.lat, lon: v.lon, place: v.place, half, measure,
        timesLabel: timesLabel(res.offsets, v.zone),
        credits: ["Positions: Astronomy Engine"].concat(siteLabel() ? [siteLabel()] : []),
      };
      const pagesByKind = {};
      for (const k of KINDS) pagesByKind[k.kind] = PlanetChart.renderChart(k.kind, res.nights, opts);
      showCards(v, pagesByKind);
      setP(1, "Done. Download the PDFs below.");
      if (window.matchMedia("(max-width: 900px)").matches) $("cards").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      showError("Something went wrong: " + err.message);
      $("progress").hidden = true;
    } finally {
      goBtn.disabled = false;
    }
  });

  // expose for automated example generation
  window.__planetsApp = { readForm, makePdf };
})();
