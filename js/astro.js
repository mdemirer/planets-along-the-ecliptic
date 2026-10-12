/*
 * Planet visibility for one night, from local noon to the next local noon.
 *
 * Needs the global `Astronomy` (Astronomy Engine, MIT licence, vendor/astronomy.browser.min.js).
 * Works in a Web Worker, in the page, or in Node (for testing).
 *
 * Conventions
 *  - Altitudes are geometric (no refraction). A planet is up when its centre is above -0.5667°,
 *    the Sun has set when its centre is below -0.833° (upper limb on the horizon with standard refraction).
 *  - Planets can be seen once the Sun is 6° down (end of civil twilight); full darkness is the Sun 18° down.
 *  - Azimuth is measured from north through east. The chart faces south in the northern hemisphere and
 *    north in the southern one; `dev` is the azimuth relative to that facing direction (-180..180),
 *    so left to right on the chart is always increasing `dev`.
 */
(function (root) {
  "use strict";

  const BODIES = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
  const HORIZON = -0.5667;
  const SUNSET = -0.833;
  const SUN_SEEABLE = -6.0;
  const SUN_DARK = -18.0;
  const MIN_BEST_ALT = 3.0;          // a stretch that never gets this high is left out
  const STEP_MIN = 2;
  const STEP_MS = STEP_MIN * 60000;
  const D2R = Math.PI / 180;

  // ---------------------------------------------------------------- time zones
  const fmtCache = {};
  function formatter(zone) {
    if (!fmtCache[zone]) {
      fmtCache[zone] = new Intl.DateTimeFormat("en-US", {
        timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
    }
    return fmtCache[zone];
  }

  /** Offset of `zone` from UTC at instant `ms`, in minutes (east positive). */
  function zoneOffsetMin(zone, ms) {
    const p = {};
    for (const part of formatter(zone).formatToParts(new Date(ms))) p[part.type] = part.value;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
  }

  /** UTC instant of a local wall-clock time in `zone`. */
  function localToUTC(zone, y, m, d, hh, mm) {
    const guess = Date.UTC(y, m - 1, d, hh, mm);
    const off1 = zoneOffsetMin(zone, guess);
    let t = guess - off1 * 60000;
    const off2 = zoneOffsetMin(zone, t);
    if (off2 !== off1) t = guess - off2 * 60000;
    return t;
  }

  function isValidZone(zone) {
    try { formatter(zone).format(new Date()); return true; } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- helpers
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const twilightAlpha = (sunAlt) => clamp01((SUNSET - sunAlt) / (SUNSET - SUN_DARK));
  const wrap180 = (x) => ((x % 360) + 540) % 360 - 180;

  function fmtClock(localHours) {
    let mins = Math.round(localHours * 60);
    mins = ((mins % 1440) + 1440) % 1440;
    const h = Math.floor(mins / 60), m = mins % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  /** Equatorial coordinates of date at three instants, for quadratic interpolation over the night. */
  function equatorNodes(body, observer, msList) {
    const ra = [], dec = [];
    for (const ms of msList) {
      const eq = Astronomy.Equator(body, new Date(ms), observer, true, true);
      ra.push(eq.ra * 15);
      dec.push(eq.dec);
    }
    ra[1] = ra[0] + wrap180(ra[1] - ra[0]);
    ra[2] = ra[1] + wrap180(ra[2] - ra[1]);
    return { ra, dec };
  }

  function quad(v, s) {      // Lagrange through s = 0, 0.5, 1
    return v[0] * 2 * (s - 0.5) * (s - 1) - v[1] * 4 * s * (s - 1) + v[2] * 2 * s * (s - 0.5);
  }

  // ---------------------------------------------------------------- one night
  /**
   * @param {object} o  { lat, lon, zone, y, m, d }
   * @returns per-planet visible stretches, ready for drawing
   */
  function computeNight(o) {
    const { lat, lon, zone, y, m, d } = o;
    const facing = lat >= 0 ? 180 : 0;
    const observer = new Astronomy.Observer(lat, lon, 0);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const t0 = localToUTC(zone, y, m, d, 12, 0);
    const t1 = localToUTC(zone, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 12, 0);
    const n = Math.floor((t1 - t0) / STEP_MS) + 1;

    // clock time (hours after local midnight that starts day d; 12 → 36), daylight saving included
    const ms = new Float64Array(n), localH = new Float64Array(n), lst = new Float64Array(n);
    for (let i = 0; i < n; i++) ms[i] = t0 + i * STEP_MS;
    const offA = zoneOffsetMin(zone, ms[0]), offB = zoneOffsetMin(zone, ms[n - 1]);
    let switchAt = n;
    if (offA !== offB) {
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (zoneOffsetMin(zone, ms[mid]) === offA) lo = mid; else hi = mid;
      }
      switchAt = hi;
    }
    const localMidnight = Date.UTC(y, m - 1, d);
    for (let i = 0; i < n; i++) {
      const off = i < switchAt ? offA : offB;
      localH[i] = (ms[i] + off * 60000 - localMidnight) / 3600000;
      lst[i] = Astronomy.SiderealTime(new Date(ms[i])) * 15 + lon;
    }

    const nodes = [ms[0], (ms[0] + ms[n - 1]) / 2, ms[n - 1]];
    const sinLat = Math.sin(lat * D2R), cosLat = Math.cos(lat * D2R);

    function altAz(eq) {
      const alt = new Float64Array(n), dev = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const s = i / (n - 1);
        const ra = quad(eq.ra, s), dec = quad(eq.dec, s) * D2R;
        const H = (lst[i] - ra) * D2R;
        const sinDec = Math.sin(dec), cosDec = Math.cos(dec), cosH = Math.cos(H);
        alt[i] = Math.asin(sinLat * sinDec + cosLat * cosDec * cosH) / D2R;
        const az = Math.atan2(-cosDec * Math.sin(H), sinDec * cosLat - cosDec * cosH * sinLat) / D2R;
        dev[i] = wrap180(az - facing);
      }
      return { alt, dev };
    }

    const sun = altAz(equatorNodes(Astronomy.Body.Sun, observer, nodes));
    const sunAlt = sun.alt;
    const out = { y, m, d, planets: {} };

    for (const name of BODIES) {
      const { alt, dev } = altAz(equatorNodes(Astronomy.Body[name], observer, nodes));
      const up = (i) => alt[i] > HORIZON;
      const vis = (i) => up(i) && sunAlt[i] < SUNSET;
      const runs = [];
      let i = 0;
      while (i < n) {
        if (!vis(i)) { i++; continue; }
        let j = i;
        while (j + 1 < n && vis(j + 1)) j++;
        const run = buildRun(i, j);
        if (run) runs.push(run);
        i = j + 1;
      }
      out.planets[name] = runs;

      function crossing(a, b, isStart) {
        // fraction between samples a and b where the stretch begins or ends
        let f = isStart ? 1 : 0;
        const planetChanged = up(a) !== up(b);
        const sunChanged = (sunAlt[a] < SUNSET) !== (sunAlt[b] < SUNSET);
        const fp = planetChanged ? (HORIZON - alt[a]) / (alt[b] - alt[a]) : null;
        const fs = sunChanged ? (SUNSET - sunAlt[a]) / (sunAlt[b] - sunAlt[a]) : null;
        const cands = [fp, fs].filter((v) => v !== null).map(clamp01);
        if (cands.length) f = isStart ? Math.max(...cands) : Math.min(...cands);
        const pick = (arr) => arr[a] + (arr[b] - arr[a]) * f;
        return {
          localH: pick(localH), dev: pick(dev), alpha: twilightAlpha(pick(sunAlt)),
          horizon: planetChanged && (fs === null || (isStart ? fp >= fs : fp <= fs)),
        };
      }

      function buildRun(i, j) {
        // best moment: highest point with the Sun at least 6° down; prefer full darkness
        let k = -1, kd = -1;
        let seeable = 0;
        for (let q = i; q <= j; q++) {
          if (sunAlt[q] < SUN_SEEABLE) {
            seeable++;
            if (k < 0 || alt[q] > alt[k]) k = q;
            if (sunAlt[q] < SUN_DARK && (kd < 0 || alt[q] > alt[kd])) kd = q;
          }
        }
        if (seeable < 3) return null;
        if (kd >= 0 && (alt[kd] >= 10 || alt[kd] >= alt[k] - 3)) k = kd;
        if (alt[k] < MIN_BEST_ALT) return null;

        const start = i > 0 ? crossing(i - 1, i, true)
          : { localH: localH[i], dev: dev[i], alpha: twilightAlpha(sunAlt[i]), horizon: false };
        const end = j < n - 1 ? crossing(j, j + 1, false)
          : { localH: localH[j], dev: dev[j], alpha: twilightAlpha(sunAlt[j]), horizon: false };

        // path: [dev, alpha, localH] from start to end
        const path = [[start.dev, start.alpha, start.localH]];
        for (let q = i; q <= j; q++) path.push([dev[q], twilightAlpha(sunAlt[q]), localH[q]]);
        path.push([end.dev, end.alpha, end.localH]);

        // gradient stops: every point in twilight, only the edges of full darkness
        const stops = [];
        for (let q = 0; q < path.length; q++) {
          const a = path[q][1];
          const prevA = q > 0 ? path[q - 1][1] : 0, nextA = q < path.length - 1 ? path[q + 1][1] : 0;
          if (a < 1 || prevA < 1 || nextA < 1 || q === 0 || q === path.length - 1) {
            stops.push([round3(path[q][0]), round3(a)]);
          }
        }

        // clock-hour boundaries inside the stretch
        const hours = [];
        for (let q = 1; q < path.length; q++) {
          const ha = path[q - 1][2], hb = path[q][2];
          const fb = Math.floor(hb);
          if (fb > Math.floor(ha) && hb > ha) {
            const f = clamp01((fb - ha) / (hb - ha));
            hours.push([((fb % 24) + 24) % 24,
              round3(path[q - 1][0] + (path[q][0] - path[q - 1][0]) * f),
              round3(path[q - 1][1] + (path[q][1] - path[q - 1][1]) * f)]);
          }
        }

        return {
          rise: start.horizon, set: end.horizon,
          t0: fmtClock(start.localH), t1: fmtClock(end.localH),
          dev0: round3(start.dev), dev1: round3(end.dev),
          firstHour: ((Math.floor(start.localH) % 24) + 24) % 24,
          stops, hours,
          best: { dev: round3(dev[k]), alt: round3(alt[k]), t: fmtClock(localH[k]) },
          devMin: Math.min(...path.map((p) => p[0])), devMax: Math.max(...path.map((p) => p[0])),
        };
      }
    }
    out.utcOffsets = [offA, offB];
    return out;
  }

  function round3(x) { return Math.round(x * 1000) / 1000; }

  const api = { BODIES, computeNight, zoneOffsetMin, localToUTC, isValidZone, fmtClock };
  root.PlanetAstro = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
