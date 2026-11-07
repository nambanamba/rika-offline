/* ---------- 全部の回の記録・スキップ・設定（今日のプリントと保護者の画面が使う） ---------- */
// 記録は回ごとのコレクション（第4回は最初の版の rec、ほかは recN）。いま開いている回は index.html の rec をそのまま使う
const recc = n => "rec" + n;   // 回ごとのコレクション（rec7 など）。名前を変えないこと（守ること.md）
const lsRec = n => "rika-step-kai" + n;
const RECS = {};
KAI_LIST.forEach(n => { if (n !== KAI_NO) { try { RECS[n] = JSON.parse(localStorage.getItem(lsRec(n)) || "{}"); } catch (e) { RECS[n] = {}; } } });
const recOf = n => n === KAI_NO ? rec : (RECS[n] || {});
const isSkip = (n, id) => SKIP.has(n + ":" + id);
const MS = {};
KAI_LIST.forEach(n => { MS[n] = n === KAI_NO ? M : makeKai(n, () => recOf(n), isSkip); });
try { JSON.parse(localStorage.getItem("rika-step-skip") || "[]").forEach(k => SKIP.add(k)); } catch (e) {}

// 設定: 1日の小問数、範囲の回、今週の回、今週の回から出す数
let SETTINGS = {perDay: 8, range: KAI_LIST.slice(), cur: KAI_NO, curShare: 4, rot: true, rot3: false};   // rot: おすすめを自動で（既定は毎日1段4問。2026-10-25）／rot3: 前の日替わり（1段4問→2段2問→3段以上1問）に戻す
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem("rika-step-settings") || "{}")); } catch (e) {}
const cleanSettings = () => {
  SETTINGS.range = (SETTINGS.range || []).map(Number).filter(n => KAI_LIST.includes(n)).sort((a, b) => a - b);
  if (!SETTINGS.range.length) SETTINGS.range = KAI_LIST.slice();
  if (!SETTINGS.range.includes(+SETTINGS.cur)) SETTINGS.cur = SETTINGS.range[SETTINGS.range.length - 1];
  SETTINGS.cur = +SETTINGS.cur;
  SETTINGS.perDay = Math.max(1, Math.min(30, +SETTINGS.perDay || 8));
  SETTINGS.curShare = Math.max(0, Math.min(SETTINGS.perDay, +SETTINGS.curShare || 0));
  SETTINGS.rot = SETTINGS.rot !== false; SETTINGS.rot3 = SETTINGS.rot3 === true;
};
cleanSettings();
async function saveSettings() {
  cleanSettings();
  try { localStorage.setItem("rika-step-settings", JSON.stringify(SETTINGS)); } catch (e) {}
  if (db) { try { await db.doc("settings/main").set(Object.assign({}, SETTINGS)); } catch (e) {} }
}

/* ---------- 記録の控え（消えないための二重の守り。どの操作でも消さない） ----------
   log/<自動id>     … ◎×の記録を書きかえるたびに、前と後を追記（append-only）
   backup/<日付>    … 親の画面を開いた日に、全部の回の記録をまるごと
   ⚠ この2つを消す処理・コレクション名を変える処理は、作らないこと */
