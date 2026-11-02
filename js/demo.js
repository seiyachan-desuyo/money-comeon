/* ============================================================
   来钱花 · 演示模式（不连接 Supabase，仅使用 js/data.js 演示数据）
   - 登录页「体验演示模式」写入 sessionStorage 标记后进入
   - 本脚本必须最先加载，先于 supabase.js / data.js / app.js
   - 演示模式下：不创建 Supabase 客户端、不发任何网络请求、不写云端
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'lqh_demo';
  var on = false;
  try { on = sessionStorage.getItem(KEY) === '1'; } catch (e) {}

  window.DEMO_MODE = on;
  window.isDemoMode = function () { return window.DEMO_MODE; };
  window.enterDemoMode = function () {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
    location.replace('index.html');
  };
  window.exitDemoMode = function () {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    location.replace('auth.html');
  };

  if (!on) return;

  /* 演示模式：禁用 Supabase 客户端创建，阻断一切云端请求 */
  window.SUPABASE_READY = false;
  window.sb = null;
  window.addEventListener('DOMContentLoaded', function () {
    /* 顶部提示条 */
    var bar = document.createElement('div');
    bar.className = 'demo-bar';
    bar.innerHTML =
      '<span class="demo-bar-dot"></span>' +
      '<span class="demo-bar-text">演示模式 · 数据不会保存</span>' +
      '<button class="demo-bar-btn" id="demoExitBtn">退出演示 / 注册真实账号</button>';
    document.body.prepend(bar);
    document.body.classList.add('demo-mode');
    var btn = document.getElementById('demoExitBtn');
    if (btn) btn.addEventListener('click', window.exitDemoMode);
  });
})();
