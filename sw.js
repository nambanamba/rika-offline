/* 理科オフラインの service worker
   - 画面のファイル（SHELL）は cache に入れて、ネットより先に cache を使う
   - 問題のファイル（data_・keys_・figs_・dan.js・ic/）は、iPad の中（IndexedDB）から返す。無いものは空のスクリプト
   SHELL と V は make_offline.py が書く
   ★消す cache は rika-off- で始まるものだけ（nambanamba.github.io のほかのアプリと Cache Storage が同じ。2026-11-08 相互チェック） */
importScripts("offdb.js");
var V = "rika-off-a25b57dc66";
var SHELL = ["./", "app.html", "dash.js", "figlib.js", "icon.png", "icon512.png", "imgman.js", "index.html", "jspdf.umd.min.js", "kais.js", "manifest.json", "model.js", "offbar.js", "offdb.js", "offline.js", "store.js", "today.js"];
var CONTENT = /^(?:(?:data_|keys_|figs_)\d+\.js|dan\.js|ic\/[^\/]+\.js)$/;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf("rika-off-") === 0 && k !== V; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  var name = decodeURIComponent(u.pathname.slice(new URL(self.registration.scope).pathname.length));
  if (CONTENT.test(name)) {
    e.respondWith(OFFDB.get("files", name).catch(function () { return ""; }).then(function (t) {
      return new Response(t || "", {headers: {"Content-Type": "text/javascript; charset=utf-8"}}); }));
    return;
  }
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(function (r) {
    return r || fetch(e.request).catch(function () { return caches.match(name === "" ? "index.html" : name, {ignoreSearch: true}); }); }));
});
