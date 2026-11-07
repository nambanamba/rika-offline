/* ---------- 今日のプリント（範囲の回をまたいで1日○問を決め、PDFにして、写真でまとめて◎付け） ---------- */
const DAYC = "daysAll";   // 回をまたいだ「今日の問題」
const MARU = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚";
const todayKey = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const todayLabel = () => { const d = new Date(); return `${d.getMonth() + 1}月${d.getDate()}日（${"日月火水木金土"[d.getDay()]}）`; };
let day = null, dayPhotos = [], dayMarks = null, dayBusy = false, dayMsg = "", downloads = null, assets = null, pdfUrl = "";
// 保存とアップロードの仕組みは、開いた時点で準備しておく（押してから待たせない）
const capReady = (async () => { if (!window.claude) return;
  try { downloads = await claude.use("downloads"); } catch (e) {}
  try { assets = await claude.use("assets"); } catch (e) {} })();
const dayValid = d => d && Array.isArray(d.items) && d.items.every(e => e && typeof e === "object" && e.k);
try { day = JSON.parse(localStorage.getItem("rika-step-dayAll") || "null"); } catch (e) {}
if (!dayValid(day)) day = null;

// その日の問題を決める（数えるのは小問）
// - 範囲の回ぜんぶの系統から、1日に同じ系統は1問だけ。系統の「いまの1問」は 例題→類題→基本（→反復基本）の、まだ済んでいない最初
// - 「今週の回」から curShare 問、前の回の残りから残りの数。足りなければもう片方で埋める
// - どちらの中でも: ×だった問題 → 出せる練習・反復練習 → 新しい問題。前の回は古い回から
function candidates(n) {
  const m = MS[n];
  // 当面は例題・類題・基本まで（ユーザー 2026-10-05）。練習・反復練習は消さずに、おすすめに入れないだけ。手で選ぶことはできる
  const ren = PRACTICE_ON ? m.PRACTICE.filter(r => !m.itemOk(r) && m.ready(r)) : [];
  // 5年上の復習（前に習った単元）: 例題が1回で全部◎なら、その系統は身についているので類題・基本は出さない（2026-10-09 ユーザー）
  const enough = u => isReview(n) && u.steps.length > 1 && m.firstOk(u.steps[0]);
  // 今週の回など（5年下）: 例題が1回で全部◎なら、その系統の類題は飛ばして基本問題へ（2026-10-10 ユーザー了承）
  const skipRui = (u, p) => n < 100 && m.kind(p) === "類題" && m.firstOk(u.steps[0]);
  // ×だった例題は、次の日は「例題の解き方を見てから類題」。その次の日に例題をもう一度（2026-10-10 ユーザー）
  const lastT = p => Math.max(0, ...p.subs.map((_, i) => (m.last(p, i) || {}).t || 0));
  const pick = u => { const p = m.unitItems(u).find(q => !m.itemOk(q) && !skipRui(u, q)); if (!p) return null;
    if (m.kind(p) === "例題" && m.itemTried(p)) { const r = u.steps.find(q => m.kind(q) === "類題");
      if (r && lastT(r) < lastT(p)) return Object.assign({p: r, rev: p.id}, m.itemOk(r) ? {only: r.subs.map((_, i) => i)} : {}); }
    return {p}; };
  const lines = m.UNITS.filter(u => !enough(u)).map(pick).filter(Boolean);
  const tag = x => ({k: n, p: x.p || x, retry: m.itemTried(x.p || x), rev: x.rev, only: x.only});
  return [...ren.map(p => tag({p})), ...lines.map(tag)];
}
// 算数の特別な決まり（テストの直し・5年上の復習・計算・組分けの系統）は、理科には無い
const isReview = n => false;
const PRACTICE_ON = true;   // 練習問題は、土台の系統（例題→類題→基本）ができたらおすすめに入れる
// おすすめ: 日替わり（SETTINGS.rot。既定）か、前のやり方（1日○問・今週の回から○問）
// 2026-10-25 ユーザー決定「偏差値50。多段はやらなくていい。簡単なのを確実に。1日4問のまま」→ 既定は毎日「1段」4問（d）。
//   前の日替わり（1段→2段→3段以上）は SETTINGS.rot3 で戻せる
const planDay = t => SETTINGS.rot !== false ? planRot(rotOverride || autoKind(t), t) : planOld();

/* ---- 日替わり（2026-10-25 ユーザー決定。計算プリントと同じ決まり。〜11/5 までの説明。いまは rot3 のときだけ。◎の出し直しは 11/6 にやめた） ----
   ① 1段の日＝4問 → ② 2段の日＝2問 → ③ 3段以上の日＝1問 → ① …（数えるのは小問）
   - 何段かは dan.js（本の解き方の式で数えた）。1段のうち暗算でできるもの（a）は紙に出さない（暗記カードにある）
   - 日の種類は、日づけの通し番号を3で割った余り（計算プリントの tadanDayKind と同じ式。同じ日は何度作っても同じ）
   - 選ぶ順: 今週の回が先（3日に1日は前の回が先。計算プリントの mix_every 3 と同じ）。その中で
     × → まだ出していない → ◎のあと3日・7日あけての出し直し（◎3回で卒業）→ 卒業して7日以上。同じ順位なら本の順（系統の 例題→類題→基本→週テスト、そのあと練習問題）
   - 1日に同じ系統は半分まで（4問なら2問まで）。足りなければ同じ系統からも
   - 前と同じ: 例題が1回で全部◎なら、その系統の類題は出さない／×の例題のあとの類題には、例題の解き方のページをつける（rev）
   - 記録は読むだけ（書きかえない） */
/* ---- 毎日4問（2026-10-25 ユーザー決定。既定。kind "d"） ----
   - 〜11/5 まで: 毎日「1段」を4問・2段以上は自動で出さない・× → まだ → ◎のあと3日・7日の出し直し（11/6 に下の★に置きかえ）
   - 組分けの前（SPREAD の期間）は、その日の主の回の問題を先に（主の回の紙 → 主の回の暗算）、そのあと①②③
   - 同じ系統は1日2問まで。S問題・受ける前の週テストは出ない（model.js の testHidden）
   ★2026-11-06 ユーザー「できてない、前やってない問題を出します。できる問題しかないならレベルを上げてください」
   - 先に出すのは ×（いちばん新しい答えが×）と まだ（記録なし）。3日・7日の出し直しはやめた
   ★2026-11-06 ユーザー「丸になっても忘れるので、復習は必要です」→ ×・まだが全部の段で無くなったら、◎を「最後に◎になった日が古い順」に出す
   - 範囲の1段の×・まだが4問に足りなければ、範囲の2段の×・まだ、それでも足りなければ3段以上、そのあと範囲より前の回の1段
   - 同じ段の中は × → まだ、その中で 主の回 → 紙 → 暗算 → 回の順 → 本の順 */
