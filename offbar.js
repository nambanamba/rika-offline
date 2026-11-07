/* app.html（オフライン版の理科計算ステップ帳）の上に出す小さな帯。メニュー（index.html）へもどる */
(function () {
  var d = null;
  try { d = JSON.parse(localStorage.getItem("rika-step-dayAll") || "null"); } catch (e) {}
  var bar = document.createElement("div");
  bar.style.cssText = "position:sticky;top:0;z-index:50;background:#2f6b3a;color:#fff;font:700 14px/1.4 sans-serif;padding:6px 12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap";
  bar.innerHTML = '<a href="index.html" style="color:#fff">◀ オフラインのメニュー</a><span>オフライン版' + (d && d.date ? "（" + d.date.slice(5).replace("-", "/") + " の問題）" : "") + "</span>";
  document.body.prepend(bar);
})();
