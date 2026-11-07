/* ---------- 機内用（2026-11-08 ユーザー「機内でやりたい」。算数ステップ帳の 回答_オフラインで使う仕組み_2026-11-08.md と同じ形） ----------
   offMake  … 今日の分（day）の問題・答え・絵・今の◎×を、ファイル1つ（.json）にして保存する。db は書かない
   offRead  … 入れ物ページ（rika-offline）で書き出した記録のファイルを読み、いつもの記録に足す（消さない・同じ記録は2回入れない）
   入れ物ページは画面の仕組みだけで、問題は1つも持たない。問題はこのファイルの中にだけある */
const OFF_APP = "rika-step";
const offHere = () => !!window.claude;   // 入れ物ページ（claude.ai の外）ではボタンを出さない

// 今日の分の問題・答え・絵の束をファイル名 → 本文で集める
async function offFiles(items) {
  const names = [];
  KAI_LIST.forEach(n => { const s = String(n).padStart(2, "0"); names.push("data_" + s + ".js", "keys_" + s + ".js", "figs_" + s + ".js"); });
  names.push("dan.js");
  // 絵の束は、今日の問題の絵（k/id）と答えの絵（k/a_id_N）が入っているものだけ
  const man = window.IMGMAN || {f: [], m: {}}, need = new Set();
  items.forEach(e => [e.id, e.rev].filter(Boolean).forEach(id => Object.entries(man.m).forEach(([k, i]) => {
    if (k === e.k + "/" + id || k.startsWith(e.k + "/a_" + id + "_")) need.add(i); })));
  [...need].sort((a, b) => a - b).forEach(i => names.push(man.f[i]));
  const files = {};
  for (const nm of names) {
    const r = await fetch(furl(nm));
    if (!r.ok) { if (/^figs_/.test(nm)) continue; throw new Error(nm + " を読めません（" + r.status + "）"); }
    files[nm] = await r.text();
  }
  return files;
}

async function offMake() {
  if (!day || !day.items || !day.items.length) throw new Error("今日のプリントがまだありません。先に今日のプリントを作ってね");
  const files = await offFiles(day.items);
  // 入れ物ページの localStorage に入れるもの（いつものアプリが読む名前のまま）
  const ls = {};
  KAI_LIST.forEach(n => { ls["rika-step-kai" + n] = JSON.stringify(recOf(n)); });
  ls["rika-step-settings"] = JSON.stringify(SETTINGS);
  ls["rika-step-skip"] = JSON.stringify([...SKIP]);
  ls["rika-step-dayAll"] = JSON.stringify(day);
  ls["rika-step-kai"] = String(day.items[0].k);
  ls["rika-step-mode"] = "child";
  ls["rika-step-pending"] = "{}";
  const pack = {app: OFF_APP, kind: "offline", v: 1, created: Date.now(), date: day.date, days: [day], files, ls};
  const js = JSON.stringify(pack), blob = new Blob([js], {type: "application/json"});
  const name = "理科_機内用_" + day.date + ".json", size = (js.length / 1048576).toFixed(1) + "MB";
  await capReady;
  if (downloads) {
    try { await downloads.save({filename: name, data: blob}); return "保存しました（" + day.items.length + "問・" + size + "）。入れ物ページの「ファイルを選ぶ」で読み込んでね。"; }
    catch (e) { if (e && e.code === "declined") return "保存をやめました。"; }
  }
  return "この画面ではファイルを保存できません。iPad の Safari で claude.ai を開いて、もう一度押してね。";
}

// 記録のファイルから、足す記録を集める（同じ時刻 t の記録は入れない。同じ時刻で ◎×だけちがうものは、機内で付け直したものとして置きかえる）
function offPlan(o) {
  if (!o || o.app !== OFF_APP || o.kind !== "recs" || !o.recs || typeof o.recs !== "object") throw new Error("理科の機内の記録ファイルではありません");
  const plan = [];
  for (const [n0, obj] of Object.entries(o.recs)) {
    const n = +n0; if (!KAI_LIST.includes(n) || !obj || typeof obj !== "object") continue;
    for (const [key, arr] of Object.entries(obj)) {
      if (!Array.isArray(arr)) continue;
      const next = (recOf(n)[key] || []).slice(); let add = 0, fix = 0;
      arr.forEach(x => {
        if (!x || typeof x.t !== "number" || typeof x.ok !== "boolean") return;
        const j = next.findIndex(y => y.t === x.t);
        if (j < 0) { next.push({ok: x.ok, t: x.t, by: x.by || "kid"}); add++; }
        else if (next[j].ok !== x.ok) { next[j] = Object.assign({}, next[j], {ok: x.ok, by: x.by || "hand"}); fix++; }
      });
      if (add || fix) plan.push({n, key, next: next.sort((a, b) => a.t - b.t), add, fix});
    }
  }
  return plan;
}

// file は File か、貼りつけた文字（入れ物ページの「文字で写す」）
async function offRead(file) {
  let o; try { o = JSON.parse(typeof file === "string" ? file : await file.text()); } catch (e) { throw new Error("ファイル（文字）を読めませんでした"); }
  const plan = offPlan(o);
  if (!plan.length) return "足す記録はありませんでした（もう入っています）。";
  const add = plan.reduce((a, x) => a + x.add, 0), fix = plan.reduce((a, x) => a + x.fix, 0);
  if (!confirm("機内の記録を足します。\n新しい記録 " + add + " 件" + (fix ? "・付け直し " + fix + " 件" : "") + "（小問 " + plan.length + "）。\n前からの記録は消しません。\n\nOK＝足す／キャンセル＝やめる")) return "やめました。";
  if (window.backupNow) { const d = new Date(); try { await backupNow(todayKeyS() + "_機内の前_" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0")); } catch (e) {} }
  for (const x of plan) await writeRec(x.n, x.key, x.next, "機内の記録を読み込む");
  return "機内の記録を足しました（新しい記録 " + add + " 件" + (fix ? "・付け直し " + fix + " 件" : "") + "）。";
}
window.offMake = offMake; window.offRead = offRead; window.offPlan = offPlan; window.offHere = offHere;