const ROT = ["1", "2", "3"];
const ROT_N = {"d": 4, "1": 4, "2": 2, "3": 1};
const ROT_NAME = {"d": "1段の日", "1": "1段の日", "2": "2段の日", "3": "3段以上の日"};
const dayNo = t => { const d = new Date(t || Date.now()); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); };
const rotKind = t => ROT[dayNo(t) % ROT.length];
const autoKind = t => SETTINGS.rot3 ? rotKind(t) : "d";   // rot3: 前の日替わりに戻す
let rotOverride = null;   // 今日だけ種類を変える（保存しない）
const dateKeyOf = t => { const d = new Date(t || Date.now()); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const hashS = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const danStr = (k, id) => ((window.DAN || {})[k] || {})[id] || "";
// 単独では出さない小問（dan.js の DAN_NOSOLO。前の小問の答えに足す・引くだけ。2026-10-30 ユーザー方針）。自動のおすすめに出さない（手で選ぶのは可）
const noSolo = (k, id, i) => ((((window.DAN_NOSOLO || {})[k] || {})[id]) || []).includes(i);
// 小問の順位（小さいほど先）。null は今日は出さない
function subRank(k, p, i, now) {
  const a = recOf(k)[MS[k].sk(p, i)] || [];
  if (!a.length) return 1;                   // まだ
  const last = a[a.length - 1];
  if (!last.ok) return 0;                    // ×
  return 2;                                  // ◎: ×・まだが全部の段で無くなったら、最後に◎になった日が古い順（2026-11-06 ユーザー）
}
function rotCands(k, kind, now) {
  const m = MS[k], out = [];
  const list = [...m.UNITS.flatMap(u => [...u.steps, ...u.extra].map(p => ({p, u}))), ...m.PRACTICE.map(p => ({p, u: null}))];
  list.forEach(({p, u}, pos) => {
    const s = danStr(k, p.id); if (!s || m.skipped(p)) return;
    if (u && m.kind(p) === "類題" && m.kind(u.steps[0]) === "例題" && m.firstOk(u.steps[0])) return;
    p.subs.forEach((_, i) => { if (s[i] !== kind || noSolo(k, p.id, i)) return;
      const r = subRank(k, p, i, now); if (r === null) return;
      out.push({k, p, i, u: k + ":" + (u ? u.id : p.id), r, pos, t: (m.last(p, i) || {}).t || 0}); });
  });
  return out;
}
// 回の順: 今週の回 → 前の回（範囲の中で今週より前。無ければ今週より前の全部）→ 範囲のほかの回。3日に1日は前の回が先
// 組分けの前（2026-10-25 ユーザー承認）: 期間の中だけ、範囲の回を日ごとに順番に回す（範囲6〜9なら 11/1 第6回→第7回→第8回→第9回→第6回…）。
//   その日の主の回から先に選び、足りなければ次の回、その次…。1日の問題数・S問題・受ける前の週テストの決まりは変えない
const SPREAD = {from: "2026-11-01", to: "2026-11-07"};
function spreadOrder(now) {
  const dk = dateKeyOf(now), R = SETTINGS.range.slice().sort((a, b) => a - b);
  if (dk < SPREAD.from || dk > SPREAD.to || !R.length) return null;
  const s = (dayNo(now) - dayNo(new Date(SPREAD.from + "T12:00:00").getTime())) % R.length;
  return [...R.slice(s), ...R.slice(0, s)];
}
function rotGroups(now) {
  const sp = spreadOrder(now);
  if (sp) return {mix: false, spread: sp, groups: [sp]};
  const cur = SETTINGS.cur, inR = SETTINGS.range.filter(n => n < cur);
  const back = (inR.length ? inR : KAI_LIST.filter(n => n < cur)).slice().reverse();   // 近い回から
  const rest = SETTINGS.range.filter(n => n !== cur && !back.includes(n));
  const mix = back.length > 0 && hashS(dateKeyOf(now)) % 3 === 0;
  return {mix, groups: mix ? [back, [cur], rest] : [[cur], back, rest]};
}
// 前の日に出た問題は、次の日に出さない（2026-11-02 ユーザー OK「同じ問題が2日続かない並べ方」。明日から）
//   - 前の日 = 今日より前で、いちばん新しい「プリントの日」（daysAll の前の日の分・控え rika-step-prevDay）か「◎×をつけた日」（記録の t）
//   - その日に出た問題（回|id。小問がちがっても同じ問題）は今日の候補のうしろに回す。ただし×は次の日に先に出す（11-03 ユーザー）
//   - 候補が足りないときだけ、前の日の問題からも出す（4問を割らない）。記録は読むだけ
const PREV_LS = "rika-step-prevDay";
function prevDayItems(now) {
  const today = dateKeyOf(now), days = [], seen = [];
  try { if (typeof day !== "undefined" && day && day.date && day.date < today && Array.isArray(day.items)) days.push(day); } catch (e) {}
  try { const v = JSON.parse(localStorage.getItem(PREV_LS) || "null"); if (v && v.date && v.date < today && Array.isArray(v.items)) days.push(v); } catch (e) {}
  let pk = ""; days.forEach(d => { if (d.date > pk) pk = d.date; });
  KAI_LIST.forEach(k => { const R = recOf(k) || {};
    Object.keys(R).forEach(key => (R[key] || []).forEach(x => { if (!x || !x.t) return; const dk = dateKeyOf(x.t); if (dk >= today) return;
      seen.push([k, key.replace(/_\d+$/, ""), dk]); if (dk > pk) pk = dk; })); });
  const S = new Set(); if (!pk) return S;
  days.forEach(d => { if (d.date === pk) d.items.forEach(e => S.add(+e.k + "|" + e.id)); });
  seen.forEach(([k, id, dk]) => { if (dk === pk) S.add(k + "|" + id); });
  return S;
}
function planRot(kind, t) {
  const now = t || Date.now(), N = ROT_N[kind] || 1, {groups, spread} = rotGroups(now);
  const gi = {}; groups.forEach((g, j) => g.forEach((n, x) => { if (!(n in gi)) gi[n] = j * 100 + x; }));
  const byRank = (a, b) => a.r - b.r || (a.r === 0 ? a.t - b.t : 0) || a.pos - b.pos || a.i - b.i;
  let all;
  if (kind === "d") {
    const R = SETTINGS.range, inR = Object.keys(gi).map(Number).filter(n => R.includes(n));
    const before = KAI_LIST.filter(n => n < Math.min(...R)).reverse();   // 範囲より前の回（近い回から）
    before.forEach((n, x) => { if (!(n in gi)) gi[n] = 9000 + x; });
    const main = spread ? spread[0] : null;
    // lv: 0=範囲の1段 1=範囲の2段 2=範囲の3段以上 3=範囲より前の回の1段 9=◎（どの段も）。同じ lv の中は × → まだ → 主の回 → 紙・暗算 → 回の順 → 本の順。◎は最後に◎になった日が古い順（2026-11-06）
    const tag = (xs, lv, sub) => xs.map(c => Object.assign(c, {lv: c.r === 2 ? 9 : lv, tier: (c.k === main ? 0 : 10) + sub}));
    all = [...inR.flatMap(n => tag(rotCands(n, "1", now), 0, 0)), ...inR.flatMap(n => tag(rotCands(n, "a", now), 0, 1)),
      ...inR.flatMap(n => tag(rotCands(n, "2", now), 1, 0)), ...inR.flatMap(n => tag(rotCands(n, "3", now), 2, 0)),
      ...before.flatMap(n => tag(rotCands(n, "1", now), 3, 0))]
      .sort((a, b) => a.lv - b.lv || (a.lv === 9 ? a.t - b.t : 0) || a.r - b.r || a.tier - b.tier || gi[a.k] - gi[b.k] || byRank(a, b));
  } else all = Object.keys(gi).map(Number).flatMap(n => rotCands(n, kind, now))
    .sort((a, b) => gi[a.k] - gi[b.k] || byRank(a, b));
  // 前の日に出た問題はうしろへ（同じ系統は2問まで、のほうを先に守る: 新しい・系統OK → 前の日・系統OK → 新しい → 前の日）
  // ★2026-11-03 ユーザー「正解した問題は次の日は出さない。間違えた問題は次の日出して」→ ×（r=0）は前の日でも後ろに回さない（先に出る）。◎は×・まだが無くなってから古い順（11-06）
  const prev = prevDayItems(now), isPrev = c => c.r !== 0 && prev.has(c.k + "|" + c.p.id);
  const prevNg = c => c.r === 0 && prev.has(c.k + "|" + c.p.id);   // 前の日に×だった問題は、回の順より先（その日の主の回でなくても出す）
  all = [...all.filter(prevNg), ...all.filter(c => !prevNg(c))].sort((a, b) => (a.lv || 0) - (b.lv || 0));   // 段（lv）は上げない: 前の日の×も同じ段の中で先（2026-11-06）
  const fresh = all.filter(c => !isPrev(c)), stale = all.filter(isPrev);
  const cap = Math.max(1, Math.ceil(N / 2)), per = {}, pick = [];
  const take = (xs, capOn) => xs.forEach(c => { if (pick.length >= N || pick.includes(c) || (capOn && (per[c.u] || 0) >= cap)) return; per[c.u] = (per[c.u] || 0) + 1; pick.push(c); });
  // 段（lv）ごとに: 下の段の×・まだ（前の日の問題も）を使い切ってから上の段へ（2026-11-06）
  [...new Set(all.map(c => c.lv || 0))].sort((a, b) => a - b).forEach(lv => { const f = fresh.filter(c => (c.lv || 0) === lv), s = stale.filter(c => (c.lv || 0) === lv);
    take(f, true); take(s, true); take(f, false); take(s, false); });
  const out = [];
  pick.forEach(c => { let e = out.find(o => o.k === c.k && o.id === c.p.id);
    if (!e) { e = {k: c.k, id: c.p.id, subs: []}; out.push(e); }
    if (isPrev(c)) Object.defineProperty(e, "again", {value: true, enumerable: false});   // 候補が足りず前の日の問題から出した印（保存されない。試しの検査用）
    e.subs.push(c.i); e.subs.sort((a, b) => a - b); });
  // ×の例題のあとの類題: 例題の解き方のページをつける（前と同じ）
  out.forEach(e => { const m = MS[e.k], p = m.ITEMS[e.id], u = m.UNIT_OF[e.id]; if (!u || m.kind(p) !== "類題") return;
    const r = u.steps[0]; if (!r || m.kind(r) !== "例題" || !r.subs.some((_, i) => { const l = m.last(r, i); return l && !l.ok; })) return;
    const lt = q => Math.max(0, ...q.subs.map((_, i) => (m.last(q, i) || {}).t || 0));
    if (lt(p) < lt(r)) e.rev = r.id; });
  return out;
}
function planOld() {
  const N = SETTINGS.perDay, cur = SETTINGS.cur;
  const order = list => [...list.filter(c => c.retry), ...list.filter(c => !c.retry)];
  const curPool = order(SETTINGS.range.includes(cur) ? candidates(cur) : []);
  // ほかの回は古い回から（×だった問題が先）
  const backPool = order(SETTINGS.range.filter(n => n !== cur).flatMap(candidates));
  const out = []; let total = 0;
  const take = (pool, limit) => {
    for (const c of pool) {
      if (out.some(o => o.k === c.k && o.id === c.p.id)) continue;
      const due0 = c.only ? c.only : c.p.subs.map((_, i) => i).filter(i => !MS[c.k].subOk(c.p, i));
      const due = due0.filter(i => !noSolo(c.k, c.p.id, i) || due0.includes(i - 1));   // 単独で出さない小問は、すぐ前の小問と一緒のときだけ
      const wt = itemW(c.k, c.p.id, due.length);
      if (!due.length || total + wt > limit) continue;
      out.push(Object.assign({k: c.k, id: c.p.id, subs: due}, c.rev ? {rev: c.rev} : {})); total += wt;
    }
  };
  take(curPool, Math.min(N, SETTINGS.curShare));
  take(backPool, N);
  take(curPool, N);
  return out;
}
const dayEntries = () => (day && Array.isArray(day.items) ? day.items : []).map(e => ({k: +e.k, m: MS[+e.k], p: MS[+e.k] && MS[+e.k].ITEMS[e.id], rev: e.rev, subs: (Array.isArray(e.subs) ? e.subs : []).map(Number)}))
  .filter(e => e.p).map(e => ({...e, subs: e.subs.filter(i => i >= 0 && i < e.p.subs.length).length ? e.subs.filter(i => i >= 0 && i < e.p.subs.length) : e.p.subs.map((_, i) => i)}));
const subName = (p, i) => p.subs[i] || "";
// プリントに出す「これまで」: 長い順に候補を返す（入らなければ短いほうを使う）
function histLine(e) {
  const a = e.subs.flatMap(i => (recOf(e.k)[e.m.sk(e.p, i)] || []).map(x => ({x, sn: e.subs.length > 1 ? subName(e.p, i) : ""}))).filter(r => r.x.t > 1e11).sort((p, q) => p.x.t - q.x.t);
  if (!a.length) return ["はじめて"];
  const ng = a.filter(r => !r.x.ok).length, md = t => { const d = new Date(t); return (d.getMonth() + 1) + "/" + d.getDate(); };
  const marks = k => a.slice(-k).map(r => md(r.x.t) + r.sn + (r.x.ok ? "◎" : "×")).join(" ");
  const tail = ng ? `（×${ng}回）` : "";
  return [`これまで ${marks(5)}${tail}`, `これまで ${marks(3)}${tail}`, `これまで ${marks(1)}${tail}`, ng ? `×${ng}回` : "◎"];
}
// 一部の小問だけ出すときは、題の「問4・5」のような小問の並びを外す（「問4・5」と「問4だけ」が並ぶと 問5もやると思ってしまう。2026-11-07 ユーザー）
const noOf = e => e.subs.length < e.p.subs.length ? e.p.no.replace(/\s*問[0-9０-９・①-⑳()（）]+$/, "") : e.p.no;
const entryLabel = e => `${kaiName(e.k)} ` + noOf(e) + (e.subs.length < e.p.subs.length ? " " + e.subs.map(i => subName(e.p, i)).join("") + "だけ" : "");
// 数え方: 問題に w（何問と数えるか）があればそれを使う。秒で終わる小問がたくさんある問題（素因数分解など）を1問ずつ数えないため（2026-10-08 ユーザー）
const itemW = (k, id, nSubs) => { const p = MS[k] && MS[k].ITEMS[id]; if (!p || !p.w) return nSubs; return Math.max(1, Math.round(p.w * nSubs / p.subs.length)); };
const countSubs = es => es.reduce((a, e) => a + itemW(e.k, e.p ? e.p.id : e.id, e.subs.length), 0);
// 子どもの画面は「今日の分」だけ: 今日つけた◎×だけを出す（前の日の◎×は出さない。2026-10-08 ユーザー）
const isToday = t => t && new Date(t).toDateString() === new Date().toDateString();
const todayMarkK = (m, p, i) => { const l = m.last(p, i); return l && isToday(l.t) ? (l.ok ? "◎" : "×") : "・"; };
const markK = (m, p, i) => m.skipped(p) ? "－" : m.last(p, i) ? (m.subOk(p, i) ? "◎" : "×") : "・";
async function saveDay() {
  try { localStorage.setItem("rika-step-dayAll", JSON.stringify(day)); } catch (e) {}
  if (db && day) { try { await db.doc(DAYC + "/current").set(day); } catch (e) {} }
}

// 子どもの画面: 今日のプリントの一覧。押すとその問題（答え合わせ・解説・◎×）が開く
function renderKid(el) {
  let h = `<div class="th"><h2>今日のプリント</h2><span class="note">${day && day.date && day.date !== todayKey() ? day.date.slice(5).replace("-", "/") + " に決めた問題" : todayLabel()}</span></div>`;
  if (!day) { el.innerHTML = h + `<p class="note">今日のプリントは、まだ用意されていません。おうちの人に用意してもらってね。</p>`; return; }
  const es = dayEntries();
  const done = es.filter(e => e.subs.every(i => { const l = e.m.last(e.p, i); return l && isToday(l.t); })).length;
  h += `<p class="note">${es.length}問のうち ${done}問 答え合わせずみ。問題を押して、答え合わせと解説をしよう。</p>`;
  h += `<div class="row"><button class="primary" id="icsgo">画面で 解く（ペンで書く）</button></div>`;
  h += `<ul class="klist">${es.map((e, j) => { try {
    const on = e.k === KAI_NO && e.p.id === curId;
    const st = e.subs.map(i => todayMarkK(e.m, e.p, i)).join("");
    return `<li><button class="${on ? "on" : ""}" data-gok="${e.k}|${e.p.id}"><span class="kno">${MARU[j]}</span><span>${esc(entryLabel(e))}</span><span class="kst">${st}</span></button></li>`;
  } catch (err) { SHOWERR.push("kid " + e.k + ":" + e.p.id + " " + err.message); return ""; } }).join("")}</ul>`;
  el.innerHTML = h;
  el.querySelectorAll("[data-gok]").forEach(b => b.onclick = () => { const [k, id] = b.dataset.gok.split("|"); goToAny(+k, id); });
  const ig = el.querySelector("#icsgo"); if (ig) ig.onclick = () => icsOpen();
}
function kidNext(p) {
  const es = dayEntries(), j = es.findIndex(e => e.k === KAI_NO && e.p.id === p.id), nx = es[j + 1];
  if (nx) goToAny(nx.k, nx.p.id); else { curId = null; resetWork(); render(); window.scrollTo(0, 0); }
}
// 図の説明を前もって作る（親が今日を始めたとき）。1問ずつ順に。保存先は index.html の図の説明と同じ
let prep = null;   // {done, total, fail}
function vizTargetOf(e) {
  const key = ((window.KEYS || {})[e.k] || {})[e.p.id];
  const t = key ? e.p : ((e.m.UNIT_OF[e.p.id] || {}).steps || [e.p])[0];
  return {t, key: ((window.KEYS || {})[e.k] || {})[t.id], ck: e.k + "_" + t.id};
}
async function hasViz(ck, t) {
  try { if (vizUsable(t, JSON.parse(localStorage.getItem("rika-viz-" + ck) || "null"))) return true; } catch (e) {}
  if (db) { try { const d = await db.doc("viz/" + ck).get(); if (d.exists && d.data().json && vizUsable(t, JSON.parse(d.data().json))) { try { localStorage.setItem("rika-viz-" + ck, d.data().json); } catch (e) {} return true; } } catch (e) {} }
  return false;
}
async function prepareViz() {
  return;   // 理科では図の説明を Claude に作らせない（本の数字で作った「図で見る」を使う）
  if (!sample || prep && prep.running) return;
  const seen = new Set(), list = [];
  for (const e of dayEntries()) { const v = vizTargetOf(e); if (v.key && !seen.has(v.ck)) { seen.add(v.ck); list.push(v); } }
  prep = {done: 0, total: list.length, fail: 0, running: true}; renderToday();
  // 3問ずつ同時に作る
  let next = 0, stop = false;
  const one = async v => {
    if (await hasViz(v.ck, v.t)) return;
    try {
      let imgs = [];
      if (canImg && !v.t.fig) { try { imgs = [await (await fetch(await imgReady(v.t.img))).blob()]; } catch (e) {} }
      const d = await sample.json(vizPromptFor(v.t, v.key, "", imgs.length > 0), imgs.length ? {images: imgs} : {});
      if (lectOf(v.t)) d.lect = true;
      if (!vizUsable(v.t, d)) throw 0;
      const js = JSON.stringify(d);
      try { localStorage.setItem("rika-viz-" + v.ck, js); } catch (e) {}
      if (db) { try { await db.doc("viz/" + v.ck).set({json: js, t: Date.now()}); } catch (e) {} }
    } catch (e) { prep.fail++; if (e && e.code === "rate_limited") stop = true; }
  };
  const worker = async () => { while (!stop && next < list.length) { const v = list[next++]; await one(v); prep.done++; renderToday(); } };
  await Promise.all([worker(), worker(), worker()]);
  prep.running = false; renderToday();
}
// 親が選ぶ: おすすめ（planDay）をもとに、外す・◎にする・足す
let draft = null, lastDraftJs = null;   // [{k,id,subs}]（始める前の選択。この端末とアプリに保存）
try { const v = localStorage.getItem("rika-step-draft"); if (v) { draft = JSON.parse(v); lastDraftJs = v; } } catch (e) {}
function saveDraft() {
  const js = JSON.stringify(draft || []); if (js === lastDraftJs) return; lastDraftJs = js;
  try { localStorage.setItem("rika-step-draft", js); } catch (e) {}
  if (db) db.doc("settings/draft").set({items: draft || [], t: Date.now()}).catch(() => {});
}
const dueSubs = (m, p) => p.subs.map((_, i) => i).filter(i => !m.subOk(p, i));
// 今の今日の問題の一覧（始めたあとは day、始める前は候補）
const curList = () => day ? day.items : (draft || (draft = []));
const inToday = (k, id) => curList().some(e => e.k === k && e.id === id);
async function toggleToday(k, id) {
  const L = curList(), j = L.findIndex(e => e.k === k && e.id === id), m = MS[k], p = m.ITEMS[id];
  if (j >= 0) L.splice(j, 1);
  else { const subs = dueSubs(m, p); L.push({k, id, subs: subs.length ? subs : p.subs.map((_, i) => i)}); }
  lastAct = `${j >= 0 ? "外した" : "入れた"}：${kaiName(k)} ${p.no}`;
  sortList(L);
  if (day) { await saveDay(); if (j < 0) prepareViz(); }
  render();
}
// 並び順: テキスト（予習シリーズ）のページ順 → 演習問題集のページ順（同じページは上から）
function sortList(L) {
  const key = e => { const p = MS[e.k] && MS[e.k].ITEMS[e.id]; const c = (p && p.crop) || [0, 0];
    return [(p && p.src === "enshu") ? 1 : 0, c[0], c[1]]; };
  // ord があるもの（塾の順番などで並べた日）はその順番を先に。ord のないものはその後ろに本の順で（2026-10-07 ユーザー）
  const od = e => typeof e.ord === "number" ? e.ord : 1e9;
  L.sort((a, b) => { const x = key(a), y = key(b); return od(a) - od(b) || x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
  return L;
}
// 小問1つだけを入れる／外す
async function toggleTodaySub(k, id, i) {
  const L = curList(), e = L.find(x => x.k === k && x.id === id);
  if (!e) L.push({k, id, subs: [i]});
  else { e.subs = e.subs.includes(i) ? e.subs.filter(x => x !== i) : [...e.subs, i].sort((a, b) => a - b); if (!e.subs.length) L.splice(L.indexOf(e), 1); }
  { const p = MS[k].ITEMS[id]; lastAct = `${subInToday(k, id, i) ? "入れた" : "外した"}：${kaiName(k)} ${p.no} ${subName(p, i)}`; }
  sortList(L);
  if (day) { await saveDay(); prepareViz(); }
  render();
}
const subInToday = (k, id, i) => curList().some(e => e.k === k && e.id === id && e.subs.includes(i));
window.inToday = inToday; window.toggleToday = toggleToday;
let pickOpen = null;   // 開いている回
// 問題の中身を、選ぶ画面のその場で開く（答えは出さない。2026-10-10 ユーザー「選択しても問題の中身を見ることができません」）
const PEEK = new Set();   // 中身を開いている問題 "回|id"
const peekBtn = (n, id) => { const o = PEEK.has(n + "|" + id);
  return `<button class="peekb${o ? " on" : ""}" data-peek="${n}|${id}" aria-expanded="${o}" title="問題の中身を見る（答えは出ません）">${o ? "▲中身" : "🔍中身"}</button>`; };
const peekHtml = (n, items) => items.filter(p => PEEK.has(n + "|" + p.id)).map(p =>
  `<figure class="peek"><figcaption>${kaiName(n)} ${esc(p.no)}<button class="ghost mini" data-peek="${n}|${p.id}">とじる</button></figcaption><img src="${imgSrc(p.img)}" alt="${esc(p.no)}の問題"></figure>`).join("");
const togglePeek = v => { PEEK.has(v) ? PEEK.delete(v) : PEEK.add(v); };
// 今日の紙の問題数を、画面の下にいつも出す（どこを見ていても、押したら何が起きたか分かるように。2026-10-10）
let lastAct = "";
function renderBar() {
  let b = document.getElementById("todaybar");
  const pk = typeof pickToday !== "undefined" && pickToday && typeof dashOpen !== "undefined" && dashOpen;
  if (MODE !== "parent" || (day && !pk)) { if (b) b.remove(); document.body.classList.remove("hasbar"); return; }
  if (!b) { b = document.createElement("div"); b.id = "todaybar"; b.setAttribute("role", "status"); document.body.append(b); }
  document.body.classList.add("hasbar");
  const L = curList().filter(e => MS[e.k] && MS[e.k].ITEMS[e.id]);
  b.innerHTML = `<span class="tbn">今日の紙：<b>${countSubs(L)}問</b>（小問${L.reduce((a, e) => a + e.subs.length, 0)}）</span><span class="tba" aria-live="polite">${esc(lastAct)}</span><button class="ghost mini" id="tbtop">一覧へ</button>`;
  b.querySelector("#tbtop").onclick = () => document.getElementById("today").scrollIntoView({behavior: "smooth"});
}
window.renderBar = renderBar;
function pickerHtml() {
  const open = pickOpen ?? SETTINGS.cur;
  return `<div class="picker"><p class="note">押すと今日に入れる／もう一度で外す。(1)(2)…がある問題は小問ごとに選べます。📌が今日の問題です。「🔍中身」で問題の中身を見られます（答えは出ません）。</p>${KAI_LIST.map(n => { const m = MS[n];
    const SYM = {first: "◎", redo: "○", ng: "×", todo: "・", skip: "－"};
    const chip = p => { const st = p.subs.map((_, i) => m.subState(p, i)); const w = ["ng", "todo", "redo", "first", "skip"].find(k => st.includes(k)) || "todo";
      const lab = p.no.replace("基本問題", "基本").replace("練習問題", "練習");
      if (p.subs.length === 1) { const td = inToday(n, p.id);
        return `<span class="pitem"><button class="dchip s-${w}${td ? " intoday" : ""}" data-pick="${n}|${p.id}" aria-pressed="${td}">${td ? "📌" : ""}${esc(lab)} <b>${SYM[st[0]]}</b></button>${peekBtn(n, p.id)}</span>`; }
      // 小問が2つ以上: 小問ごとのボタン
      return `<span class="pgrp${inToday(n, p.id) ? " intoday" : ""}"><span class="pgl">${esc(lab)}</span>${p.subs.map((sn, i) => { const on = subInToday(n, p.id, i);
        return `<button class="dchip s-${st[i]}${on ? " on" : ""}" data-psub="${n}|${p.id}|${i}" aria-pressed="${on}">${on ? "📌" : ""}${esc(sn)}${SYM[st[i]]}</button>`; }).join("")}${peekBtn(n, p.id)}</span>`; };
    return `<details class="dk" data-pk="${n}" ${n === open ? "open" : ""}><summary>${kaiName(n)} ${esc(m.title.replace(/^(第\d+回|組分け\S*|5上第\d+回)\s*/, ""))}</summary>
      ${m.UNITS.map(u => `<div class="du"><div class="duh"><span>${esc(u.label)}　${esc(u.name)}</span></div><div class="chips">${[...u.steps, ...u.extra].map(chip).join("")}</div>${peekHtml(n, [...u.steps, ...u.extra])}</div>`).join("")}
      ${m.PRACTICE.length ? `<div class="du"><div class="duh"><span>練習問題・反復練習</span></div><div class="chips">${m.PRACTICE.map(chip).join("")}</div>${peekHtml(n, m.PRACTICE)}</div>` : ""}</details>`;
  }).join("")}</div>`;
}
function addOptions() {
  const inDraft = new Set(curList().map(e => e.k + ":" + e.id));
  return KAI_LIST.map(n => { const m = MS[n];
    const its = [...m.UNITS.flatMap(u => [...u.steps, ...u.extra]), ...m.PRACTICE].filter(p => !m.itemOk(p) && !inDraft.has(n + ":" + p.id));
    return `<optgroup label="${kaiName(n)}">${its.map(p => `<option value="${n}|${p.id}">${kaiName(n)} ${esc(p.no)}${m.itemTried(p) ? "（×あり）" : ""}</option>`).join("")}</optgroup>`;
  }).join("");
}
function renderToday() {
  const el = document.getElementById("today"); if (!el) return;
  if (MODE === "child") return renderKid(el);
  let h = `<div class="th"><h2>今日のプリント</h2><span class="note">${day && day.date && day.date !== todayKey() ? day.date.slice(5).replace("-", "/") + " に決めた問題" : todayLabel()}</span></div>`;
  if (!day) {
    if (!draft) draft = [];
    // ◎の小問は外す（全部◎の問題は、もう一度やらせるために足したものとして全部残す）
    draft = draft.filter(e => MS[e.k] && MS[e.k].ITEMS[e.id]).map(e => { const m = MS[e.k], p = m.ITEMS[e.id], due = e.subs.filter(i => !m.subOk(p, i)); return {...e, subs: due.length ? due : e.subs}; });
    saveDraft();
    const preview = draft.map(e => ({k: e.k, m: MS[e.k], p: MS[e.k].ITEMS[e.id], subs: e.subs}));
    h += `<ol class="plist dlist">${preview.map((e, j) => `<li><span class="pno">${MARU[j]}</span>${esc(entryLabel(e))}<span class="note">${itemW(e.k, e.p.id, e.subs.length)}問${e.subs.length > 1 && e.p.w ? "（小問" + e.subs.length + "）" : ""}${e.m.itemTried(e.p) ? "・もう一度" : ""}</span>
      <button class="ghost mini" data-drm="${j}">外す</button></li>`).join("") || `<li class="note">まだ問題がありません。下から押して選んでね。</li>`}</ol>
    <div class="row"><button class="primary" id="mkday" ${preview.length ? "" : "disabled"}>この${countSubs(preview)}問で今日を始める</button>${preview.length ? `<button class="ghost" id="clear">全部外す</button>` : ""}</div>
    ${pickerHtml()}
    <details class="dk"${SETTINGS.rot !== false ? " open" : ""}><summary>おすすめで選ぶ（${SETTINGS.rot !== false ? (SETTINGS.rot3 ? "日替わり: " : "") + "今日は" + ROT_NAME[rotOverride || autoKind()] + "・" + ROT_N[rotOverride || autoKind()] + "問" : "回・問題数を決めて自動で"}）</summary>
    <div class="setrow"><span class="ck"><input type="checkbox" id="rot" ${SETTINGS.rot !== false ? "checked" : ""}><label for="rot">毎日「1段」の問題を4問</label></span>
      ${SETTINGS.rot !== false ? `<span class="ck"><input type="checkbox" id="rot3" ${SETTINGS.rot3 ? "checked" : ""}><label for="rot3">前の日替わりに戻す（1段の日4問 → 2段の日2問 → 3段以上の日1問）</label></span>
      <label for="rotk">今日だけ変える <select id="rotk"><option value="">自動（${ROT_NAME[autoKind()]}）</option>${(SETTINGS.rot3 ? ROT : ["d", "2", "3"]).map(x => `<option value="${x}" ${rotOverride === x ? "selected" : ""}>${ROT_NAME[x]}（${ROT_N[x]}問）</option>`).join("")}</select></label>` : ""}</div>
    ${SETTINGS.rot !== false ? `<p class="note">${SETTINGS.rot3 ? `明日は${ROT_NAME[rotKind(Date.now() + 864e5)]}、あさっては${ROT_NAME[rotKind(Date.now() + 2 * 864e5)]}。` : "偏差値50をめざして、正答率の高い1段の計算を確実に取る練習です。先に出すのは、まちがえた問題（×）と、まだやっていない問題です。範囲の1段の×・まだが足りなければ、範囲の2段、3段以上の×・まだから出します。それも無くなったら、◎の問題を、最後に◎になった日が古い順に出します（◎でも忘れるので）。"}${(g => g.spread ? `組分けの前（${SPREAD.from.slice(5).split("-").map(Number).join("/")}〜${SPREAD.to.slice(5).split("-").map(Number).join("/")}）は、範囲の回を日ごとに順番に回します。今日は${kaiName(g.spread[0])}から先に選びます。` : g.mix ? "今日は前の回の日（前の回から先に選びます）。" : "今週の回から先に選びます（3日に1日は前の回から）。")(rotGroups(Date.now()))}${!SETTINGS.rot3 || rotGroups(Date.now()).spread || SETTINGS.range.some(n => n < SETTINGS.cur) ? "" : "範囲に前の回が無いので、前の回は今週より前の全部の回から選びます。今週の回に出せる問題が無いときも、前の回から選びます。"}
      ${SETTINGS.rot3 ? "1段の問題のうち暗算でできるものは出しません（暗記カードにあります）。" : "同じ系統は1日2問まで。"}×だった問題 → まだの問題 を、1段 → 2段 → 3段以上の順に出します。それが全部無くなったら、◎の問題を、最後に◎になった日が古い順に出します。S問題と、まだ受けていない週テストの問題は出しません。</p>` : ""}
    <div class="setrow">
      <label>範囲${KAI_LIST.map(n => `<span class="ck"><input type="checkbox" id="rg${n}" data-rg="${n}" ${SETTINGS.range.includes(n) ? "checked" : ""}><label for="rg${n}">${kaiName(n)}</label></span>`).join("")}</label>
      <label for="curk">今週の回 <select id="curk">${SETTINGS.range.map(n => `<option value="${n}" ${n === SETTINGS.cur ? "selected" : ""}>${kaiName(n)}</option>`).join("")}</select></label>
      ${SETTINGS.rot !== false ? "" : `<label for="perday">1日の小問数 <input id="perday" type="number" min="1" max="30" value="${SETTINGS.perDay}"></label>
      <label for="cursh">そのうち今週の回から <input id="cursh" type="number" min="0" max="${SETTINGS.perDay}" value="${SETTINGS.curShare}"></label>`}
    </div>
    ${SETTINGS.rot !== false ? "" : `<p class="note">今週の回から${SETTINGS.curShare}問、残りはほかの回の続き。1日に同じ系統は1問だけ、×だった問題が先です。練習問題は、その系統の例題・類題・基本ができたら入ります。</p>`}
    <div class="row"><button class="ghost" id="reset">おすすめを入れる</button></div></details>`;
  } else {
    if (day.items.length > 1) { const before = JSON.stringify(day.items); sortList(day.items); if (JSON.stringify(day.items) !== before) saveDay(); }
    const es = dayEntries();
    const marked = es.reduce((a, e) => a + e.subs.filter(i => e.m.last(e.p, i)).length, 0);
    const good = es.reduce((a, e) => a + e.subs.filter(i => e.m.subOk(e.p, i)).length, 0);
    h += `<p class="note">今日は ${countSubs(es)}問（小問 ${es.reduce((a, e) => a + e.subs.length, 0)}）。◎ ${good}　× ${marked - good}　まだ ${es.reduce((a, e) => a + e.subs.length, 0) - marked}</p>`;
    h += `<ol class="plist">${es.map((e, j) => {
      const p = e.p;
      const st = e.subs.map(i => `<button class="cyc" data-cyck="${e.k}|${p.id}|${i}" title="押すと ◎→×→まだ と切り替わる">${esc(subName(p, i))}${markK(e.m, p, i)}</button>`).join("");
      const mk = dayMarks && dayMarks[e.k + ":" + p.id];
      const need = mk && mk.some(x => x.correct == null);
      return `<li><span class="pno">${MARU[j]}</span><button class="link" data-gok="${e.k}|${p.id}">${kaiName(e.k)} ${esc(noOf(e))}</button><span class="pst">${st}</span>${
        need ? `<span class="note">${mk.map(x => `${esc(p.subs[x.i] || "")} 「${esc(x.read ?? "読めない")}」`).join("　")}</span>` : ""}<button class="ghost mini" data-trm="${e.k}|${p.id}">外す</button></li>`;
    }).join("")}</ol>
    <div class="row"><select id="addp2" aria-label="問題を足す"><option value="">＋ 問題を足す…</option>${addOptions()}</select><span class="note">足したら、PDFを保存し直してね。</span></div>`;
    h += `<div class="row">
      <button id="pdf" class="primary" ${dayBusy ? "disabled" : ""}>今日のプリントをPDFで保存</button>
      <button id="icsgo" class="ghost">画面で解く（iPad・ペン）</button>
      ${sample && canImg ? `<label class="btn">解いたプリントの写真をえらぶ（何枚でも）<input id="dph" type="file" accept="image/*" multiple></label>
      <button id="dgrade" ${dayPhotos.length && !dayBusy ? "" : "disabled"}>まとめて◎付け${dayPhotos.length ? `（写真${dayPhotos.length}枚）` : ""}</button>`
      : `<span class="note">写真で◎付けするには、ブラウザで claude.ai を開いてね。</span>`}
      ${window.OFFLINE_SHELL ? "" : `<button class="ghost" id="redo">${day && day.date && day.date !== todayKey() ? "今日のプリントを新しく作る" : "今日の問題を決め直す"}</button>`}</div>`;   // 入れ物ページ（機内）では選び直さない（機内用ファイルの問題と食い違うため）
    h += timesHtml(es);
    // 機内用（offline.js。2026-11-08 ユーザー）
    if (window.offHere && offHere()) h += `<div class="row"><button id="offmk" class="ghost" ${dayBusy ? "disabled" : ""}>機内用ファイルを作る</button>
      <label class="btn ghost">機内の記録を読み込む<input id="offin" type="file" accept=".json,application/json" hidden></label>
      <details><summary class="note">文字で写した記録を貼りつける</summary><textarea id="offtx" rows="3" style="width:100%"></textarea><button class="ghost mini" id="offtxgo">貼りつけた記録を読み込む</button></details></div>`;
    if (false) h += `<p class="note">図の説明: ${!sample ? "この画面では作れません" : prep ? (prep.running ? `準備中 ${prep.done}/${prep.total}` : `準備できました（${prep.total - prep.fail}/${prep.total}）${prep.fail ? `　<button class="ghost mini" id="prepv">足りない分を作る</button>` : ""}`) : `<button class="ghost mini" id="prepv">今日の分を準備する</button>`}</p>`;
    h += `<p class="note">◎×は押すと切り替わります（まだ → ◎ → × → まだ）。答えがアプリに入っていない問題は読み取った答えを出すので、解答編で確かめて押してね。</p>`;
  }
  if (dayMsg) h += `<p class="comment">${esc(dayMsg)}</p>`;
  if (pdfUrl && day) h += `<p><a class="btn primary" href="${esc(furl(pdfUrl))}" target="_blank" rel="noopener">PDFを開く（印刷用）</a></p>`;
  el.innerHTML = h;
  const q = s => el.querySelector(s);
  el.querySelectorAll("[data-rg]").forEach(c => c.onchange = async () => {
    const n = +c.dataset.rg; SETTINGS.range = c.checked ? [...SETTINGS.range, n] : SETTINGS.range.filter(x => x !== n); await saveSettings(); render(); });
  if (q("#rot")) q("#rot").onchange = async e => { SETTINGS.rot = e.target.checked; rotOverride = null; await saveSettings(); render(); };
  if (q("#rot3")) q("#rot3").onchange = async e => { SETTINGS.rot3 = e.target.checked; rotOverride = null; await saveSettings(); render(); };
  if (q("#rotk")) q("#rotk").onchange = e => { rotOverride = e.target.value || null; render(); };
  if (q("#curk")) q("#curk").onchange = async e => { SETTINGS.cur = +e.target.value; await saveSettings(); render(); };
  if (q("#perday")) q("#perday").onchange = async e => { SETTINGS.perDay = +e.target.value; await saveSettings(); render(); };
  if (q("#cursh")) q("#cursh").onchange = async e => { SETTINGS.curShare = +e.target.value; await saveSettings(); render(); };
  el.querySelectorAll("[data-drm]").forEach(b => b.onclick = () => { const e = draft[+b.dataset.drm]; if (e && MS[e.k] && MS[e.k].ITEMS[e.id]) lastAct = `外した：${kaiName(e.k)} ${MS[e.k].ITEMS[e.id].no}`; draft.splice(+b.dataset.drm, 1); renderToday(); });
  el.querySelectorAll("[data-dok]").forEach(b => b.onclick = async () => { const e = draft[+b.dataset.dok], m = MS[e.k], p = m.ITEMS[e.id];
    for (const i of e.subs) await addTry(e.k, p, i, {ok: true, t: Date.now(), by: "parent"}); draft.splice(+b.dataset.dok, 1); render(); });
  if (q("#addp")) q("#addp").onchange = e => { if (!e.target.value) return; const [k, id] = e.target.value.split("|"), m = MS[+k], p = m.ITEMS[id];
    draft.push({k: +k, id, subs: dueSubs(m, p)}); renderToday(); };
  if (q("#reset")) q("#reset").onclick = () => { draft = sortList(planDay()); render(); };
  el.querySelectorAll("details[data-pk]").forEach(d => d.ontoggle = () => { if (d.open) pickOpen = +d.dataset.pk; });
  el.querySelectorAll("[data-psub]").forEach(b => b.onclick = () => { const [k, id, i] = b.dataset.psub.split("|"); pickOpen = +k; toggleTodaySub(+k, id, +i); });
  el.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { const [k, id] = b.dataset.pick.split("|"); pickOpen = +k; toggleToday(+k, id); });
  el.querySelectorAll("[data-peek]").forEach(b => b.onclick = () => { togglePeek(b.dataset.peek); renderToday(); });
  if (q("#clear")) q("#clear").onclick = () => { draft = []; render(); };
  // 外すのは「回|id」で探す（隠れた問題があると並びの番号がずれるため）
  el.querySelectorAll("[data-trm]").forEach(b => b.onclick = async () => { const [k, id] = b.dataset.trm.split("|"), j = day.items.findIndex(x => +x.k === +k && x.id === id); if (j >= 0) day.items.splice(j, 1); await saveDay(); render(); });
  if (q("#addp2")) q("#addp2").onchange = e => { if (e.target.value) { const [k, id] = e.target.value.split("|"); toggleToday(+k, id); } };
  if (q("#mkday")) q("#mkday").onclick = async () => { day = {date: todayKey(), items: sortList(draft.map(e => Object.assign({k: e.k, id: e.id, subs: e.subs}, typeof e.ord === "number" ? {ord: e.ord} : {}, typeof e.set === "number" ? {set: e.set} : {}, e.rev ? {rev: e.rev} : {}))), created: Date.now()}; dayTimes = null; draft = []; saveDraft(); pickOpen = null; dayMsg = ""; await saveDay(); render(); prepareViz(); };
  if (q("#redo")) q("#redo").onclick = async () => {
    // 前の日のプリントなら、昨日の問題は持ちこまずに「おすすめ」で新しく選ぶ（同じ問題がまた出ていた。2026-10-09 ユーザー）。今日のプリントの決め直しなら、今の問題から選び直す
    if (day && day.date && day.date !== todayKey()) { try { localStorage.setItem(PREV_LS, JSON.stringify({date: day.date, items: (day.items || []).map(e => ({k: e.k, id: e.id}))})); } catch (e) {} }   // 前の日の分を控える（次の日に同じ問題を出さないため。この端末だけ）
    draft = day && day.date && day.date !== todayKey() ? sortList(planDay()) : (day ? day.items : []).map(e => ({...e})); day = null; dayMarks = null; dayPhotos = []; try { localStorage.removeItem("rika-step-dayAll"); } catch (e) {} if (db) { try { await db.doc(DAYC + "/current").delete(); await db.doc(DAYC + "/" + todayKey()).delete(); } catch (e) {} } render(); };
  if (q("#pdf")) q("#pdf").onclick = makePdf;
  if (q("#icsgo")) q("#icsgo").onclick = () => icsOpen();
  if (q("#offmk")) q("#offmk").onclick = async () => { dayBusy = true; dayMsg = "機内用ファイルを作っています…"; renderToday();
    try { dayMsg = await offMake(); } catch (e) { dayMsg = "作れませんでした: " + ((e && e.message) || e); } dayBusy = false; render(); };
  if (q("#offin")) q("#offin").onchange = async e => { const f = e.target.files[0]; if (!f) return;
    try { dayMsg = await offRead(f); } catch (err) { dayMsg = "読み込めませんでした: " + ((err && err.message) || err); } render(); };
  if (q("#offtxgo")) q("#offtxgo").onclick = async () => { const t = q("#offtx").value.trim(); if (!t) return;
    try { dayMsg = await offRead(t); } catch (err) { dayMsg = "読み込めませんでした: " + ((err && err.message) || err); } render(); };
  el.querySelectorAll("[data-tm]").forEach(x => x.onchange = () => { const [k, w] = x.dataset.tm.split("|"); saveTime(k, w, x.value); });
  if (day && dayTimes === null && db) { dayTimes = {}; loadTimes(); }
  if (q("#prepv")) q("#prepv").onclick = () => prepareViz();
  if (q("#dph")) q("#dph").onchange = e => { dayPhotos = [...e.target.files]; dayMsg = ""; renderToday(); };
  if (q("#dgrade")) q("#dgrade").onclick = gradeDay;
  el.querySelectorAll("[data-cyck]").forEach(b => b.onclick = async () => { const [k, id, i] = b.dataset.cyck.split("|"); await cycleSubK(+k, MS[+k].ITEMS[id], +i); render(); });
  el.querySelectorAll("[data-gok]").forEach(b => b.onclick = () => { const [k, id] = b.dataset.gok.split("|"); goToAny(+k, id); });
  renderBar();
}

// その日の問題の絵・答えの絵の束を先に読む（model.js の imgPreload。2026-11-01・11-06 今の today.js に足し直し）
const imgPreloadEntries = es => Promise.all(es.map(e => window.imgPreload ? imgPreload(e.k, [e.p.id, e.rev].filter(Boolean)) : null));
/* ---- PDF（A4・150dpi相当のキャンバスに描いて、1ページずつ貼る） ---- */
const PW = 1240, PH = 1754, PM = 80;
const SET_SIZE = 8;   // 小問8つで1セット（8問ごとに休憩。ユーザー 2026-10-07）
const FONT = '"BIZ UDPGothic","Hiragino Sans","Yu Gothic",sans-serif';
const loadImg = src => new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = src; });
function newPage(title, sub) {
  const c = document.createElement("canvas"); c.width = PW; c.height = PH;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, PW, PH); g.fillStyle = "#111";
  g.font = `700 30px ${FONT}`; g.fillText(title, PM, 90);
  g.font = `400 22px ${FONT}`; g.fillStyle = "#555"; g.fillText(sub, PM, 126); g.fillStyle = "#111";
  g.strokeStyle = "#999"; g.lineWidth = 2; g.beginPath(); g.moveTo(PM, 145); g.lineTo(PW - PM, 145); g.stroke();
  return {c, g};
}
// 1枚目の右上に「はじめ・おわり」の時刻の欄（かかった時間を見るため。ユーザー 2026-10-05）
function timeBoxes(g) {
  // タイマーで測るので「かかった時間 □ 分」だけ（2026-10-10 ユーザー）
  const bw = 150, bh = 48, x = PW - PM - bw - 40, y = 30;
  g.save(); g.strokeStyle = "#222"; g.lineWidth = 2; g.fillStyle = "#111"; g.font = `700 22px ${FONT}`;
  g.fillText("かかった時間", x - 150, y + 32); g.strokeRect(x, y, bw, bh); g.fillText("分", x + bw + 8, y + 32);
  g.restore();
}
// プリントのセット分け（PDF と時間の記録で同じ区切りを使う）。xs は {e} の並び
function splitSets(xs) {
  const sets = []; let cur = [], cnt = 0;
  // 塾の日など、問題に set（セットの番号）が付いている日はその区切りで（塾の分／その他）
  const setOf = L => { const it = day && day.items.find(x => +x.k === L.e.k && x.id === L.e.p.id); return it && typeof it.set === "number" ? it.set : null; };
  if (xs.some(L => setOf(L) !== null)) xs.forEach(L => { const sn = setOf(L); if (cur.length && sn !== setOf(cur[0])) { sets.push(cur); cur = []; } cur.push(L); });
  else xs.forEach(L => { const n = itemW(L.e.k, L.e.p.id, L.e.subs.length); if (cur.length && cnt + n > SET_SIZE) { sets.push(cur); cur = []; cnt = 0; } cur.push(L); cnt += n; });
  if (cur.length) sets.push(cur);
  return sets;
}
// セットごとの「はじめ・おわり」の時刻を入れる（プリントに書いた時刻。db の times/<日付> に保存。2026-10-10 ユーザー）
let dayTimes = null;   // {set1: {s: "19:05", e: "19:30"}, …}
async function loadTimes() { if (!db || !day) return; try { const d = await db.doc("times/" + day.date).get(); dayTimes = d.exists ? d.data() : {}; renderToday(); } catch (e) {} }
async function saveTime(key, which, v) {
  dayTimes = dayTimes || {}; dayTimes[key] = Object.assign({}, dayTimes[key] || {}, {[which]: v});
  if (db && day) { try { await db.doc("times/" + day.date).set(Object.assign({}, dayTimes, {t: Date.now()})); } catch (e) {} }
}
function timesHtml(es) {
  const sets = splitSets(es.map(e => ({e})));
  const tv = (k, w) => esc(((dayTimes || {})[k] || {})[w] || "");
  return `<details class="dk"${dayTimes && Object.keys(dayTimes).some(k => k.startsWith("set")) ? "" : ""}><summary>かかった時間を入れる（セットごと・分）</summary><div class="times">${sets.map((S, i) => {
    const k = "set" + (i + 1), n = S.reduce((a, L) => a + itemW(L.e.k, L.e.p.id, L.e.subs.length), 0);
    return `<div class="row"><b>セット${i + 1}（${n}問）</b> かかった時間 <input type="number" min="0" max="300" inputmode="numeric" style="width:5em" data-tm="${k}|min" value="${tv(k, "min")}"> 分</div>`; }).join("")}</div>
    <p class="note">入れるとすぐ保存されます。毎週月曜のふり返りで、1セットにかかった時間を見ます。</p></details>`;
}
async function makePdf() {
  if (!window.jspdf) { dayMsg = "PDFを作る部品が読みこめませんでした。ページを開き直してね。"; return renderToday(); }
  dayBusy = true; dayMsg = "PDFを作っています…"; renderToday();
  try {
    try { await document.fonts.ready; } catch (e) {}
    const es = dayEntries();
    await imgPreloadEntries(es);   // 絵の束がそろうのを待つ（絵は使うときに読む作り）
    const imgs = await Promise.all(es.map(e => imgReady(e.p.img).then(loadImg)));
    // 昨日×の例題の解き方（本の解き方の画像）。類題の前のページに出す
    const revImgs = await Promise.all(es.map(e => { const q = e.rev && e.m.ITEMS[e.rev]; if (!q || !(q.ans || []).length) return null;
      return Promise.all(q.ans.map((_, i) => imgReady(`img/${e.k}/a_${q.id}_${i}.png`).then(loadImg).catch(() => null))); }));
    const pages = [];
    const head = `理科の計算 ${todayLabel()}`;
    // 1問ずつ: 問題 → その下に「式・考え方」の枠と、小問ごとの答えの□
    // ページ割り: 2問入るなら2問（画像は高さ360まで縮め、余った分は式の枠に足す）。
    // 1問だけのページは、画像を縮めず、式の枠をページの下まで広げる
    const W = PW - 2 * PM, fw = 300, fh = 84, gap = 22, IH = 360, BH0 = 316, TOP = 165, BOTTOM = PH - 40;
    const lay = es.map((e, k) => {
      const n = e.subs.length, slot = fw + 112 + gap, perRow = Math.max(1, Math.min(n, Math.floor((W - 32 + gap) / slot))), rows = Math.ceil(n / perRow);
      const fullH = imgs[k].height * W / imgs[k].width;
      return {e, k, perRow, rows, fullH, smallH: Math.max(Math.min(fullH, IH), fullH * 0.72) /* 理科は本の図表が細かいので、2問入れるときも7割より小さくしない */, bhMin: BH0 + (rows - 1) * (fh + 10)};
    });
    const need = (L, small) => 48 + (small ? L.smallH : L.fullH) + 12 + L.bhMin + 28;
    // セット: 小問 SET_SIZE ごとに区切る（1つの問題の(1)(2)…は分けない）。セットの始まりは新しいページ（2026-10-07 ユーザー）
    const sets = splitSets(lay);
    const groups = [];   // [{grp, set, first}]
    sets.forEach((S, si) => { let gi = 0, first = true;
      while (gi < S.length) {
        const two = gi + 1 < S.length && need(S[gi], true) + need(S[gi + 1], true) <= BOTTOM - TOP;
        groups.push({grp: two ? [S[gi], S[gi + 1]] : [S[gi]], set: si, first, n: S.reduce((a, L) => a + itemW(L.e.k, L.e.p.id, L.e.subs.length), 0)}); gi += two ? 2 : 1; first = false; } });
    groups.forEach(({grp, set, first, n}, gix) => {
      const multi = sets.length > 1;
      const title = multi ? `セット${set + 1}／${sets.length}（${n}問）${first ? "" : "つづき"}` : (gix ? "今日のプリント（つづき）" : "今日のプリント");
      // この中に「昨日まちがえた例題」の類題があれば、その前に例題の解き方のページ
      grp.forEach(L => { const ri = revImgs[L.k]; if (!ri) return; const q = L.e.m.ITEMS[L.e.rev];
        const rp = newPage(`昨日まちがえた ${kaiName(L.e.k)} ${q.no}`, "解き方を読んで、考え方を確かめよう。そのあと次のページの" + L.e.p.no + "を、何も見ずに解こう。"); pages.push(rp);
        let yy = TOP + 10; const avail = BOTTOM - TOP - 10, list = ri.filter(Boolean), tot = list.reduce((a, im) => a + im.height * W / im.width, 0), sc = Math.min(1, avail / Math.max(1, tot + 20 * list.length));
        list.forEach(im => { const hh = im.height * W / im.width * sc, ww = W * sc; rp.g.drawImage(im, PM, yy, ww, hh); yy += hh + 20; }); });
      const pg = newPage(title, head + (gix ? "" : "　式も書こう。答えは□に。わからない問題はとばして、最後にもどろう。")); pages.push(pg);
      if (first) timeBoxes(pg.g);
      const g = pg.g, single = grp.length === 1;
      // 1問だけ: 画像は本の大きさ（入りきらないときだけ縮める）
      const ihs = grp.map(L => single ? Math.min(L.fullH, BOTTOM - TOP - 48 - 12 - L.bhMin - 28) : L.smallH);
      const extra = (BOTTOM - TOP) - grp.reduce((a, L, j) => a + 48 + ihs[j] + 12 + L.bhMin + 28, 0);
      let y = TOP;
      grp.forEach((L, j) => {
        const {e, k, perRow, rows} = L, p = e.p, ih = ihs[j], iw = W * ih / L.fullH;
        const bh = L.bhMin + Math.max(0, Math.floor(extra / grp.length));
        g.font = `700 40px ${FONT}`; g.fillStyle = "#111"; g.fillText(MARU[k], PM, y + 38);
        g.font = `700 28px ${FONT}`; g.fillText(entryLabel(e) + (e.rev ? "（昨日の例題の練習）" : ""), PM + 54, y + 34);
        // これまでの記録（いつ◎×だったか・×の回数）を右上に小さく
        { g.font = `700 28px ${FONT}`; const lw = g.measureText(entryLabel(e)).width;
          g.font = `400 20px ${FONT}`; g.fillStyle = "#555"; g.textAlign = "right";
          const hs = histLine(e); let txt = hs[0];
          for (let cut = 1; PM + 54 + lw + 24 + g.measureText(txt).width > PW - PM && cut < hs.length; cut++) txt = hs[cut];
          g.fillText(txt, PW - PM, y + 34); g.textAlign = "left"; g.fillStyle = "#111"; }
        g.drawImage(imgs[k], PM, y + 48, iw, ih);
        const top = y + 48 + ih + 12;
        g.strokeStyle = "#222"; g.lineWidth = 3; g.strokeRect(PM, top, W, bh);
        g.font = `700 26px ${FONT}`; g.fillText(MARU[k], PM + 12, top + 34);
        g.font = `400 20px ${FONT}`; g.fillStyle = "#777"; g.fillText("式・考え方", PM + 50, top + 31); g.fillStyle = "#111";
        // テストの直し: 先に読むヒント（答えの数字は入っていない）。「説明 → 何も見ずに解き直す」の順にするため
        const hint = (((window.KEYS || {})[p.kai] || {})[p.id] || {}).hint;
        if (hint) { g.font = `700 22px ${FONT}`; g.fillStyle = "#1c6b78"; let hx = PM + 180, hy = top + 31;
          g.fillText("ヒント", hx, hy); g.font = `400 21px ${FONT}`; g.fillStyle = "#222";
          let line = "", lx = hx + 80;
          for (const ch of hint) { if (g.measureText(line + ch).width > PW - PM - 20 - lx) { g.fillText(line, lx, hy); hy += 30; line = ""; lx = hx; } line += ch; }
          if (line) g.fillText(line, lx, hy); g.fillStyle = "#111"; }
        // 前の小問だけ済んでいて(2)などだけ出すとき: 前の小問の答えを書いておく（(1)の答えがないと解けないため。2026-10-09 ユーザー）
        { const first = Math.min(...e.subs), ka = (((window.KEYS || {})[p.kai] || {})[p.id] || {}).a || [];
          const prev = []; for (let i = 0; i < first; i++) if (ka[i]) prev.push(`${subName(p, i) || "(" + (i + 1) + ")"} ${ka[i]}`);
          { const pre = (((window.KEYS || {})[p.kai] || {})[p.id] || {}).pre; if (pre) prev.push(pre); }   // 別の問題に分かれた前の問いでわかる数（2026-11-07）
          if (prev.length) { const py = top + (hint ? 31 + 30 * 3 : 31) + (hint ? 0 : 0);
            g.font = `700 21px ${FONT}`; g.fillStyle = "#1c6b78"; const lab = "前の問題の答え", lx0 = PM + (hint ? 50 : 180);
            const yy = hint ? py : top + 31; g.fillText(lab, lx0, yy); g.font = `400 21px ${FONT}`; g.fillStyle = "#222";
            g.fillText(prev.join("　").slice(0, 60), lx0 + 170, yy); g.fillStyle = "#111"; } }
        e.subs.forEach((si, i) => {
          const sname = subName(p, si), r = Math.floor(i / perRow), c = i % perRow;
          const x = PW - PM - 16 - (perRow - c) * (fw + 112 + gap) + gap, yy = top + bh - 14 - (rows - r) * (fh + 10) + 10;
          g.font = `700 28px ${FONT}`; g.fillText(sname || "答え", x, yy + 52);
          g.lineWidth = 2; g.strokeRect(x + 106, yy, fw, fh);
        });
        y = top + bh + 28;
      });
    });
    const {jsPDF} = window.jspdf;
    const pdf = new jsPDF({unit: "mm", format: "a4"});
    pages.forEach((p, i) => { if (i) pdf.addPage(); pdf.addImage(p.c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297); });
    const blob = pdf.output("blob");
    await capReady;
    let saved = false, why = "";
    if (downloads) {
      try { await downloads.save({filename: `理科計算プリント_${todayKey()}.pdf`, data: blob}); saved = true; dayMsg = "保存しました。印刷して始めよう！"; }
      catch (e) { why = e && e.code; if (why === "declined") { dayMsg = "保存をやめました。"; saved = true; } }
    }
    if (!saved) {
      // 保存できない画面では、PDFをアプリに置いて開けるようにする（ブラウザのPDF表示から印刷）
      if (assets) {
        try {
          try { const old = localStorage.getItem("rika-step-pdfid"); if (old) await assets.delete(old).catch(() => {}); } catch (e) {}
          const r = await assets.upload(new Blob([blob], {type: "application/pdf"}), {type: "application/pdf"});
          try { localStorage.setItem("rika-step-pdfid", r.id); } catch (e) {}
          pdfUrl = r.url; dayMsg = "PDFができました。下の「PDFを開く」から開いて印刷してね。";
        } catch (e) { dayMsg = "PDFを保存できませんでした（" + ((e && e.code) || why || "原因不明") + "）。"; }
      } else dayMsg = "この画面ではPDFを保存できません（" + (why || "保存の機能が使えない画面") + "）。ブラウザで claude.ai を開いてね。";
    }
  } catch (e) {
    dayMsg = "PDFを作れませんでした（" + ((e && (e.code || e.message)) || "原因不明") + "）。もう一度押してね。";
  }
  dayBusy = false; renderToday();
}

