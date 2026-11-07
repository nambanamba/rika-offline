// 図解の共通部品。各回の figs_0N.js が使う
// area(o, stage): つるかめ算の面積図 / table(rows, hl, note): 表 / bars(lines, unit, note): 線分図
(function () {
  const C = {ink: "var(--ink)", muted: "var(--muted)", teal: "var(--teal)", tealSoft: "var(--teal-soft)", red: "var(--red)", redSoft: "var(--red-soft)", line: "var(--line)"};
  const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 14}" text-anchor="${o.anchor || "middle"}" fill="${o.fill || C.ink}" font-weight="${o.bold ? 700 : 400}">${s}</text>`;
  const R = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.fill || "none"}" stroke="${o.stroke || C.ink}" stroke-width="${o.sw || 1.5}" ${o.dash ? 'stroke-dasharray="5 4"' : ""}/>`;
  const tw = (s, size = 14) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? 1 : 0.58), 0) * size;
  const svg = (w, h, body) => `<svg viewBox="0 0 ${w} ${h}" role="img" style="width:100%;max-width:${w * 1.4}px;height:auto;font-family:inherit">${body}</svg>`;

  // つるかめ算の面積図。n=全体の個数, lo/hi=1つあたり, k=高い方の個数(答え), stage 1..3
  function area(o, stage) {
    const X0 = 70, W = 300, B = 170, Hhi = 120, Hlo = Math.round(Hhi * o.lo / o.hi);
    const wk = Math.round(W * o.k / o.n);
    let s = "";
    s += R(X0, B - Hlo, W, Hlo, {fill: C.tealSoft});
    s += T(X0 + W / 2, B - Hlo / 2 + 5, stage >= 1 ? o.lowText : "");
    if (stage >= 2) {
      s += R(X0, B - Hhi, wk, Hhi - Hlo, {fill: C.redSoft, stroke: C.red, dash: true});
      const gy = B - Hlo - (Hhi - Hlo) / 2 + 5;
      s += tw(o.gapText) + 12 < wk ? T(X0 + wk / 2, gy, o.gapText, {fill: C.red, bold: true}) : T(X0 + wk + 8, gy, o.gapText, {anchor: "start", fill: C.red, bold: true});
      s += `<line x1="${X0 - 8}" y1="${B - Hhi}" x2="${X0}" y2="${B - Hhi}" stroke="${C.ink}"/>` + T(X0 - 12, B - Hhi + 5, o.hiLabel, {anchor: "end"});
    }
    s += `<line x1="${X0 - 8}" y1="${B - Hlo}" x2="${X0}" y2="${B - Hlo}" stroke="${C.ink}"/>` + T(X0 - 12, B - Hlo + 5, o.loLabel, {anchor: "end"});
    s += `<line x1="${X0}" y1="${B + 12}" x2="${X0 + W}" y2="${B + 12}" stroke="${C.muted}"/>` + T(X0 + W / 2, B + 30, o.nLabel, {fill: C.muted});
    if (stage >= 3) s += `<line x1="${X0}" y1="${B - Hhi - 10}" x2="${X0 + wk}" y2="${B - Hhi - 10}" stroke="${C.red}" stroke-width="2"/>` + T(X0 + wk / 2, B - Hhi - 16, o.kText, {fill: C.red, bold: true});
    return svg(400, 210, s);
  }
  // 表。rows=[[見出し, ...値]], hl=強調する列番号の配列, note=下の一言
  function table(rows, hl = [], note = "") {
    const cols = rows[0].length - 1, rh = 34;
    const hw = Math.max(70, ...rows.map(r => tw(r[0], 13) + 18));
    const cw = [...Array(cols)].map((_, j) => Math.max(44, ...rows.map(r => tw(r[j + 1] ?? "", 14) + 16)));
    const xs = cw.reduce((a, c) => (a.push(a[a.length - 1] + c), a), [5 + hw]);
    const w = Math.max(xs[cols] + 5, note ? tw(note) + 10 : 0), h = rh * rows.length + (note ? 34 : 10);
    let s = "";
    rows.forEach((r, i) => {
      const y = 5 + i * rh;
      s += R(5, y, hw, rh, {fill: C.tealSoft, stroke: C.line}) + T(5 + hw / 2, y + 22, r[0], {size: 13});
      for (let j = 1; j <= cols; j++) {
        const x = xs[j - 1], c = cw[j - 1], on = hl.includes(j);
        s += R(x, y, c, rh, {fill: on ? C.redSoft : "none", stroke: on ? C.red : C.line}) + T(x + c / 2, y + 22, r[j] ?? "", {fill: on ? C.red : C.ink, bold: on});
      }
    });
    if (note) s += T(5, rh * rows.length + 28, note, {anchor: "start", fill: C.teal, size: 14});
    return svg(w, h, s);
  }
  // 線分図。lines=[{label, segs:[{u:長さ, t:文字, red}], right}]
  function bars(lines, unit = 40, note = "") {
    const X0 = Math.max(...lines.map(l => tw(l.label))) + 20, rh = 48;
    let s = "", maxX = 0;
    lines.forEach((l, i) => {
      const y = 14 + i * rh; let x = X0;
      s += T(X0 - 10, y + 20, l.label, {anchor: "end"});
      for (const g of l.segs) {
        const w = g.u * unit;
        s += R(x, y, w, 28, {fill: g.red ? C.redSoft : C.tealSoft, stroke: g.red ? C.red : C.ink, dash: g.dash}) + T(x + w / 2, y + 19, g.t || "", {fill: g.red ? C.red : C.ink, bold: g.red, size: 13});
        x += w;
      }
      if (l.right) { s += T(x + 8, y + 19, l.right, {anchor: "start", fill: C.teal, bold: true}); x += tw(l.right) + 12; }
      maxX = Math.max(maxX, x);
    });
    if (note) s += T(X0, 14 + lines.length * rh + 14, note, {anchor: "start", fill: C.teal});
    return svg(Math.max(maxX, X0 + tw(note)) + 10, lines.length * rh + (note ? 44 : 20), s);
  }

  window.FIGLIB = {area, table, bars, svg, T, R, tw, C};
})();
