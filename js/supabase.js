/* ============================================================
   来钱花 · Supabase 客户端初始化（supabase-js UMD 由 index/auth 页通过 CDN 引入）
   ============================================================ */
(function () {
  'use strict';
  var SUPA_URL = 'https://rnaxhvsyyixtburltvjt.supabase.co';
  // publishable key：只具备 anon 权限，可安全暴露在前端
  var SUPA_KEY = 'sb_publishable_0bggIv719Mx_nC89k7Qv-w_u1F_md7o';

  window.SUPABASE_READY = !!(window.supabase && window.supabase.createClient);
  window.sb = window.SUPABASE_READY
    ? window.supabase.createClient(SUPA_URL, SUPA_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;
})();