/* ---- 解いたプリントの写真で、まとめて◎付け ---- */
async function gradeDay() {
  dayBusy = true; dayMsg = "◎付けしています…（1分くらいかかることがあります）"; renderToday();
  const es = dayEntries();
  const keyOf = e => ((window.KEYS || {})[e.k] || {})[e.p.id];
  const list = es.map((e, j) => {
    const key = keyOf(e);
    return `${MARU[j]} ${e.p.no}\n` + e.subs.map(i => `  ${subName(e.p, i) || "答え"}: ` + (key ? `正しい答え「${key.a[i]}」` : "（正しい答えなし。読み取りだけ）")).join("\n");
  }).join("\n");
  const prompt = `あなたは小学5年生の理科の計算問題の丸付けをする先生です。写真は、子どもが解いたプリントです。
プリントには問題ごとに、丸数字（①②…）と問題文が印刷され、その下に「式・考え方」の枠があります。枠の右下の□に、小問ごとの答えが書いてあります。問題文の中の数字は答えではありません。

【問題と本の正しい答え】
${list}

【やること】
- 丸数字で問題を見分け、小問ごとに□の中の答えを読み取る。
- 「正しい答え」がある小問は、それと同じかどうかを判定する。自分で解き直して判定を変えてはいけない。
- 比は順番も同じでなければ×。約分していない比は◎。単位を書き忘れただけなら◎。答えが複数ある問題は、全部そろっていて余分がないときだけ◎。
- 「正しい答えなし」の小問は、読み取りだけして correct を null にする。
- 読み取れない小問は read を null、correct を null にする。当て推量で判定しない。

次のJSONだけを返してください:
{"items":[{"no":"①","subs":[{"sub":"(1)","read":"子どもの答え","correct":true}]}],"comment":"子どもへの一言。やさしく1〜2文"}`;
  try {
    const r = await sample.json(prompt, {images: dayPhotos.slice(0, 20)});
    const got = Array.isArray(r && r.items) ? r.items : [];
    dayMarks = {};
    for (const [j, e] of es.entries()) {
      const it = got.find(x => x && x.no === MARU[j]) || got[j] || {subs: []};
      const subs = Array.isArray(it.subs) ? it.subs : [];
      const mk = e.subs.map((i, jj) => {
        const s = subName(e.p, i);
        const m = subs.find(x => x && x.sub === (s || "答え")) || subs[jj] || {};
        return {i, read: m.read ?? null, correct: keyOf(e) ? (m.correct === true ? true : m.correct === false ? false : null) : null};
      });
      dayMarks[e.k + ":" + e.p.id] = mk;
      for (const m of mk) if (m.correct !== null) await addTry(e.k, e.p, m.i, {ok: m.correct, t: Date.now(), by: "claude", read: m.read});
    }
    const ng = Object.values(dayMarks).filter(mk => mk.some(m => m.correct === false)).length;
    dayMsg = (typeof r.comment === "string" ? r.comment + "　" : "") + (ng ? `×の問題は、問題名を押すと解説が見られるよ。明日のプリントにもまた入ります。` : "");
  } catch (e) {
    dayMsg = e.code === "rate_limited" ? "少し待ってから、もう一度押してね。" : e.code === "image_rejected" ? "送れない写真がありました。撮り直してね。" : "◎付けできませんでした。もう一度押してね。";
  }
  dayBusy = false; render();
}

