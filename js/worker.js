/* Computes every night the three charts need, off the main thread. */
importScripts("../vendor/astronomy.browser.min.js", "astro.js");

self.onmessage = (e) => {
  const { lat, lon, zone, dates } = e.data;
  try {
    const nights = {};
    const offsets = new Set();
    let maxDev = 0;
    dates.forEach(([y, m, d], i) => {
      const nt = PlanetAstro.computeNight({ lat, lon, zone, y, m, d });
      nights[`${y}-${m}-${d}`] = nt;
      nt.utcOffsets.forEach((o) => offsets.add(o));
      for (const runs of Object.values(nt.planets)) {
        for (const r of runs) maxDev = Math.max(maxDev, Math.abs(r.devMin), Math.abs(r.devMax));
      }
      if (i % 3 === 2 || i === dates.length - 1) self.postMessage({ type: "progress", done: i + 1, total: dates.length });
    });
    self.postMessage({ type: "done", nights, maxDev, offsets: [...offsets] });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err && err.message ? err.message : err) });
  }
};
