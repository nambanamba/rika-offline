/* ---------- 保護者の画面: 回ごと・系統ごとの進み具合と、スキップ／もう一度／◎にする ---------- */
// 小問の状態: first=1回で◎ / redo=やり直して◎ / ng=× / todo=まだ / skip=スキップ
const ST = [
  {k: "first", label: "1回で◎", sym: "◎"},
  {k: "redo", label: "やり直して◎", sym: "○"},
  {k: "ng", label: "×", sym: "×"},
  {k: "todo", label: "まだ", sym: "・"},
  {k: "skip", label: "スキップ", sym: "－"},
];
let dashOpen = false, dashSel = null, quickOk = false, pickToday = false;   // pickToday: 押すと今日の問題に入れる／外す   // quickOk: 押すだけで◎（もう一度で戻す）   // dashSel = {k, id}
try { dashOpen = localStorage.getItem("rika-step-dash") === "1"; } catch (e) {}

const allItemsOf = m => [...m.UNITS.flatMap(u => [...u.steps, ...u.extra]), ...m.PRACTICE];
function countStates(m, items) {
  const c = {first: 0, redo: 0, ng: 0, todo: 0, skip: 0};
  items.forEach(p => p.subs.forEach((_, i) => c[m.subState(p, i)]++));
  return c;
}
// 横の積み上げ棒（状態ごとの小問の数）。どの区切りにも数と記号を出し、色だけに頼らない
function stackBar(c) {
  const total = ST.reduce((a, s) => a + c[s.k], 0) || 1;
  return `<div class="sbar" role="img" aria-label="${ST.map(s => s.label + " " + c[s.k]).join("、")}">${ST.filter(s => c[s.k]).map(s =>
    `<span class="seg s-${s.k}" style="flex-grow:${c[s.k]}" title="${s.label} ${c[s.k]}問（${Math.round(c[s.k] * 100 / total)}%）">${c[s.k] * 100 / total >= 7 ? s.sym + c[s.k] : ""}</span>`).join("")}</div>`;
}
const legend = () => `<div class="slegend">${ST.map(s => `<span><i class="sw s-${s.k}"></i>${s.sym} ${s.label}</span>`).join("")}</div>`;