/* ---- 今日の問題を画面で解く（2026-11-01 ユーザー「iPad で Apple Pencil で書きこめるように」。算数ステップ帳の画面解きと同じ作り） ----
   今日のプリントと同じ順で1問ずつ: 問題の絵 → 「式と考え方」の方眼 → 答えの欄。ペンで書く（指は画面を動かす。「指で書く」で指でも書ける）。
   書いたものはこの端末（localStorage）と保存の場所（db の ink/）に残す。今日の問題の選び方・PDF・daysAll には さわらない。
   丸付けは「全部おわった」のあと（2回おす）。正しい答えを出し、◎×をおす（記録の形は gradeDay と同じ addTry。今日もうついている◎×はそのまま見せるだけ） */
const ICS = {open: false, grade: false, pen: "#111", erase: false, finger: false, ink: {}, undo: [], cv: [], mine: new Set()};
const icsDate = () => (day && day.date) || todayKey();
const icsKey = () => "rika-ink-" + icsDate();
const icsEntries = () => dayEntries();
const icsId = e => e.k + ":" + e.p.id + ":" + e.subs.join(".");
// 今日の◎×（1=◎ 0=× -1=まだ）
const icsNow = (e, i) => { const l = e.m.last(e.p, i); return l && isToday(l.t) ? (l.ok ? 1 : 0) : -1; };
function icsLoad() { try { ICS.ink = JSON.parse(localStorage.getItem(icsKey()) || "{}"); } catch (e) { ICS.ink = {}; } }
function icsSave(id) { try { localStorage.setItem(icsKey(), JSON.stringify(ICS.ink)); } catch (e) {} if (id) icsDbSave(id); }
// db の doc の名前は rika| を頭に（算数ステップ帳の ink/ と見分けるため）
const icsDocId = id => "ink/" + encodeURIComponent("rika|" + icsDate() + "|" + id).replace(/[%.]/g, "_");
const icsTimers = {};
function icsDbSave(id) { clearTimeout(icsTimers[id]); icsTimers[id] = setTimeout(() => { if (db) db.doc(icsDocId(id)).set({s: JSON.stringify(ICS.ink[id] || []), t: Date.now()}).catch(() => {}); }, 800); }
async function icsDbLoad(es) { if (!db) return false; let got = false;
  await Promise.all(es.map(async e => { const id = icsId(e); if ((ICS.ink[id] || []).length) return;
    try { const d = await db.doc(icsDocId(id)).get(); if (d.exists && d.data().s) { const a = JSON.parse(d.data().s); if (a.length) { ICS.ink[id] = a; got = true; } } } catch (x) {} }));
  if (got) { try { localStorage.setItem(icsKey(), JSON.stringify(ICS.ink)); } catch (x) {} } return got; }
