// 回ごとの判定（どの回でも同じ決まり）。index.html（1問の画面）・today.js（今日のプリント）・dash.js（保護者）が使う
//   makeKai(n, getRec, isSkip) … getRec(): その回の記録 {"rei1_0": [{ok,t,by}], …}、isSkip(n, id): 親がスキップにしたか
// 回の呼び名。テストなど回でないもの（KAI_DATA[n].short がある）はその名前
window.kaiName = n => (window.KAI_DATA[n] && window.KAI_DATA[n].short) || "第" + n + "回";
// 週テストの問題（id が tw<週><a|bc|s>_…）の決まり（2026-10-25 ユーザー）
//   - S問題（tw◯s_）はどの回も出さない（目指すのはBクラスの平均）
//   - 週テストを受けた日の次の日からでないと出さない（前にやると、週テストで実力より高く出てしまう）
//   おすすめ・手で選ぶ・1問の画面・ステップ地図のどれにも出ない。データと記録は残る（日が来れば出る）
//   WT_DATE: 週テストの回 → 受ける日。WT_DONE_MAX 以下の回は受けずみ。表に無く WT_DONE_MAX より後の回は、まだ出さない（日が決まったら足す）
window.WT_DONE_MAX = 8;
window.WT_DATE = {9: "2026-10-31"};
window.testHidden = (id, now) => {
  const m = /^tw(\d+)(a|bc|s)_/.exec(id); if (!m) return false;
  if (m[2] === "s") return true;
  const w = +m[1]; if (w <= window.WT_DONE_MAX) return false;
  const d = window.WT_DATE[w]; if (!d) return true;
  return (now || Date.now()) < new Date(d + "T00:00:00").getTime() + 864e5;
};
window.makeKai = function (n, getRec, isSkip) {
  const KD = window.KAI_DATA[n];
  const withImg = p => Object.assign({}, p, {kai: n, img: "img/" + n + "/" + p.id + ".png"});
  // 難関校対策（nankan）は出さない（ユーザーの方針 2026-10-03）
  // 発展問題（id が hatten で始まる）はやらない（ユーザー 2026-10-10）。データは消さず、出さないだけ
  // 週テストの問題の決まり（window.testHidden）で隠すものも、ここで出さない（データ・記録は消さない）
  const noHatten = x => !x.nankan && !x.id.startsWith("hatten") && !window.testHidden(x.id);
  // 系統の steps が発展問題だけだったときは、extra（週テストなど）を steps に繰り上げる。何も残らない系統は出さない
  const UNITS = KD.units.map(u => {
    const st = u.steps.filter(noHatten), ex = (u.extra || []).filter(noHatten);
    return Object.assign({}, u, {kai: n, steps: (st.length ? st : ex).map(withImg), extra: (st.length ? ex : []).map(withImg)});
  }).filter(u => u.steps.length);
  const hasUnit = id => UNITS.some(u => u.id === id);
  const RENSHU = KD.renshu.filter(noHatten).map(r => Object.assign(withImg(r), {needs: r.needs.filter(hasUnit)}));
  // 反復練習: after（練習問題）があればその練習のあと。無ければ needs（系統）がそろったら（第5回のステップ②）
  const HANREN = (KD.hanren || []).filter(r => noHatten(r) && (r.after ? RENSHU.some(x => x.id === r.after) : true))
    .map(r => Object.assign(withImg(r), r.after ? {} : {needs: (r.needs || []).filter(hasUnit)}));
  const PRACTICE = [...RENSHU, ...HANREN];
  const ITEMS = {}, UNIT_OF = {};
  UNITS.forEach(u => [...u.steps, ...u.extra].forEach(p => { ITEMS[p.id] = p; UNIT_OF[p.id] = u; }));
  PRACTICE.forEach(p => ITEMS[p.id] = p);

  const kind = p => p.id.startsWith("t") ? "テスト" : p.id.startsWith("rei") ? "例題" : p.id.startsWith("rui") ? "類題" : p.id.startsWith("kihon") ? "基本問題"
    : p.id.startsWith("hanren") ? "反復練習" : p.id.startsWith("han") ? "反復基本" : p.id.startsWith("st1") ? "反復基本" : p.id.startsWith("st2") ? "反復練習" : "練習問題";
  const sk = (p, i) => p.id + "_" + i;
  const last = (p, i) => { const a = getRec()[sk(p, i)]; return a && a.length ? a[a.length - 1] : null; };
  const skipped = p => !!isSkip(n, p.id);
  const subOk = (p, i) => skipped(p) || !!(last(p, i) && last(p, i).ok);
  const itemOk = p => p.subs.every((_, i) => subOk(p, i));
  const itemTried = p => !skipped(p) && p.subs.some((_, i) => last(p, i));
  // 1回目で◎だったか（スキップは「定着している」扱い）
  const firstOk = p => skipped(p) || p.subs.every((_, i) => { const a = getRec()[sk(p, i)]; return !!(a && a.length && a[0].ok); });
  // 例題・類題・基本が全部済んでも、1回で◎にならなかった問題があれば反復問題（基本）を足す
  const needsExtra = u => u.extra.length > 0 && u.steps.every(itemOk) && u.steps.some(p => !firstOk(p));
  const unitItems = u => needsExtra(u) ? [...u.steps, ...u.extra] : u.steps;
  const unitOk = u => u.steps.every(itemOk);
  const unitById = id => UNITS.find(u => u.id === id);
  const needsOf = p => p.needs || (ITEMS[p.after] && ITEMS[p.after].needs) || [];
  const ready = r => r.after ? itemOk(ITEMS[r.after]) : r.needs.every(id => unitOk(unitById(id)));
  // 小問の状態: first=1回で◎ / redo=やり直して◎ / ng=× / todo=まだ / skip=スキップ
  const subState = (p, i) => {
    if (skipped(p)) return "skip";
    const a = getRec()[sk(p, i)];
    if (!a || !a.length) return "todo";
    if (!a[a.length - 1].ok) return "ng";
    return a[0].ok ? "first" : "redo";
  };
  return {n, KD, title: KD.title, UNITS, RENSHU, HANREN, PRACTICE, ITEMS, UNIT_OF, kind, sk, last, skipped, subOk, itemOk, itemTried,
    firstOk, needsExtra, unitItems, unitOk, unitById, needsOf, ready, subState};
};
// 画像は imgs_0N.js に data URI でまとめてある（公開ファイル数の上限のため）。無ければ元のパス
// 画像は data URI で ic/ic_*.js の束にまとめてある（build_imgchunks.py）。どの束かは imgman.js。束に無ければ元のパス（通行証つき）
// ★束は使うときに読む（2026-11-01 開くときに全部 約48MB を読むと iPad で開かない。算数ステップ帳 V213 と同じ作り）。まだのときは白い点を返し、読めたら描き直す
(() => {
  const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", got = {};
  const key = s => String(s).replace(/^img\//, "").replace(/\.png$/, "");
  const man = () => window.IMGMAN || {f: [], m: {}};
  const fu = u => window.furl ? furl(u) : u;
  // 読めなくても止めない（通行証が切れたときなど）。同じ束は1回だけ取りにいく
  const load = i => { const f = man().f[i]; if (!f) return Promise.resolve();
    return got[f] || (got[f] = new Promise(ok => { const el = document.createElement("script"); el.src = fu(f); el.onload = ok; el.onerror = ok; document.head.appendChild(el); })); };
  let t = null;
  const redraw = () => { if (t) return; t = setTimeout(() => { t = null; if (typeof dayBusy !== "undefined" && dayBusy) return redraw(); try { render(); } catch (e) {} }, 200); };
  window.imgSrc = s => { const k = key(s), v = window.IMGS && window.IMGS[k]; if (v) return v;
    const i = man().m[k]; if (i == null) return fu(s); load(i).then(redraw); return BLANK; };
  // 待ってから使う（PDF・画面で解く・Claude に送る絵）
  window.imgReady = async s => { const k = key(s), i = man().m[k]; if (i != null && !(window.IMGS && window.IMGS[k])) await load(i); return window.imgSrc(s); };
  // 回 k の問題（ids）の絵と答えの絵（k/id・k/a_id_N）の束を先に読む
  let byBase = null;
  window.imgPreload = (k, ids) => { if (!byBase) { byBase = {}; for (const [kk, i] of Object.entries(man().m)) { const b = kk.replace(/\/a_(.*)_\d+$/, "/$1"); (byBase[b] = byBase[b] || new Set()).add(i); } }
    const need = new Set(); ids.forEach(id => (byBase[k + "/" + id] || []).forEach(i => need.add(i)));
    return Promise.all([...need].map(load)); };
})();