window.logRecChange = async function (n, key, before, after, why) {
  const ev = {n, key, before: before || null, after: after || null, why: why || "", t: Date.now()};
  try { const L = JSON.parse(localStorage.getItem("rika-step-log") || "[]"); L.push(ev); localStorage.setItem("rika-step-log", JSON.stringify(L.slice(-3000))); } catch (e) {}
  if (db) { try { await db.collection("log").add(ev); } catch (e) {} }
};
async function dailyBackup() {
  if (!db) return; const day = todayKeyS();
  try { const d = await db.doc("backup/" + day).get(); if (d.exists) return; } catch (e) { return; }
  await backupNow(day);
}
// いまの記録をまるごと控える（id の例: 2026-10-03、2026-10-03_消す前_1530）
async function backupNow(id) {
  if (!db) return;
  const all = {}; let c = 0;
  for (const n of KAI_LIST) { all[n] = {}; try { (await db.collection(recc(n)).get()).docs.forEach(x => { const v = x.data(); if (v && v.tries) { all[n][x.id] = v.tries; c++; } }); } catch (e) {} }
  if (c) { try { await db.doc("backup/" + id).set({t: Date.now(), recs: JSON.stringify(all)}); } catch (e) {} }
}
window.backupNow = backupNow;
const todayKeyS = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
async function restoreBackup(day) {
  const d = await db.doc("backup/" + day).get(); if (!d.exists) throw new Error("その日の控えがありません");
  const all = JSON.parse(d.data().recs); let c = 0;
  for (const n of Object.keys(all)) for (const [key, arr] of Object.entries(all[n])) { await writeRec(+n, key, arr, "控えから戻す " + day); c++; }
  return c;
}
window.restoreBackup = restoreBackup;
// ある回の、ある小問の記録をまるごと置きかえる（null で消す）。かならず控えを残す
async function writeRec(n, key, arr, why) {
  logRecChange(n, key, (recOf(n)[key] || null), arr, why || "");
  if (n === KAI_NO) {
    if (arr) rec[key] = arr; else delete rec[key];
    try { localStorage.setItem(LS, JSON.stringify(rec)); } catch (e) {}
  } else {
    RECS[n] = RECS[n] || {};
    if (arr) RECS[n][key] = arr; else delete RECS[n][key];
    try { localStorage.setItem(lsRec(n), JSON.stringify(RECS[n])); } catch (e) {}
  }
  await recPut(n, key, arr);
}
// まだ送っていない記録を db に書き戻す（つながったとき・開いたとき・1分ごと。2026-11-06 機内）
async function recFlush() {
  if (!db) return;
  for (const pk of Object.keys(PEND)) {
    if (pendBusy[pk]) continue;   // 書いている途中のものは待つ
    const j = pk.indexOf("|"), n = +pk.slice(0, j), key = pk.slice(j + 1);
    if (!KAI_LIST.includes(n)) { delete PEND[pk]; pendSave(); continue; }
    const arr = recOf(n)[key] || null;
    if (!(await recPut(n, key, arr))) return;   // まだつながっていない
  }
}
window.recFlush = recFlush;
window.addEventListener("online", () => setTimeout(recFlush, 2000));
setInterval(() => { if (Object.keys(PEND).length) recFlush(); }, 60000);
const addTry = (n, p, i, entry) => writeRec(n, MS[n].sk(p, i), (recOf(n)[MS[n].sk(p, i)] || []).concat([entry]));
// まだ → ◎ → × → まだ
async function cycleSubK(n, p, i) {
  const key = MS[n].sk(p, i), arr = recOf(n)[key] || [];
  if (!arr.length) return writeRec(n, key, [{ok: true, t: Date.now(), by: "hand"}]);
  const l = arr[arr.length - 1];
  if (l.ok) return writeRec(n, key, arr.slice(0, -1).concat([Object.assign({}, l, {ok: false, by: "hand"})]));
  return writeRec(n, key, null);
}
async function setSkip(n, ids, on) {
  ids.forEach(id => on ? SKIP.add(n + ":" + id) : SKIP.delete(n + ":" + id));
  try { localStorage.setItem("rika-step-skip", JSON.stringify([...SKIP])); } catch (e) {}
  if (db) { try { await db.doc("settings/skip").set({keys: [...SKIP]}); } catch (e) {} }
}
// ほかの回の問題を開く: 回を切り替えて、開いたらその問題へ
function goToAny(n, id) {
  if (n === KAI_NO) { goTo(id); document.getElementById("cur").scrollIntoView({behavior: "smooth"}); return; }
  try { localStorage.setItem("rika-step-goto", id); } catch (e) {}
  switchKai(n);
}
try { const g = localStorage.getItem("rika-step-goto"); if (g && ITEMS[g]) { localStorage.removeItem("rika-step-goto"); goTo(g); setTimeout(() => document.getElementById("cur").scrollIntoView({behavior: "smooth"}), 600); } } catch (e) {}

(async () => {
  if (!window.claude) return;
  const d = await claude.use("db").catch(() => null);
  if (!d) return;
  if (MODE === "parent") setTimeout(dailyBackup, 3000);
  const rerender = () => { if (!busy) render(); };
  d.doc("settings/main").onSnapshot(s => { if (s.exists) { Object.assign(SETTINGS, s.data()); cleanSettings(); rerender(); } }, () => {});
  d.doc("settings/skip").onSnapshot(s => {
    if (!s.exists) return;
    SKIP.clear(); (s.data().keys || []).forEach(k => SKIP.add(k));
    try { localStorage.setItem("rika-step-skip", JSON.stringify([...SKIP])); } catch (e) {}
    rerender();
  }, () => {});
  KAI_LIST.filter(n => n !== KAI_NO).forEach(n => d.collection(recc(n)).onSnapshot(snap => {
    const next = {};
    snap.docs.forEach(x => { const v = x.data(); if (v && Array.isArray(v.tries)) next[x.id] = v.tries; });
    if (snap.empty && Object.keys(RECS[n] || {}).length) return;
    RECS[n] = recMerge(n, next, RECS[n] || {}); try { localStorage.setItem(lsRec(n), JSON.stringify(RECS[n])); } catch (e) {}
    rerender();
  }, () => {}));
  setTimeout(recFlush, 3000);   // 開いたとき、前に送れなかった記録があれば送る
})();