// ◎×をつける: 今日まだなら足す（gradeDay と同じ形 {ok, t, by}）。この画面でつけたものだけ つけ直せる。前の日の記録・ほかでつけた今日の◎×は さわらない
async function icsMark(e, i, ok) {
  const key = e.m.sk(e.p, i), mk = e.k + "|" + key, now = icsNow(e, i);
  if (now < 0) { await addTry(e.k, e.p, i, {ok, t: Date.now(), by: "hand"}); ICS.mine.add(mk); return; }
  if (!ICS.mine.has(mk) || (now === 1) === ok) return;
  const arr = recOf(e.k)[key] || [], l = arr[arr.length - 1];
  await writeRec(e.k, key, arr.slice(0, -1).concat([Object.assign({}, l, {ok})]), "画面で解く つけ直し");
}
// 絵の束がそろうのを待ってから開く（絵は使うときに読む作り。2026-11-01）
async function icsOpen() { await imgPreloadEntries(icsEntries()).catch(() => {}); icsLoad(); ICS.open = true; ICS.grade = false; ICS.undo = []; icsRender();
  icsDbLoad(icsEntries()).then(g => { if (g && ICS.open) ICS.cv.forEach(c => c.draw()); }); }
function icsClose() { ICS.open = false; const o = document.getElementById("icsScr"); if (o) o.remove(); document.body.style.overflow = ""; render(); }
window.icsOpen = icsOpen;
// 丸付けのあとに見せる解説（keys の how から、答えた小問の段落だけ。2026-11-07 ユーザー「解説がなくてわからない」）。記録・今日の分には さわらない
function icsHow(e, K) {
  const ls = String(K.how || "").split(/\n/).map(x => x.trim()).filter(x => x && !/^（本には/.test(x));
  if (!ls.length) return "";
  const keys = e.subs.map(i => String(subName(e.p, i) || "").replace(/[①-⑳]/g, "")).filter(Boolean);
  const lab = x => (x.match(/^(問\s*[0-9０-９]+(?:・[0-9０-９]+)*|\([0-9]+\)|（[0-9]+）)/) || [])[1];
  const hit = x => { const l = lab(x); if (!l) return false; if (l.startsWith("問")) { const ns = l.replace(/^問\s*/, "").split("・"); return keys.some(k => k.startsWith("問") && ns.includes(k.replace(/^問\s*/, ""))); } return keys.some(k => k === l || k === l.replace(/（/g, "(").replace(/）/g, ")")); };
  const pick = ls.filter(hit), use = pick.length ? pick : (ls.some(lab) ? [] : ls);
  return use.length ? `<div style="margin-top:8px;padding-top:6px;border-top:1px dashed #c9c1ae"><b>解説</b>${use.map(x => `<div style="font-size:17px;line-height:1.7">${esc(x)}</div>`).join("")}</div>` : "";
}
function icsRender() {
  const es = icsEntries();
  let o = document.getElementById("icsScr");
  const keepY = o ? o.querySelector(".icsBody").scrollTop : 0;
  // 描き直すと紙の高さが絵を読むまで一瞬短くなり、上にとぶ → 前の高さを残す（算数と同じ直し・2026-11-02）
  const keepH = {}; if (o) o.querySelectorAll("canvas[data-ics], canvas[data-icsb]").forEach(c => { keepH[(c.dataset.icsb ? "b" : "") + (c.dataset.ics || c.dataset.icsb)] = c.style.height; });
  // 問題の帯の中を動かした位置も残す（2026-11-03）
  const keepB = {}; if (o) o.querySelectorAll(".icsBand[data-icsbd]").forEach(b => { keepB[b.dataset.icsbd] = b.scrollTop; });
  if (!o) { o = document.createElement("div"); o.id = "icsScr"; document.body.appendChild(o); }
  document.body.style.overflow = "hidden";
  const tool = (id, lab, on) => `<button class="${on ? "primary" : "ghost"}" id="${id}">${lab}</button>`;
  const doneN = es.filter(e => e.subs.every(i => icsNow(e, i) >= 0)).length;
  o.innerHTML = `<style>
    #icsScr{position:fixed;inset:0;z-index:9999;background:var(--paper);display:flex;flex-direction:column}
    #icsScr .icsBar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 12px;background:var(--sheet);border-bottom:2px solid var(--line)}
    #icsScr .icsBar button{padding:8px 12px;font-size:16px}
    #icsScr .icsBody{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px}
    #icsScr .icsQ{max-width:900px;margin:0 auto 22px;background:#fff;color:#111;border:2px solid var(--line);border-radius:10px;padding:10px}
    #icsScr .icsQ h3{margin:0 0 6px;font-size:22px;color:#111}
    #icsScr canvas{display:block;width:100%;touch-action:none;border-radius:6px}
    /* 2026-11-03 ユーザー「問題を固定して解答だけスクロールできるくらいでいい」: 問題の絵は上に固定（画面の高さの4割まで。長い問題は帯の中で動かす）。その問題の解答欄を下まで動かしても見えている */
    #icsScr .icsPin{position:sticky;top:-12px;z-index:2;max-height:40vh;display:flex;flex-direction:column;background:#fff;margin:-10px -10px 0;padding:10px 10px 6px;border-bottom:3px solid #c9c1ae;border-radius:10px 10px 0 0;box-shadow:0 3px 6px rgba(0,0,0,.08)}
    #icsScr .icsBand{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
    #icsScr .icsQ canvas[data-ics]{margin-top:6px}
    #icsScr .icsAns{margin-top:8px;padding:8px;border-radius:8px;background:#fdf3e1;color:#111;font-size:18px}
    #icsScr .icsAns div{margin:4px 0}
    #icsScr .icsAns button{margin-left:6px;font-size:17px;padding:6px 12px}
    #icsScr .icsAns .on{outline:3px solid #c0392b}
    #icsScr .icsEnd{max-width:900px;margin:0 auto 40px;text-align:center}
    #icsScr .icsEnd button{font-size:19px;padding:12px 22px}
  </style>
  <div class="icsBar">
    <b style="margin-right:6px">今日の問題（${es.length}問）</b>
    ${tool("icsK", "黒", !ICS.erase && ICS.pen === "#111")}${tool("icsR", "赤", !ICS.erase && ICS.pen === "#c0392b")}${tool("icsE", "消しゴム", ICS.erase)}
    ${tool("icsU", "1つもどる", false)}${tool("icsF", ICS.finger ? "指で書く：オン" : "指で書く：オフ", ICS.finger)}
    <span style="flex:1"></span>${tool("icsX", "とじる", false)}
  </div>
  <div class="icsBody">
    ${es.length ? "" : `<p class="note">今日のプリントは、まだ用意されていません。</p>`}
    ${es.map((e, n) => { const part = e.subs.length < e.p.subs.length, K = ((window.KEYS || {})[e.k] || {})[e.p.id] || {}, ka = K.a || [];
      const first = Math.min(...e.subs), prev = []; for (let i = 0; i < first; i++) if (ka[i]) prev.push(`${subName(e.p, i) || "(" + (i + 1) + ")"} ${ka[i]}`);
      return `<div class="icsQ"><div class="icsPin"><h3>${MARU[n]} ${esc(kaiName(e.k) + " " + noOf(e))}${part ? `<span style="color:#c0392b;font-size:18px">　${esc(e.subs.map(i => subName(e.p, i)).join(""))}だけ 答えよう</span>` : ""}</h3>
      ${K.hint ? `<div style="color:#1c6b78"><b>ヒント</b> ${esc(K.hint)}</div>` : ""}
      ${prev.length ? `<div style="color:#1c6b78;font-weight:700">前の問題の答え　${esc(prev.join("　"))}</div>` : ""}
      ${K.pre ? `<div style="color:#1c6b78;font-weight:700">前の問題でわかったこと　${esc(K.pre)}</div>` : ""}
      <div class="icsBand" data-icsbd="${n}"><canvas data-icsb="${n}"></canvas></div><div class="icsMore" hidden style="color:#c0392b;font-size:15px;text-align:center;padding-top:2px">▲▼ 問題の絵は、この中を上下に動かすと 全部見られます</div></div>
      <canvas data-ics="${n}"></canvas>
      ${ICS.grade ? `<div class="icsAns">${e.subs.map(i => { const now = icsNow(e, i), mine = ICS.mine.has(e.k + "|" + e.m.sk(e.p, i));
        return `<div>${subName(e.p, i) ? esc(subName(e.p, i)) + " " : ""}正しい答え <b>${esc(ka[i] || "（本の解答を見てね）")}</b>
          ${now < 0 || mine ? `<button class="ghost ${now === 1 ? "on" : ""}" data-icsm="${n}|${i}|1">◎</button><button class="ghost ${now === 0 ? "on" : ""}" data-icsm="${n}|${i}|0">×</button>`
            : `<b style="margin-left:8px">${now === 1 ? "◎" : "×"}</b><span class="note">（今日の丸付けは すんでいます）</span>`}</div>`; }).join("")}${icsHow(e, K)}</div>` : ""}
      </div>`; }).join("")}
    <div class="icsEnd">${ICS.grade ? `<p>${doneN} / ${es.length}問 丸付けずみ</p><button class="primary" id="icsX2">おわり（とじる）</button>`
      : es.length ? `<button class="primary" id="icsG">全部おわった → 丸付け</button>` : ""}</div>
  </div>`;
  const body = o.querySelector(".icsBody");
  const set = (id, f) => { const b = o.querySelector("#" + id); if (b) b.onclick = f; };
  // 黒・赤・消しゴム・指は ボタンの色だけ変える（描き直さない）
  const tools = () => { const on = (id, v) => { const b = o.querySelector("#" + id); if (b) b.className = v ? "primary" : "ghost"; };
    on("icsK", !ICS.erase && ICS.pen === "#111"); on("icsR", !ICS.erase && ICS.pen === "#c0392b"); on("icsE", ICS.erase); on("icsF", ICS.finger);
    const f = o.querySelector("#icsF"); if (f) f.textContent = ICS.finger ? "指で書く：オン" : "指で書く：オフ"; };
  set("icsK", () => { ICS.pen = "#111"; ICS.erase = false; tools(); });
  set("icsR", () => { ICS.pen = "#c0392b"; ICS.erase = false; tools(); });
  set("icsE", () => { ICS.erase = true; tools(); });
  set("icsF", () => { ICS.finger = !ICS.finger; tools(); });
  set("icsU", () => { const u = ICS.undo.pop(); if (!u) return; ICS.ink[u.id] = u.before; icsSave(u.id); ICS.cv.forEach(c => c.id === u.id && c.draw()); });
  set("icsX", icsClose); set("icsX2", icsClose);
  // 1回目で文字を変え、2回目で丸付けへ。confirm() は iPad のアプリの中では出ずに「いいえ」になる
  set("icsG", ev => { const b = ev.currentTarget; if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "もう一度 おすと 答えが出ます"; return; } ICS.grade = true; icsRender(); });
  o.querySelectorAll("[data-icsm]").forEach(b => b.onclick = async () => { const [n, i, ok] = b.dataset.icsm.split("|"); await icsMark(es[+n], +i, ok === "1"); icsRender(); });
  ICS.cv = [];
  o.querySelectorAll("canvas[data-ics], canvas[data-icsb]").forEach(cv => { const h = keepH[(cv.dataset.icsb ? "b" : "") + (cv.dataset.ics || cv.dataset.icsb)]; if (h) cv.style.height = h; });
  o.querySelectorAll("canvas[data-ics]").forEach(cv => icsCanvas(cv, es[+cv.dataset.ics], body).then(() => { const b = o.querySelector(`.icsBand[data-icsbd="${cv.dataset.ics}"]`); if (!b) return; const k = cv.dataset.ics, ee = es[+k];
    // 2026-11-07: 答える小問が最後の小問なら、絵の帯を下まで動かして開く（問6 が見えないまま 問3・問4 を見ていた）
    if (keepB[k] != null) b.scrollTop = keepB[k]; else if (ee.subs.includes(ee.p.subs.length - 1) && Math.min(...ee.subs) > 0) b.scrollTop = b.scrollHeight;
    // 絵に続きがあるときは、帯の下に一言（帯の中を動かすと見える）
    const more = b.parentElement.querySelector(".icsMore"), can = b.scrollHeight > b.clientHeight + 4;
    if (more) more.hidden = !can; }));
  body.scrollTop = keepY;
}
// 1問ぶんの紙: 赤字の一言 → 問題の絵 → 小問ごとに 式と考え方（方眼）と 答えの欄。線は 横幅を1とした割合で残す（画面の大きさが変わってもずれない）
// 2026-11-03: 1枚の紙を2つに分けて見せる。上（赤字の一言＋問題の絵）は固定の帯の canvas[data-icsb]、下（式と考え方・答え）は canvas[data-ics]。
//   線の保存は前のまま（1枚の紙の座標。キー rika-ink-<日>・db ink/ も同じ）。下の canvas は紙の top0 から下を見せ、座標は top0 だけずらして読み書きする
async function icsCanvas(cv, e, body) {
  const id = icsId(e), im = await imgReady(e.p.img).then(loadImg).catch(() => null);
  const ANS_TOP = icsDate() >= "2026-11-04";
  const NS = e.subs.length, LABH = NS > 1 ? 44 : 0, W = 1000, ASKH = 50, WORK = 480, ANSH = 150;
  const imH = im ? Math.min(im.height * (W - 40) / im.width, 1600) : 40, AREA = LABH + WORK + ANSH, H = ASKH + imH + 20 + NS * AREA + 20, top0 = ASKH + imH + 20;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const bcv = cv.closest(".icsQ") && cv.closest(".icsQ").querySelector("canvas[data-icsb]"), band = bcv && bcv.parentElement;
  // 見せる部分: 紙の上の位置 y0 から 高さ h。sc は指で動かす入れもの
  const parts = [bcv ? {c: bcv, y0: 0, h: top0, sc: band} : null, {c: cv, y0: bcv ? top0 : 0, h: bcv ? H - top0 : H, sc: body}].filter(Boolean);
  parts.forEach(P => { const cssW = P.c.clientWidth || 800; P.s = cssW / W; P.c.width = Math.round(cssW * dpr); P.c.height = Math.round(P.h * P.s * dpr); P.c.style.height = (P.h * P.s) + "px"; P.g = P.c.getContext("2d"); });
  const base = P => { const g = P.g; g.setTransform(dpr * P.s, 0, 0, dpr * P.s, 0, -P.y0 * dpr * P.s); g.fillStyle = "#fff"; g.fillRect(0, P.y0, W, P.h);
    if (P.y0 < top0) {
      g.font = `700 26px ${FONT}`; g.fillStyle = "#c0392b"; g.fillText("聞かれていることに 線を引こう", 20, 34);
      if (im) g.drawImage(im, 20, ASKH, im.width * imH / im.height, imH);
      else { g.fillStyle = "#555"; g.font = `400 24px ${FONT}`; g.fillText("（問題の絵が 読みこめませんでした。プリントを見てね）", 20, ASKH + 28); } }
    if (P.y0 + P.h > top0) e.subs.forEach((si, j) => { const top = ANS_TOP ? top0 + NS * ANSH + j * (LABH + WORK) : top0 + j * AREA, y0 = top + LABH;
      if (LABH) { g.fillStyle = "#1c6b78"; g.fillRect(20, top + 4, W - 40, 3); g.font = `700 28px ${FONT}`; g.fillText(subName(e.p, si) || `(${j + 1})`, 24, top + 38); }
      // 2026-11-03 ユーザー「解答欄は全部上に詰めて。式を書く欄はその下に改めて (1)(2)(3) で並べて」→ 11/4 の分から 問題のすぐ下に答えの欄を全部 → その下に小問ごとの式と考え方（それより前の日は書いた線がずれないよう前のまま）
      const wy = y0, ay = ANS_TOP ? top0 + j * ANSH + 10 : y0 + WORK + 20;
      g.fillStyle = "#555"; g.font = `400 22px ${FONT}`; g.fillText("式と考え方", 24, wy + 28);
      g.strokeStyle = "#e3ebe7"; g.lineWidth = 1; for (let x = 20; x <= W - 20; x += 40) { g.beginPath(); g.moveTo(x, wy + 40); g.lineTo(x, wy + WORK); g.stroke(); }
      for (let y = wy + 40; y <= wy + WORK; y += 40) { g.beginPath(); g.moveTo(20, y); g.lineTo(W - 20, y); g.stroke(); }
      g.strokeStyle = "#222"; g.lineWidth = 3; g.strokeRect(W - 560, ay, 540, ANSH - 20);
      g.fillStyle = "#111"; g.font = `700 28px ${FONT}`; g.fillText(LABH ? (subName(e.p, si) || "") + "の答え" : "答え", LABH ? W - 720 : W - 650, ay + 75); }); };
  const strokes = () => ICS.ink[id] || [];
  const line = (g, s) => { if (!s.p.length) return; g.strokeStyle = s.c; g.lineWidth = 2; g.lineCap = g.lineJoin = "round"; g.beginPath(); g.moveTo(s.p[0][0] * W, s.p[0][1] * W); s.p.forEach(q => g.lineTo(q[0] * W, q[1] * W)); if (s.p.length === 1) g.lineTo(s.p[0][0] * W + .1, s.p[0][1] * W); g.stroke(); };
  const paint = P => { base(P); strokes().forEach(s => line(P.g, s)); };
  const draw = P => (P ? [P] : parts).forEach(paint);
  ICS.cv.push({id, draw: () => draw()}); draw();
  const eraseAt = q => { const a = strokes(), b = a.filter(s => !s.p.some(v => Math.hypot(v[0] - q[0], v[1] - q[1]) < 0.02)); if (b.length !== a.length) { ICS.ink[id] = b; draw(); } };
  parts.forEach(P => {
    const c = P.c;
    const pt = ev => { const r = c.getBoundingClientRect(); const f = v => Math.round(v * 10000) / 10000; return [f((ev.clientX - r.left) / r.width), f((ev.clientY - r.top) / r.width + P.y0 / W)]; };
    let cur = null, scrollY = null, before = null;
    c.onpointerdown = ev => {
      if (ev.pointerType === "touch" && !ICS.finger) { scrollY = ev.clientY; return; }   // 指は画面を動かす（手のひらで線が入らないように）
      ev.preventDefault(); try { c.setPointerCapture(ev.pointerId); } catch (x) {} before = strokes().slice();
      if (ICS.erase) { cur = {erase: true}; eraseAt(pt(ev)); return; }
      cur = {c: ICS.pen, p: [pt(ev)]}; ICS.ink[id] = strokes().concat([cur]); draw(P); };
    c.onpointermove = ev => {
      // 指: 帯の中なら帯を動かす（帯がもう動かないときは下の紙を動かす）
      if (scrollY !== null) { const dy = ev.clientY - scrollY, s0 = P.sc.scrollTop; P.sc.scrollTop -= dy; if (P.sc !== body && P.sc.scrollTop === s0) body.scrollTop -= dy; scrollY = ev.clientY; return; }
      if (!cur) return; ev.preventDefault();
      if (cur.erase) return eraseAt(pt(ev));
      const ce = ev.getCoalescedEvents ? ev.getCoalescedEvents() : []; (ce.length ? ce : [ev]).forEach(x => cur.p.push(pt(x))); draw(P); };   // 速く書いても欠けないように まとめられた点も全部
    c.onpointerup = c.onpointercancel = () => { if (scrollY !== null) { scrollY = null; return; } if (!cur) return; cur = null; draw();   // 帯と紙の間にまたがった線も両方に出す
      if (JSON.stringify(before) !== JSON.stringify(strokes())) { ICS.undo.push({id, before}); if (ICS.undo.length > 80) ICS.undo.shift(); icsSave(id); } };
  });
}