// 記録の読み方
const BY = {kid: "子", parent: "親", hand: "手", claude: "写真", typed: "入力"};
const fmtD = t => { if (!t || t < 1e11) return "—"; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
const tries = (m, p, i) => recOf(m.n)[m.sk(p, i)] || [];
const ngCount = (m, p) => p.subs.reduce((a, _, i) => a + tries(m, p, i).filter(x => !x.ok).length, 0);
function historyHtml(m, p) {
  return `<table class="hist"><tbody>${p.subs.map((sn, i) => { const a = tries(m, p, i);
    return `<tr><th>${esc(sn || "答え")}</th><td>${a.length ? a.map(x => `<span class="${x.ok ? "hok" : "hng"}">${fmtD(x.t)} ${x.ok ? "◎" : "×"}<small>${BY[x.by] || ""}</small></span>`).join(" ") : `<span class="note">まだ</span>`}</td>
      <td class="note">×${a.filter(x => !x.ok).length}回</td></tr>`; }).join("")}</tbody></table>`;
}
// これまでの記録: 日ごと（全部の日をさかのぼれる）・まちがえたことがある問題（全部）
const WD = "日月火水木金土";
const dayKey = t => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const fmtDay = k => { const y = Math.floor(k / 10000), mo = Math.floor(k / 100) % 100, da = k % 100; return `${mo}月${da}日（${WD[new Date(y, mo - 1, da).getDay()]}）`; };
const fmtHM = t => { const d = new Date(t); return d.getHours() + ":" + String(d.getMinutes()).padStart(2, "0"); };
const byOf = x => x.note === "まとめて登録" ? "まとめ" : x.note ? x.note : (BY[x.by] || "");
let logKai = 0;   // まちがえた問題の一覧を回でしぼる（0＝全部）
function logHtml() {
  const rows = [], ngs = [];
  for (const n of KAI_LIST) { const m = MS[n];
    for (const p of Object.values(m.ITEMS)) {
      p.subs.forEach((sn, i) => tries(m, p, i).forEach(x => { if (x.t > 1e11) rows.push({n, p, sn, x}); }));
      const c = ngCount(m, p);
      if (c) { const all = p.subs.flatMap((sn, i) => tries(m, p, i).map(x => ({sn, x}))).sort((a, b) => (a.x.t || 0) - (b.x.t || 0));
        ngs.push({n, p, c, all, done: p.subs.every((_, i) => m.subOk(p, i)), last: Math.max(...all.map(r => r.x.t || 0))}); }
    } }
  // 日ごと
  const days = new Map();
  rows.sort((a, b) => b.x.t - a.x.t).forEach(r => { const k = dayKey(r.x.t); if (!days.has(k)) days.set(k, []); days.get(k).push(r); });
  const dayHtml = [...days].map(([k, rs]) => { const ok = rs.filter(r => r.x.ok).length, ng = rs.length - ok;
    return `<details class="lday" data-key="d${k}"><summary>${fmtDay(k)}　<span class="hok">◎${ok}</span>　<span class="${ng ? "hng" : "note"}">×${ng}</span></summary><table class="hist"><tbody>${rs.map((r, ri) =>
      `<tr><td class="note">${fmtHM(r.x.t)}</td><th><button class="link" data-dsel="${r.n}|${r.p.id}" data-at="d${k}-${ri}">${kaiName(r.n)} ${esc(r.p.no)} ${esc(r.sn)}</button></th><td class="${r.x.ok ? "hok" : "hng"}">${r.x.ok ? "◎" : "×"}</td><td class="note">${byOf(r.x)}</td></tr>${dactRow(r.n, r.p, "d" + k + "-" + ri, 4)}`).join("")}</tbody></table></details>`; }).join("");
  // まちがえたことがある問題（全部。×の多い順）
  ngs.sort((a, b) => b.c - a.c || b.last - a.last);
  const ngShow = ngs.filter(r => !logKai || r.n === logKai);
  const ngHtml = ngShow.map(r => `<tr><th><button class="link" data-dsel="${r.n}|${r.p.id}" data-at="ng">${kaiName(r.n)} ${esc(r.p.no)}</button></th><td class="hng">×${r.c}回</td><td>${r.done ? `<span class="hok">いまは◎</span>` : `<span class="hng">まだ◎でない</span>`}</td></tr>
    <tr><td></td><td colspan="2" class="note">${r.all.map(a => `<span class="${a.x.ok ? "hok" : "hng"}">${fmtD(a.x.t)}${a.sn ? esc(a.sn) : ""}${a.x.ok ? "◎" : "×"}</span>`).join(" → ")}</td></tr>${dactRow(r.n, r.p, "ng", 3)}`).join("");
  return `<details class="dk"${logOpen ? " open" : ""} id="logdk"><summary>これまでの記録（いつ・何回まちがえたか）</summary>
    <h3 class="lh">まちがえたことがある問題（${ngs.length}問）</h3>
    <div class="chips">${[0, ...KAI_LIST].map(n => `<button class="ghost${logKai === n ? " on" : ""}" data-logkai="${n}">${n ? kaiName(n) : "全部"}</button>`).join("")}</div>
    ${ngShow.length ? `<table class="hist"><tbody>${ngHtml}</tbody></table>` : `<p class="note">ありません</p>`}
    <h3 class="lh">日ごとの記録（${days.size}日。押すとその日にやった問題が全部出ます）</h3>
    ${dayHtml || `<p class="note">まだありません</p>`}
    <p class="note">子＝子どもの画面、親＝おうちの人、写真＝写真の◎付け、手＝自分で付けた、まとめ＝あとからまとめて登録</p></details>`;
}
let logOpen = false;
function dchip(m, p, extraTitle) {
  const states = p.subs.map((_, i) => m.subState(p, i));
  const worst = ["ng", "todo", "redo", "first", "skip"].find(k => states.includes(k)) || "todo";
  const sel = dashSel && dashSel.k === m.n && dashSel.id === p.id;
  const label = p.no.replace("基本問題", "基本").replace("練習問題", "練習");
  const td = window.inToday && window.inToday(m.n, p.id);
  const b = `<button class="dchip s-${worst}${sel ? " sel" : ""}${td ? " intoday" : ""}" data-dsel="${m.n}|${p.id}" title="${esc(extraTitle || "")}"${pickToday ? ` aria-pressed="${!!td}"` : ""}>${td ? "📌" : ""}${esc(label)} <b>${states.map(s => ST.find(x => x.k === s).sym).join("")}</b>${ngCount(m, p) ? `<small class="ngc">×${ngCount(m, p)}</small>` : ""}</button>`;
  // 今日の問題を選んでいるときは、その場で中身を見られるように（2026-10-10）
  return pickToday && typeof peekBtn === "function" ? `<span class="pitem">${b}${peekBtn(m.n, p.id)}</span>` : b;
}

// えらんだ問題の操作パネル。押したチップ（または記録の行）のすぐ下に出す（2026-10-10 ユーザー「すぐ下か、この辺に出てきてほしい」）
// dashSel.at = どこで押したか（u＝系統のチップ、ng＝まちがえた問題の一覧、d…＝日ごとの記録の行）
const selHere = (n, p, at) => dashSel && dashSel.k === n && dashSel.id === p.id && (dashSel.at || "u") === at;
function dactHtml() {
  const m = MS[dashSel.k], p = m.ITEMS[dashSel.id], sk = m.skipped(p);
  return `<div class="dact"><b>${kaiName(m.n)} ${esc(p.no)}</b>
      ${historyHtml(m, p)}
      <div class="row">
        <button data-dact="skip">${sk ? "スキップをやめる" : "スキップ（出さない）"}</button>
        <button data-dact="again" ${sk ? "disabled" : ""}>もう一度やらせる</button>
        <button data-dact="ok" ${sk ? "disabled" : ""}>◎にする</button>
        <button data-dact="clear" class="ghost" ${sk ? "disabled" : ""}>記録を消す</button>
        <button data-dact="open" class="ghost">問題を開く（今日のプリントのすぐ下に出ます）</button>
        <button data-dact="close" class="ghost">とじる</button>
      </div>
      <p class="note">もう一度＝最後の結果を×にして、その系統で次に出す問題をここに戻します。スキップ＝◎と同じに扱って、その系統は先へ進みます。</p></div>`;
}
const dactAfter = (n, items) => dashSel && MS[dashSel.k] && MS[dashSel.k].ITEMS[dashSel.id] && items.some(p => selHere(n, p, "u")) ? dactHtml() : "";
const dactRow = (n, p, at, cols) => selHere(n, p, at) && MS[dashSel.k] ? `<tr><td colspan="${cols}">${dactHtml()}</td></tr>` : "";

function renderDash() {
  const el = document.getElementById("dash"); if (!el) return;
  let h = `<div class="mh"><h2>保護者の画面</h2><button class="ghost" id="dtog">${dashOpen ? "閉じる" : "開く"}</button></div>`;
  if (!dashOpen) { el.innerHTML = h + `<p class="note">回ごとの進み具合を見て、問題をスキップしたり、もう一度やらせたりできます。</p>`; bindDash(el); return; }
  h += `<div class="row"><button class="${pickToday ? "primary" : "ghost"}" id="pkt">${pickToday ? "今日の問題に入れる：オン（押すと入れる／外す）" : "今日の問題に入れる"}</button><button class="${quickOk ? "primary" : "ghost"}" id="qok">${quickOk ? "タップで◎：オン（押すと◎、もう一度で戻す）" : "タップで◎にする"}</button></div>`;
  h += legend();
  // 回ごとの棒
  h += `<div class="kbars">${KAI_LIST.map(n => {
    const m = MS[n], c = countStates(m, allItemsOf(m));
    const inR = SETTINGS.range.includes(n);
    return `<div class="krow${inR ? "" : " out"}"><span class="kname">${kaiName(n)}${n === SETTINGS.cur ? "（今週）" : ""}</span>${stackBar(c)}<span class="knum">${c.first + c.redo}/${ST.reduce((a, s) => a + c[s.k], 0) - c.skip}</span></div>`;
  }).join("")}</div>`;
  // 系統ごと
  // 全部の回を出す（範囲のチェックに関係なく。2026-10-08 ユーザー「第6回の系統図がない。そのほかも欲しい」）
  const show = KAI_LIST;
  h += show.map(n => {
    const m = MS[n];
    return `<details class="dk" ${n === SETTINGS.cur ? "open" : ""}><summary>${kaiName(n)} ${esc(m.title.replace(/^(第\d+回|組分け\S*|5上第\d+回)\s*/, ""))}</summary>
      ${m.UNITS.map(u => {
        const c = countStates(m, [...u.steps, ...u.extra]);
        const allSkip = [...u.steps].every(m.skipped);
        return `<div class="du"><div class="duh"><span>${esc(u.label)}　${esc(u.name)}</span>${stackBar(c)}
          <button class="ghost mini" data-uskip="${n}|${u.id}">${allSkip ? "系統のスキップをやめる" : "系統ごとスキップ"}</button></div>
          <div class="chips">${u.steps.map(p => dchip(m, p)).join("")}${u.extra.map(p => dchip(m, p, "反復問題: 1回でできなかった問題があったら出ます")).join("")}</div>${pickToday ? peekHtml(n, [...u.steps, ...u.extra]) : ""}${dactAfter(n, [...u.steps, ...u.extra])}</div>`;
      }).join("")}
      ${m.PRACTICE.length ? `<div class="du"><div class="duh"><span>練習問題・反復練習</span>${stackBar(countStates(m, m.PRACTICE))}</div>
        <div class="chips">${m.PRACTICE.map(p => dchip(m, p, p.after ? m.ITEMS[p.after].no + "のあと" : "土台: " + m.needsOf(p).map(id => m.unitById(id).label).join("・"))).join("")}</div>${pickToday ? peekHtml(n, m.PRACTICE) : ""}${dactAfter(n, m.PRACTICE)}</div>` : ""}
    </details>`;
  }).join("");
  h += logHtml();
  h += clearHtml();
  el.innerHTML = h;
  if (clearArm || clearMsg || bkArm || bkList) { const d = el.querySelector("details.clr"); if (d) d.open = true; }
  bindDash(el);
}
function bindDash(el) {
  el.querySelector("#dtog").onclick = () => { dashOpen = !dashOpen; try { localStorage.setItem("rika-step-dash", dashOpen ? "1" : "0"); } catch (e) {} renderDash(); };
  const qb = el.querySelector("#qok"); if (qb) qb.onclick = () => { quickOk = !quickOk; if (quickOk) pickToday = false; dashSel = null; renderDash(); };
  const pk = el.querySelector("#pkt"); if (pk) pk.onclick = () => { pickToday = !pickToday; if (pickToday) quickOk = false; dashSel = null; renderDash(); };
  el.querySelectorAll("[data-peek]").forEach(b => b.onclick = () => { togglePeek(b.dataset.peek); renderDash(); });
  if (window.renderBar) renderBar();
  const ld = el.querySelector("#logdk"); if (ld) ld.ontoggle = () => { logOpen = ld.open; };
  el.querySelectorAll("[data-logkai]").forEach(b => b.onclick = () => { logKai = +b.dataset.logkai; renderDash(); });
  el.querySelectorAll("[data-dsel]").forEach(b => b.onclick = async () => { const [k, id] = b.dataset.dsel.split("|");
    if (pickToday) return toggleToday(+k, id);
    if (!quickOk) { const at = b.dataset.at || "u"; dashSel = dashSel && dashSel.k === +k && dashSel.id === id && (dashSel.at || "u") === at ? null : {k: +k, id, at}; return renderDash(); }   // もう一度押すと閉じる
    const m = MS[+k], p = m.ITEMS[id], r = recOf(+k);
    const byParentOk = p.subs.every((_, i) => { const a = r[m.sk(p, i)] || []; return a.length && a[a.length - 1].by === "parent" && a[a.length - 1].ok; });
    for (const i of p.subs.keys()) {
      if (byParentOk) { const a = (r[m.sk(p, i)] || []).slice(0, -1); await writeRec(+k, m.sk(p, i), a.length ? a : null); }
      else if (!m.subOk(p, i)) await addTry(+k, p, i, {ok: true, t: Date.now(), by: "parent"});
    }
    render(); });
  el.querySelectorAll("[data-uskip]").forEach(b => b.onclick = async () => {
    const [k, uid] = b.dataset.uskip.split("|"), m = MS[+k], u = m.unitById(uid);
    const ids = [...u.steps, ...u.extra].map(p => p.id);
    await setSkip(+k, ids, !u.steps.every(m.skipped)); render();
  });
  const bl = el.querySelector("#bkload"); if (bl) bl.onclick = async () => { try { bkList = (await db.collection("backup").get()).docs.map(d => d.id).sort().reverse(); } catch (e) { bkList = []; } renderDash(); };
  el.querySelectorAll("[data-bk]").forEach(b => b.onclick = async () => { const d = b.dataset.bk;
    if (bkArm !== d) { bkArm = d; return renderDash(); }
    bkArm = null; b.disabled = true;
    try { const c = await restoreBackup(d); clearMsg = `${d} の控えから ${c} 件の記録を戻しました。`; } catch (e) { clearMsg = "戻せませんでした（" + (e.message || e.code) + "）"; }
    render(); });
  el.querySelectorAll("[data-clr]").forEach(b => b.onclick = async () => {
    const id = b.dataset.clr;
    if (clearArm !== id) { clearArm = id; clearMsg = ""; return renderDash(); }
    clearArm = null; b.disabled = true;
    const ns = id === "all" ? KAI_LIST : [+id];
    const c = await clearKai(ns);
    clearMsg = `${id === "all" ? "全部の回" : kaiName(+id)}の記録を消しました（${c}件）。`;
    render();
  });
  el.querySelectorAll("[data-dact]").forEach(b => b.onclick = async () => {
    const m = MS[dashSel.k], p = m.ITEMS[dashSel.id], a = b.dataset.dact, now = Date.now();
    if (a === "close") { dashSel = null; return renderDash(); }
    if (a === "open") return goToAny(m.n, p.id);   // 下の「いま開いている問題」の欄へ動く（store.js）
    if (a === "skip") await setSkip(m.n, [p.id], !m.skipped(p));
    if (a === "again") for (const i of p.subs.keys()) await addTry(m.n, p, i, {ok: false, t: now, by: "parent"});
    if (a === "ok") for (const i of p.subs.keys()) await addTry(m.n, p, i, {ok: true, t: now, by: "parent"});
    if (a === "clear") for (const i of p.subs.keys()) await writeRec(m.n, m.sk(p, i), null);
    render();
  });
}
// ◎×の記録を消す（回ごと／全部）。2回押しで実行。スキップの設定は残す
let clearArm = null, clearMsg = "", bkList = null, bkArm = null;
// この端末の記録だけでなく、アプリの保存先にある記録（ほかの端末で付けた分も）を全部消す
async function clearKai(ns) {
  let c = 0;
  { const d = new Date(); await backupNow(todayKeyS() + "_消す前_" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0")); }
  for (const n of ns) {
    const keys = new Set(Object.keys(recOf(n)));
    if (db) { try { (await db.collection(recc(n)).get()).docs.forEach(d => keys.add(d.id)); } catch (e) {} }
    for (const key of keys) { await writeRec(n, key, null, "記録を消す"); c++; }
    if (db) { try { const left = (await db.collection(recc(n)).get()).docs; for (const d of left) { await db.doc(recc(n) + "/" + d.id).delete(); } } catch (e) {} }
  }
  return c;
}
function clearHtml() {
  const b = (id, label) => `<button class="ghost mini${clearArm === id ? " arm" : ""}" data-clr="${id}">${clearArm === id ? label + "：もう一度押すと消します" : label}</button>`;
  const bk = `<h3 class="lh">控えから戻す</h3><p class="note">親の画面を開いた日ごとに、全部の記録の控えを取っています（控えは消えません）。日付を2回押すと、その日の記録に戻します。</p>
    <div class="row">${bkList === null ? `<button class="ghost mini" id="bkload">控えの日付を見る</button>` : bkList.length ? bkList.map(d => `<button class="ghost mini${bkArm === d ? " arm" : ""}" data-bk="${d}">${bkArm === d ? d + "：もう一度押すと戻します" : d}</button>`).join("") : `<span class="note">まだ控えがありません</span>`}</div>`;
  return `<details class="dk clr"><summary>◎×の記録を消す・控えから戻す</summary>${bk}<h3 class="lh">記録を消す</h3><p class="note">消しても、控えからは戻せます。スキップの設定は消えません。</p>
    <div class="row">${KAI_LIST.map(n => b(String(n), `${kaiName(n)}`)).join("")}${b("all", "全部の回")}</div>${clearMsg ? `<p class="comment">${esc(clearMsg)}</p>` : ""}</details>`;
}
if (window.keepView) renderDash = keepView(renderDash);
window.renderDash = renderDash;
render();
