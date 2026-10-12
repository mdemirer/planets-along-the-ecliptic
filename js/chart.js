/*
 * Draws the printable A3 pages as SVG (also converted to PDF with svg2pdf.js).
 *
 * Kept deliberately simple for PDF conversion: no opacity, no masks, no tspans, one font family (Jost,
 * regular and bold). Arrows are drawn as shapes because Jost has no arrow glyphs.
 */
(function (root) {
  "use strict";

  const PAGE_W = 1123, PAGE_H = 1587;             // A3 portrait at 96 px per inch
  const LANES = ["Saturn", "Jupiter", "Mars", "Venus", "Mercury"];   // top to bottom
  const COL = { Mercury: "#13a87d", Venus: "#b58619", Mars: "#9e4330", Jupiter: "#703592", Saturn: "#4a90e8" };
  const PAPER = "#ffffff", INK = "#1a2233", INK2 = "#465166", MUTED = "#5f6a7d", TWI = "#6b7486";
  const BAND_FILL = "#f3f5f9", BAND_LINE = "#8f9ab0", LANE_LINE = "#dfe4ec", GUIDE = "#c9d0dc";
  const FONT = "Jost";
  const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DIR = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };

  const LAYOUTS = {
    monthly: {
      padTop: 48, padX: 56, padBottom: 40, lane: 13, gap: 40, sag: 46, A: 520, left: 100, rightPad: 66, top: 6,
      extra: 30, degEvery: true, hourNums: true, hourFs: 7, hourOff: [2.2, -2.5], hourMinLen: 13, hourClear: [6, 13],
      glyph: 1, sideFs: 12, sideDy: 4.2, sideGap: 9, label: "month", labelFs: 15, dayX: 0,
      cutW: 1.6, barW: 2.6, inset: 1.5, nMax: 12,
    },
    biweekly: {
      padTop: 40, padX: 56, padBottom: 34, lane: 16, gap: 24, sag: 46, A: 520, left: 128, rightPad: 70, top: 6,
      extra: 36, degEvery: false, hourNums: true, hourFs: 8.5, hourOff: [2.6, -3.1], hourMinLen: 15, hourClear: [7, 15],
      glyph: 1.15, sideFs: 13, sideDy: 4.6, sideGap: 9, label: "date", labelFs: 15, dayX: 52,
      cutW: 1.6, barW: 2.6, inset: 1.5, nMax: 12,
    },
    weekly: {
      padTop: 34, padX: 56, padBottom: 30, lane: 8, gap: 7, sag: 40, A: 520, left: 100, rightPad: 66, top: 4,
      extra: 34, degEvery: false, hourNums: false, glyph: 0.6, sideFs: 7.6, sideDy: 2.7, sideGap: 6,
      label: "date", labelFs: 11.5, dayX: 44, cutW: 1.2, barW: 2, inset: 1, nMax: 27,
    },
  };

  // ------------------------------------------------------------------ small helpers
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const f1 = (x) => (Math.round(x * 10) / 10).toString();

  function mix(c, o, f) {
    const a = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const b = [1, 3, 5].map((i) => parseInt(o.slice(i, i + 2), 16));
    return "#" + a.map((x, i) => Math.round(x + (b[i] - x) * f).toString(16).padStart(2, "0")).join("");
  }

  function textEl(x, y, str, { size, weight = 400, fill = INK, anchor = "start", extra = "" }) {
    return `<text x="${f1(x)}" y="${f1(y)}" font-family="${FONT}" font-size="${size}" font-weight="${weight >= 600 ? "bold" : "normal"}" ` +
      `fill="${fill}" text-anchor="${anchor}"${extra}>${esc(str)}</text>`;
  }

  /** Arrow shape (up or down) whose baseline sits at y; returns {svg, width}. */
  function arrow(x, y, fs, up, fill) {
    const h = 0.7 * fs, hw = 0.25 * fs, hh = 0.32 * fs, sw = 0.11 * fs;
    const cx = x + hw;
    let d;
    if (up) {
      const top = y - h;
      d = `M${f1(cx)},${f1(top)} L${f1(cx + hw)},${f1(top + hh)} L${f1(cx + sw / 2)},${f1(top + hh)} L${f1(cx + sw / 2)},${f1(y)} ` +
        `L${f1(cx - sw / 2)},${f1(y)} L${f1(cx - sw / 2)},${f1(top + hh)} L${f1(cx - hw)},${f1(top + hh)} Z`;
    } else {
      const top = y - h;
      d = `M${f1(cx)},${f1(y)} L${f1(cx + hw)},${f1(y - hh)} L${f1(cx + sw / 2)},${f1(y - hh)} L${f1(cx + sw / 2)},${f1(top)} ` +
        `L${f1(cx - sw / 2)},${f1(top)} L${f1(cx - sw / 2)},${f1(y - hh)} L${f1(cx - hw)},${f1(y - hh)} Z`;
    }
    return { svg: `<path d="${d}" fill="${fill}"></path>`, width: 2 * hw + 0.12 * fs };
  }

  // ------------------------------------------------------------------ band geometry
  function geometry(L) {
    const W = PAGE_W - 2 * L.padX;
    const right = W - L.rightPad;
    const halfChord = (right - L.left) / 2, cx = L.left + halfChord;
    const alpha = Math.acos(halfChord / L.A), B = L.sag / (1 - Math.sin(alpha));
    const N = 1200;
    const px = [], py = [], s = [0];
    for (let i = 0; i <= N; i++) {
      const th = Math.PI - alpha - (Math.PI - 2 * alpha) * i / N;
      px.push(L.A * Math.cos(th)); py.push(-B * Math.sin(th));
      if (i) s.push(s[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]));
    }
    const total = s[N];
    // table evenly spaced in arc length: x, y, normal
    const T = [];
    let k = 0;
    for (let i = 0; i <= N; i++) {
      const target = total * i / N;
      while (k < N - 1 && s[k + 1] < target) k++;
      const f = (target - s[k]) / (s[k + 1] - s[k] || 1);
      const th = Math.PI - alpha - (Math.PI - 2 * alpha) * (k + f) / N;
      const nx = B * Math.cos(th), ny = -L.A * Math.sin(th), nl = Math.hypot(nx, ny);
      T.push([px[k] + (px[k + 1] - px[k]) * f, py[k] + (py[k + 1] - py[k]) * f, nx / nl, ny / nl]);
    }
    const thick = L.lane * LANES.length;
    const pitch = thick + L.gap;
    function frame(u) {
      u = Math.min(1, Math.max(0, u)) * N;
      const i = Math.min(N - 1, Math.floor(u)), f = u - i;
      const a = T[i], b = T[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
    }
    return { W, cx, B, thick, pitch, frame, H: (n) => Math.ceil(L.top + (n - 1) * pitch + thick + L.sag + L.extra) };
  }

  function makeBand(G, L, idx) {
    const cy = L.top + idx * G.pitch + G.thick / 2 + G.B;
    const pt = (u, off) => { const [x, y, nx, ny] = G.frame(u); return [G.cx + x + nx * off, cy + y + ny * off]; };
    const strip = (u0, u1, o0, o1) => {
      const n = Math.max(2, Math.ceil(Math.abs(u1 - u0) * 140));
      const a = [], b = [];
      for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; a.push(pt(u, o1)); b.unshift(pt(u, o0)); }
      return "M" + a.concat(b).map((p) => f1(p[0]) + "," + f1(p[1])).join(" L") + " Z";
    };
    const line = (u0, u1, off) => {
      const n = Math.max(2, Math.ceil(Math.abs(u1 - u0) * 140));
      const a = [];
      for (let i = 0; i <= n; i++) a.push(pt(u0 + (u1 - u0) * i / n, off));
      return "M" + a.map((p) => f1(p[0]) + "," + f1(p[1])).join(" L");
    };
    return { pt, strip, line, frame: G.frame };
  }

  // ------------------------------------------------------------------ planet symbols
  function glyph(name, x, y, uid, defs) {
    const c = COL[name], fill = mix(c, "#ffffff", 0.55), edge = mix(c, "#000000", 0.25);
    const halo = (r) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${PAPER}"></circle>`;
    if (name === "Saturn") {
      const r = 4.6, R = 9.6, ry = 2.7, t = -16;
      const tr = `transform="rotate(${t} ${f1(x)} ${f1(y)})"`;
      const back = `M${f1(x - R)},${f1(y)} A${R},${ry} 0 0 1 ${f1(x + R)},${f1(y)}`;
      const front = `M${f1(x - R)},${f1(y)} A${R},${ry} 0 0 0 ${f1(x + R)},${f1(y)}`;
      return `<path d="${back}" fill="none" stroke="${PAPER}" stroke-width="3.6" ${tr}></path>` +
        `<path d="${back}" fill="none" stroke="${edge}" stroke-width="1.3" ${tr}></path>` + halo(r + 1.4) +
        `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}" stroke="${edge}" stroke-width="1.1"></circle>` +
        `<path d="${front}" fill="none" stroke="${PAPER}" stroke-width="3.6" ${tr}></path>` +
        `<path d="${front}" fill="none" stroke="${edge}" stroke-width="1.3" ${tr}></path>`;
    }
    if (name === "Jupiter") {
      const r = 6.0, id = "jc" + uid;
      defs.push(`<clipPath id="${id}"><circle cx="${f1(x)}" cy="${f1(y)}" r="${r}"></circle></clipPath>`);
      return halo(r + 1.4) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}"></circle>` +
        `<g clip-path="url(#${id})"><rect x="${f1(x - r)}" y="${f1(y - 2.7)}" width="${2 * r}" height="1.5" fill="${c}"></rect>` +
        `<rect x="${f1(x - r)}" y="${f1(y + 1)}" width="${2 * r}" height="1.7" fill="${c}"></rect></g>` +
        `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="none" stroke="${edge}" stroke-width="1.1"></circle>`;
    }
    if (name === "Mars") {
      const r = 4.8;
      return halo(r + 1.4) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}" stroke="${edge}" stroke-width="1.1"></circle>` +
        `<ellipse cx="${f1(x)}" cy="${f1(y - 2.9)}" rx="2.1" ry="1.05" fill="#ffffff" stroke="${edge}" stroke-width="0.6"></ellipse>`;
    }
    if (name === "Venus") {
      const r = 5.4;
      return halo(r + 1.4) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${mix(c, "#ffffff", 0.7)}" stroke="${edge}" stroke-width="1.1"></circle>`;
    }
    const r = 3.8;
    return halo(r + 1.4) + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${fill}" stroke="${edge}" stroke-width="1.1"></circle>`;
  }

  // ------------------------------------------------------------------ one band
  function bandSvg(ctx, b, night, label, isLast) {
    const { L, G, half, measure, defs, uid, east } = ctx;
    const thick = G.thick, o = [];
    const uOf = (dev) => (dev + half) / (2 * half);
    o.push(`<path d="${b.strip(0, 1, -thick / 2, thick / 2)}" fill="${BAND_FILL}"></path>`);
    for (let dv = -180; dv <= 180; dv += 45) {
      if (Math.abs(dv) < half - 1) {
        const [x0, y0] = b.pt(uOf(dv), -thick / 2), [x1, y1] = b.pt(uOf(dv), thick / 2);
        o.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${GUIDE}" stroke-width="1"></line>`);
      }
    }
    for (let k = 1; k < LANES.length; k++) {
      o.push(`<path d="${b.line(0, 1, thick / 2 - k * L.lane)}" fill="none" stroke="${LANE_LINE}" stroke-width="1"></path>`);
    }
    o.push(`<path d="${b.strip(0, 1, -thick / 2, thick / 2)}" fill="none" stroke="${BAND_LINE}" stroke-width="1"></path>`);

    // label at the left: month, or month + day for the first band of a month, or just the day
    const ly = b.pt(0, 0)[1] + L.labelFs / 3;
    if (label.kind === "month") {
      o.push(textEl(0, ly, label.month, { size: L.labelFs, weight: 600 }));
    } else if (label.kind === "monthday") {
      o.push(textEl(0, ly, label.month, { size: L.labelFs, weight: 600 }));
      o.push(textEl(measure(label.month, L.labelFs, 600) + L.labelFs * 0.33, ly, String(label.day), { size: L.labelFs }));
    } else {
      o.push(textEl(L.dayX, ly, String(label.day), { size: L.labelFs, fill: INK2, anchor: "end" }));
    }

    // compass directions and angles: under every band (monthly) or only under the last one
    if (L.degEvery || isLast) {
      for (let dv = -180; dv <= 180; dv += 15) {
        if (Math.abs(dv) > half + 0.01) continue;
        const u = uOf(dv), [x0, y0] = b.pt(u, -thick / 2), [, , nx, ny] = b.frame(u);
        const az = ((ctx.facing + dv) % 360 + 360) % 360;
        const major = az % 45 === 0;
        const len = major ? 6 : 3.5;
        o.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x0 - nx * len)}" y2="${f1(y0 - ny * len)}" stroke="${BAND_LINE}" stroke-width="1"></line>`);
        if (major) {
          const name = DIR[az], deg = az + "°";
          const w1 = measure(name, 12, 600), w2 = measure(deg, 12, 400), tot = w1 + 3 + w2;
          o.push(textEl(x0 - tot / 2, y0 + 19, name, { size: 12, weight: 600 }));
          o.push(textEl(x0 - tot / 2 + w1 + 3, y0 + 19, deg, { size: 12, fill: INK2 }));
        }
      }
    }

    const glyphs = [], bars = [];
    for (const name of LANES) {
      const runs = night.planets[name] || [];
      if (!runs.length) continue;
      const k = LANES.indexOf(name);
      const hi = thick / 2 - k * L.lane, lo = hi - L.lane;
      const loI = lo + L.inset, hiI = hi - L.inset, mid = (lo + hi) / 2;
      runs.forEach((r, ri) => {
        const u0 = uOf(r.dev0), u1 = uOf(r.dev1);
        if (Math.abs(u1 - u0) < 1e-4) return;
        const dir = u1 >= u0 ? 1 : -1;
        // one continuous fill: full colour in darkness, lighter towards sunset / sunrise
        const [xa, ya] = b.pt(u0, mid), [xb, yb] = b.pt(u1, mid);
        const L2 = Math.max((xb - xa) ** 2 + (yb - ya) ** 2, 1e-6);
        const allDark = r.stops.every((s) => s[1] >= 0.999);
        let fill = COL[name];
        if (!allDark) {
          const gid = `g${uid}_${k}_${ri}`;
          // offsets must rise strictly: equal offsets make PDF shading functions divide by zero
          const kept = [];
          r.stops.forEach(([dv, a], si) => {
            const [px, py] = b.pt(uOf(dv), mid);
            const off = Math.min(1, Math.max(0, ((px - xa) * (xb - xa) + (py - ya) * (yb - ya)) / L2));
            const prev = kept.length ? kept[kept.length - 1][0] : -1;
            if (off > prev + 0.0005) kept.push([off, a]);
            else if (si === r.stops.length - 1 && kept.length > 1) kept[kept.length - 1] = [Math.max(off, kept[kept.length - 2][0] + 0.0005), a];
          });
          if (kept.length === 1) kept.push([1, kept[0][1]]);
          const stops = kept.map(([off, a]) => `<stop offset="${off.toFixed(4)}" stop-color="${mix(COL[name], BAND_FILL, 1 - a)}"></stop>`);
          defs.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f1(xa)}" y1="${f1(ya)}" x2="${f1(xb)}" y2="${f1(yb)}">${stops.join("")}</linearGradient>`);
          fill = `url(#${gid})`;
        }
        o.push(`<path d="${b.strip(u0, u1, loI, hiI)}" fill="${fill}"></path>`);

        // a white cut at every full clock hour
        const inside = (u) => Math.abs(u - u0) > 0.003 && Math.abs(u1 - u) > 0.003;
        for (const [, dv] of r.hours) {
          const uh = uOf(dv);
          if (!inside(uh)) continue;
          const [x0, y0] = b.pt(uh, loI - 0.5), [x1, y1] = b.pt(uh, hiI + 0.5);
          o.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${PAPER}" stroke-width="${L.cutW}"></line>`);
        }

        const [gx, gy] = b.pt(uOf(r.best.dev), mid);
        // small hour number at the start of each block
        if (L.hourNums) {
          const sorted = r.stops.slice().sort((p, q) => p[0] - q[0]);
          const alphaAt = (dv) => {
            if (dv <= sorted[0][0]) return sorted[0][1];
            for (let q = 1; q < sorted.length; q++) {
              if (dv <= sorted[q][0]) {
                const f = (dv - sorted[q - 1][0]) / (sorted[q][0] - sorted[q - 1][0] || 1);
                return sorted[q - 1][1] + (sorted[q][1] - sorted[q - 1][1]) * f;
              }
            }
            return sorted[sorted.length - 1][1];
          };
          const starts = [[r.firstHour, u0]];
          for (const [h, dv] of r.hours) {
            const uh = uOf(dv);
            if (Math.abs(uh - u0) <= 0.003) starts[0] = [h, u0];
            else if (Math.abs(u1 - uh) > 0.003) starts.push([h, uh]);
          }
          starts.forEach(([h, us], si) => {
            const ue = si + 1 < starts.length ? starts[si + 1][1] : u1;
            const [xs, ys] = b.pt(us, mid), [xe, ye] = b.pt(ue, mid);
            if (Math.hypot(xe - xs, ye - ys) < L.hourMinLen) return;
            if (Math.hypot(xs + dir * L.hourClear[0] - gx, ys - gy) < L.hourClear[1]) return;
            const a = alphaAt(us * 2 * half - half + dir * 0.01 * 2 * half);
            if (a < 0.45) return;
            const [, , nx, ny] = b.frame(us);
            const ang = Math.atan2(nx, -ny) * 180 / Math.PI;
            const tx = xs + dir * (-ny) * L.hourOff[0] + nx * L.hourOff[1];
            const ty = ys + dir * nx * L.hourOff[0] + ny * L.hourOff[1];
            const bg = mix(COL[name], BAND_FILL, 1 - a);
            const col = a >= 0.8 ? PAPER : mix(bg, mix(COL[name], "#000000", 0.45), a);
            o.push(`<text x="${f1(tx)}" y="${f1(ty)}" font-family="${FONT}" font-size="${L.hourFs}" font-weight="bold" fill="${col}" ` +
              `text-anchor="${dir > 0 ? "start" : "end"}" transform="rotate(${f1(ang)} ${f1(tx)} ${f1(ty)})">${String(h).padStart(2, "0")}</text>`);
          });
        }
        glyphs.push([name, gx, gy]);

        // a real rise or set: a bar across the lane
        for (const [flag, u] of [[r.rise, u0], [r.set, u1]]) {
          if (!flag) continue;
          const [x0, y0] = b.pt(u, hiI), [x1, y1] = b.pt(u, loI);
          bars.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${mix(COL[name], "#000000", 0.35)}" stroke-width="${L.barW}"></line>`);
        }
      });

      // beside the band: when it comes into view (east side) and when it leaves (west side)
      const first = runs[0], last = runs[runs.length - 1];
      const sides = [[east, first.t0, first.rise, true], [east === "left" ? "right" : "left", last.t1, last.set, false]];
      for (const [side, t, isEvent, isAppear] of sides) {
        const [ex, ey] = b.pt(side === "left" ? 0 : 1, mid);
        const y = ey + L.sideDy;
        if (side === "left") {
          const x = ex - L.sideGap;
          if (isEvent) {
            const wt = measure(t, L.sideFs, 600);
            const ar = arrow(0, 0, L.sideFs, isAppear, INK);
            o.push(arrow(x - wt - ar.width, y, L.sideFs, isAppear, INK).svg);
            o.push(textEl(x, y, t, { size: L.sideFs, weight: 600, anchor: "end" }));
          } else {
            o.push(textEl(x, y, t, { size: L.sideFs, fill: TWI, anchor: "end" }));
          }
        } else {
          const x = ex + L.sideGap;
          if (isEvent) {
            const ar = arrow(x, y, L.sideFs, isAppear, INK);
            o.push(ar.svg);
            o.push(textEl(x + ar.width, y, t, { size: L.sideFs, weight: 600 }));
          } else {
            o.push(textEl(x, y, t, { size: L.sideFs, fill: TWI }));
          }
        }
      }
    }
    o.push(...bars);
    glyphs.forEach(([name, gx, gy], gi) => {
      const g = glyph(name, gx, gy, `${uid}_${gi}`, defs);
      o.push(L.glyph === 1 ? g : `<g transform="translate(${f1(gx)} ${f1(gy)}) scale(${L.glyph}) translate(${f1(-gx)} ${f1(-gy)})">${g}</g>`);
    });
    return o.join("");
  }

  // ------------------------------------------------------------------ text wrapping for the notes
  function wrapWords(words, maxW, measure, size) {
    const lines = [];
    let cur = [], w = 0;
    const space = measure(" ", size, 400);
    for (const wd of words) {
      const ww = measure(wd.t, size, wd.bold ? 600 : 400);
      if (cur.length && w + space + ww > maxW) { lines.push(cur); cur = []; w = 0; }
      if (cur.length) w += space;
      cur.push({ ...wd, x: w, w: ww });
      w += ww;
    }
    if (cur.length) lines.push(cur);
    return lines;
  }

  function richWords(str) {
    // **bold** spans
    const out = [];
    str.split(/(\*\*[^*]+\*\*)/).forEach((chunk) => {
      const bold = chunk.startsWith("**");
      chunk.replace(/\*\*/g, "").split(/\s+/).filter(Boolean).forEach((t) => out.push({ t, bold }));
    });
    return out;
  }

  // ------------------------------------------------------------------ one page
  function pageSvg(opts, nights, labels, pageIndex) {
    const { kind, measure } = opts;
    const L = LAYOUTS[kind], G = geometry(L);
    const defs = [];
    const ctx = { L, G, half: opts.half, measure, defs, facing: opts.facing, east: opts.facing === 180 ? "left" : "right" };
    const body = [];

    // header
    const yTitle = L.padTop + 22;
    const title = `Planets along the ecliptic, ${opts.year}`;
    body.push(textEl(L.padX, yTitle, title, { size: 26 }));
    if (opts.halfLabel) {
      body.push(textEl(L.padX + measure(title, 26, 400) + 8, yTitle, "· " + opts.halfLabel, { size: 26, fill: INK2 }));
    }
    body.push(textEl(PAGE_W - L.padX, yTitle, opts.subtitle, { size: 13, fill: INK2, anchor: "end" }));

    // chart
    const chartTop = L.padTop + 46;
    const bands = nights.map((nt, i) => {
      ctx.uid = `${kind}${pageIndex}_${i}`;
      return bandSvg(ctx, makeBand(G, L, i), nt, labels[i], i === nights.length - 1);
    });
    body.push(`<g transform="translate(${L.padX} ${chartTop})">${bands.join("")}</g>`);

    // footer: key, notes, credits (laid out from the bottom up)
    const W = G.W, x0 = L.padX, bottom = PAGE_H - L.padBottom;
    const notes = wrapWords(richWords(opts.notes), 790, measure, 12);
    const lineH = 17.4;
    const notesTop = bottom - notes.length * lineH;
    notes.forEach((ln, li) => {
      const y = notesTop + (li + 1) * lineH - 5;
      ln.forEach((wd) => body.push(textEl(x0 + wd.x, y, wd.t, { size: 12, weight: wd.bold ? 600 : 400, fill: wd.bold ? INK : INK2 })));
    });
    opts.credits.forEach((c, ci) => {
      body.push(textEl(PAGE_W - L.padX, bottom - 5 - (opts.credits.length - 1 - ci) * 15, c, { size: 12, fill: MUTED, anchor: "end" }));
    });

    // key items
    const items = [];
    for (const name of LANES.slice().reverse()) {
      items.push({ w: 24, h: 16, draw: (x, y) => glyph(name, x + 12, y, `key${kind}${pageIndex}${name}`, defs), label: name, fill: INK });
    }
    const c = COL.Jupiter;
    const gk = `gkey${kind}${pageIndex}`;
    defs.push(`<linearGradient id="${gk}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="44" y2="0"><stop offset="0" stop-color="${PAPER}"></stop><stop offset="1" stop-color="${c}"></stop></linearGradient>`);
    items.push({
      w: 110, h: 12, label: L.hourNums ? "lighter in twilight, from sunset until full darkness; one block per hour"
        : "lighter in twilight, from sunset until full darkness; a cut at every full hour", fill: INK2,
      draw: (x, y) => {
        let s = `<g transform="translate(${f1(x)} ${f1(y - 6)})"><rect x="0" y="0" width="44" height="12" fill="url(#${gk})"></rect>` +
          `<rect x="44" y="0" width="66" height="12" fill="${c}"></rect>` +
          `<line x1="64" x2="64" y1="0" y2="12" stroke="${PAPER}" stroke-width="1.6"></line><line x1="88" x2="88" y1="0" y2="12" stroke="${PAPER}" stroke-width="1.6"></line>`;
        if (L.hourNums) {
          s += `<text x="66.5" y="8.6" font-family="${FONT}" font-size="7" font-weight="bold" fill="${PAPER}">21</text>` +
            `<text x="90.5" y="8.6" font-family="${FONT}" font-size="7" font-weight="bold" fill="${PAPER}">22</text>`;
        }
        return s + "</g>";
      },
    });
    items.push({
      w: 34, h: 12, label: "rises or sets here", fill: INK2,
      draw: (x, y) => `<rect x="${f1(x + 10)}" y="${f1(y - 6)}" width="24" height="12" fill="${c}"></rect>` +
        `<line x1="${f1(x + 10)}" x2="${f1(x + 10)}" y1="${f1(y - 6)}" y2="${f1(y + 6)}" stroke="${mix(c, "#000000", 0.35)}" stroke-width="2.6"></line>`,
    });
    const rows = [[]];
    let cx = 0;
    for (const it of items) {
      const w = it.w + 7 + measure(it.label, 13, 400);
      if (cx > 0 && cx + w > W) { rows.push([]); cx = 0; }
      rows[rows.length - 1].push({ ...it, x: cx });
      cx += w + 20;
    }
    const keyBottom = notesTop - 12;
    rows.forEach((row, ri) => {
      const y = keyBottom - (rows.length - 1 - ri) * 24 - 8;
      row.forEach((it) => {
        body.push(it.draw(x0 + it.x, y));
        body.push(textEl(x0 + it.x + it.w + 7, y + 4.5, it.label, { size: 13, fill: it.fill }));
      });
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" width="${PAGE_W}" height="${PAGE_H}">` +
      `<defs>${defs.join("")}</defs><rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="${PAPER}"></rect>${body.join("")}</svg>`;
  }

  // ------------------------------------------------------------------ public: the three charts
  function dateKey(y, m, d) { return `${y}-${m}-${d}`; }

  /** The nights each chart needs: {monthly:[[y,m,d],...], biweekly:[...], weekly:[...]} */
  function datesFor(year) {
    const monthly = [], biweekly = [], weekly = [];
    for (let m = 1; m <= 12; m++) { monthly.push([year, m, 15]); biweekly.push([year, m, 1], [year, m, 15]); }
    for (let k = 0; ; k++) {
      const dt = new Date(Date.UTC(year, 0, 1 + 7 * k));
      if (dt.getUTCFullYear() !== year) break;
      weekly.push([year, dt.getUTCMonth() + 1, dt.getUTCDate()]);
    }
    return { monthly, biweekly, weekly };
  }

  /**
   * @param kind 'monthly' | 'biweekly' | 'weekly'
   * @param nightsByKey  map dateKey -> computeNight() result
   * @param o { year, lat, lon, place, timesLabel, half, measure, credits }
   * @returns array of page SVG strings
   */
  function renderChart(kind, nightsByKey, o) {
    const dates = datesFor(o.year)[kind];
    const facing = o.lat >= 0 ? 180 : 0;
    const coord = `${Math.abs(o.lat).toFixed(2)}° ${o.lat >= 0 ? "N" : "S"}, ${Math.abs(o.lon).toFixed(2)}° ${o.lon >= 0 ? "E" : "W"}`;
    const cadence = { monthly: "night of the 15th", biweekly: "1st and 15th of each month", weekly: "every 7 days" }[kind];
    const subtitle = [o.place, coord, cadence, o.timesLabel].filter(Boolean).join(" · ");
    const sideText = facing === 180
      ? "Times beside a band: left when the planet comes into view, right when it leaves."
      : "Facing north, east is on the right. Times beside a band: right when the planet comes into view, left when it leaves.";
    const lead = {
      monthly: "Each band is one month (the night of the 15th), with a lane per planet.",
      biweekly: "Each band is one night, on the 1st and 15th of each month, with a lane per planet.",
      weekly: "Each band is one night, every 7 days, with a lane per planet.",
    }[kind];
    const notes = `${lead} Left to right is the compass direction you face, the same for every lane, so a planet's line starts where it comes into view and ends where it leaves. ${sideText} **Bold times with an arrow** are real rises and sets, at the dark bar on the line; plain grey times are sunset or sunrise, for a planet that is already up when the Sun sets or still up when it rises. ` +
      (LAYOUTS[kind].hourNums ? "The small numbers give the clock hour of each block." : "Count the hour cuts from the first time to read the hour at any direction.");

    const pages = kind === "monthly" ? [dates] : [dates.filter((d) => d[1] <= 6), dates.filter((d) => d[1] >= 7)];
    const halfLabels = kind === "monthly" ? [null] : ["January–June", "July–December"];
    return pages.map((ds, pi) => {
      const nights = ds.map(([y, m, d]) => nightsByKey[dateKey(y, m, d)]);
      const labels = ds.map(([, m, d], i) => {
        if (kind === "monthly") return { kind: "month", month: SHORT[m - 1] };
        const firstOfMonth = kind === "biweekly" ? d === 1 : d <= 7;
        return firstOfMonth ? { kind: "monthday", month: SHORT[m - 1], day: d } : { kind: "day", day: d };
      });
      return pageSvg({ kind, measure: o.measure, half: o.half, facing, year: o.year, halfLabel: halfLabels[pi], subtitle, notes, credits: o.credits }, nights, labels, pi);
    });
  }

  const api = { renderChart, datesFor, dateKey, LAYOUTS, PAGE_W, PAGE_H, COL, LANES };
  root.PlanetChart = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