/* ---- 押しても見ている場所を動かさない・開いたパネルを閉じない（2026-10-10 ユーザー「選んだり外したりすると画面が移動したりパネルが閉じたりして使いづらい」）----
   押すたびに全体を描き直す作りはそのまま。描き直す前に ①#today・#dash の details の開閉 ②押したボタン（無ければ画面に見えている先頭のボタン）の画面上の位置 を覚え、
   描き直したあとに戻す。押したボタンが同じ高さに残るので、上の一覧が1行ふえても見ている場所はずれない */
const VIEW = {open: {}, click: null, depth: 0};
const VIEW_BOX = "#today, #dash";
const detKey = d => { const s = d.closest("#today, #dash"); const sm = d.querySelector(":scope > summary");
  return (s ? s.id : "") + ":" + (d.dataset.key || d.id || (sm ? sm.textContent : "").trim().split(/[\s　（(]/)[0]); };
const anchorOf = el => { if (!el) return null;
  const a = [...el.attributes].find(x => x.name.startsWith("data-") && x.name !== "data-key") || (el.id ? {name: "id", value: el.id} : null);
  if (!a) return null; const sel = a.name === "id" ? "#" + CSS.escape(a.value) : `[${a.name}="${CSS.escape(a.value)}"]`;
  const all = [...document.querySelectorAll(sel)]; return {sel, idx: Math.max(0, all.indexOf(el)), top: el.getBoundingClientRect().top}; };
const visible = el => el && el.getClientRects().length > 0;
document.addEventListener("click", e => { const t = e.target.closest && e.target.closest("[data-psub],[data-pick],[data-peek],[data-dsel],[data-drm],[data-trm],[data-cyck],[data-uskip],[data-logkai],[data-dact],button[id],summary");
  if (t && t.closest(VIEW_BOX)) VIEW.click = {el: t, t: Date.now()}; }, true);
function keepView(fn) {
  return function (...args) {
    if (VIEW.depth++) { try { return fn.apply(this, args); } finally { VIEW.depth--; } }
    let anchors = [];
    try {
      document.querySelectorAll("#today details, #dash details").forEach(d => VIEW.open[detKey(d)] = d.open);
      const c = VIEW.click && Date.now() - VIEW.click.t < 15000 && document.contains(VIEW.click.el) ? VIEW.click.el : null;
      const sum = c && c.tagName === "SUMMARY" ? c : null;   // summary を押したときは、その details の中ではなく summary そのものを目印に
      const first = [...document.querySelectorAll("#today [data-psub], #today [data-pick], #today [data-drm], #dash [data-dsel], #today summary, #dash summary")]
        .find(x => { const r = x.getBoundingClientRect(); return r.height && r.top >= 0 && r.top < innerHeight; });
      anchors = [sum ? null : anchorOf(c), first ? anchorOf(first) : null].filter(Boolean);
    } catch (e) {}
    try { return fn.apply(this, args); }
    finally {
      VIEW.depth--;
      try {
        document.querySelectorAll("#today details, #dash details").forEach(d => { const k = detKey(d); if (k in VIEW.open && d.open !== VIEW.open[k]) d.open = VIEW.open[k]; });
        for (const a of anchors) { const el = document.querySelectorAll(a.sel)[a.idx];
          if (visible(el)) { const dy = el.getBoundingClientRect().top - a.top; if (Math.abs(dy) > 1) window.scrollBy(0, dy); break; } }
      } catch (e) {}
    }
  };
}
window.keepView = keepView;
renderToday = keepView(renderToday);

/* ---- つなぎこみ ---- */
const _renderBase = render;
// どこかで止まっても、ほかの部分は出す。エラーは画面に小さく出す（原因を調べるため）
window.SHOWERR = window.SHOWERR || [];
const safe = (name, f) => { try { f(); } catch (e) { SHOWERR.push(name + ": " + (e && e.message)); console.error(e); showErr(); } };
function showErr() { let b = document.getElementById("errbox"); if (!b) { b = document.createElement("p"); b.id = "errbox"; b.className = "note diag"; document.querySelector(".wrap").append(b); }
  b.textContent = "（表示のエラー: " + [...new Set(SHOWERR)].slice(-3).join(" / ") + "）"; }
window.addEventListener("error", e => { SHOWERR.push((e.message || "") + " @" + ((e.filename || "").split("/").pop()) + ":" + e.lineno); showErr(); });
render = keepView(function () { safe("main", _renderBase); safe("today", renderToday); if (window.renderDash) safe("dash", renderDash); });
render();   // まずこの端末の保存で出す（アプリの保存先は後から届く）
(async () => {
  if (!window.claude) return;
  const d = await claude.use("db").catch(() => null);
  if (d) {
    // 前の版の保存先（日付の文書）しか無ければ、それを読む
    try { const cur = await d.doc(DAYC + "/current").get(); if (!cur.exists) { const old = await d.doc(DAYC + "/" + todayKey()).get(); if (old.exists && dayValid(old.data())) { day = JSON.parse(JSON.stringify(old.data())); await d.doc(DAYC + "/current").set(day); } } } catch (e) {}
    let autoPrep = false;
    d.doc(DAYC + "/current").onSnapshot(s => { if (!autoPrep && s.exists && MODE === "parent") { autoPrep = true; setTimeout(() => { if (day && sample) prepareViz(); }, 1500); } if (s.exists && dayValid(s.data())) { day = JSON.parse(JSON.stringify(s.data())); try { localStorage.setItem("rika-step-dayAll", JSON.stringify(day)); } catch (e) {} } else if (!s.metadata.fromCache) day = null; if (!dayBusy) render(); }, () => {});
    d.doc("settings/draft").onSnapshot(s => { if (!s.exists || day) return; const it = s.data().items; const js = JSON.stringify(it || []);
      if (Array.isArray(it) && js !== lastDraftJs) { draft = JSON.parse(js); lastDraftJs = js; try { localStorage.setItem("rika-step-draft", js); } catch (e) {} if (!dayBusy) renderToday(); } }, () => {});
  }
  render();
})();
