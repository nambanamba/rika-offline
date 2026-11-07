/* 理科オフラインの中身置き場（IndexedDB）。入れ物ページ・app.html・sw.js が使う
   files: ファイル名 → 本文（問題のデータ・答え・絵の束。オフライン用ファイルから入れる）
   meta:  "pack" → {created, days, ls}（2日分の問題と、読み込んだときの記録） */
var OFFDB = (function () {
  function open() {
    return new Promise(function (ok, ng) {
      var r = indexedDB.open("rika-offline", 1);
      r.onupgradeneeded = function () { var d = r.result;
        if (!d.objectStoreNames.contains("files")) d.createObjectStore("files");
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta"); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ng(r.error); };
    });
  }
  function get(store, key) {
    return open().then(function (d) { return new Promise(function (ok, ng) {
      var q = d.transaction(store).objectStore(store).get(key);
      q.onsuccess = function () { ok(q.result); }; q.onerror = function () { ng(q.error); };
    }); });
  }
  // 入れかえは1回の取引で（途中で失敗したら前の中身のまま）
  function putAll(files, meta) {
    return open().then(function (d) { return new Promise(function (ok, ng) {
      var t = d.transaction(["files", "meta"], "readwrite"), fs = t.objectStore("files");
      fs.clear(); Object.keys(files).forEach(function (k) { fs.put(files[k], k); });
      t.objectStore("meta").put(meta, "pack");
      t.oncomplete = function () { ok(); }; t.onerror = function () { ng(t.error); }; t.onabort = function () { ng(t.error); };
    }); });
  }
  return {get: get, putAll: putAll};
})();
