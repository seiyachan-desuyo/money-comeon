/* ============================================================
   来钱花 · 登录 / 注册页逻辑（Supabase 邮箱密码认证）
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  /* CDN 加载失败兜底 */
  if (!window.SUPABASE_READY || !window.sb) {
    document.addEventListener('DOMContentLoaded', function () {
      var msg = $('#authMsg');
      msg.textContent = '登录组件加载失败，请检查网络后刷新页面';
      msg.className = 'auth-msg error show';
      $('#auSubmit').disabled = true;
    });
    return;
  }

  var mode = 'login';
  var submitting = false;

  document.addEventListener('DOMContentLoaded', function () {
    /* 已登录直接进主应用 */
    window.sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) location.replace('index.html');
    });

    var seg = $('#authSeg');
    var bar = $('#authSegBar');
    var form = $('#authForm');
    var msg = $('#authMsg');
    var submit = $('#auSubmit');
    var tip = $('#authTip');

    function setMode(m) {
      mode = m;
      Array.prototype.forEach.call(seg.querySelectorAll('.seg'), function (s) {
        s.classList.toggle('on', s.dataset.mode === m);
      });
      bar.style.left = m === 'login' ? '0' : '50%';
      submit.textContent = m === 'login' ? '登录' : '注册并登录';
      tip.innerHTML = m === 'login'
        ? '登录即表示数据将保存在你自己的账号下，仅本人可见'
        : '注册后需到邮箱点击确认链接完成激活（密码至少 6 位）';
      $('#auPassword').setAttribute('autocomplete', m === 'login' ? 'current-password' : 'new-password');
      form.classList.toggle('register', m === 'register');
      hideMsg();
    }

    function showMsg(text, isError) {
      msg.textContent = text;
      msg.className = 'auth-msg ' + (isError ? 'error' : 'ok') + ' show';
    }
    function hideMsg() {
      msg.textContent = '';
      msg.className = 'auth-msg';
    }

    seg.addEventListener('click', function (e) {
      var s = e.target.closest('.seg');
      if (s) setMode(s.dataset.mode);
    });

    function friendlyError(err) {
      var m = (err && err.message) || String(err);
      if (/Invalid login credentials/.test(m)) return '邮箱或密码不正确，请重试';
      if (/User already registered/.test(m)) return '该邮箱已注册，请直接登录';
      if (/Email not confirmed/.test(m)) return '邮箱尚未确认，请先点击邮件中的确认链接';
      if (/Password should be at least/.test(m)) return '密码至少需要 6 位';
      if (/rate limit/i.test(m)) return '操作太频繁，请稍后再试';
      if (/Unable to validate email address/.test(m)) return '邮箱格式不正确';
      return m;
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (submitting) return;
      var email = $('#auEmail').value.trim();
      var password = $('#auPassword').value;
      var shopName = $('#auShop').value.trim();
      if (!email || !password) { showMsg('请填写邮箱和密码', true); return; }

      submitting = true;
      submit.disabled = true;
      submit.textContent = mode === 'login' ? '登录中…' : '提交中…';
      hideMsg();

      try {
        if (mode === 'login') {
          var r = await window.sb.auth.signInWithPassword({ email: email, password: password });
          if (r.error) throw r.error;
          location.replace('index.html');
          return;
        }

        var opts = {};
        if (shopName) opts.data = { shop_name: shopName };
        var reg = await window.sb.auth.signUp({
          email: email,
          password: password,
          options: {
            data: opts.data || {},
            emailRedirectTo: new URL('index.html', location.href).href
          }
        });
        if (reg.error) throw reg.error;

        if (reg.data.session) {
          /* 项目关闭了邮箱确认时会直接带会话返回 */
          location.replace('index.html');
          return;
        }
        /* 需要邮箱确认：切到待确认面板 */
        $('#adEmail').textContent = email;
        form.hidden = true;
        seg.hidden = true;
        $('#authDone').hidden = false;
        if (shopName) {
          try { localStorage.setItem('pending_shop_name', shopName); } catch (_) {}
        }
      } catch (err) {
        showMsg(friendlyError(err), true);
      } finally {
        submitting = false;
        submit.disabled = false;
        submit.textContent = mode === 'login' ? '登录' : '注册并登录';
      }
    });

    $('#adBack').addEventListener('click', function () {
      $('#authDone').hidden = true;
      form.hidden = false;
      seg.hidden = false;
      setMode('login');
    });

    $('#adResend').addEventListener('click', async function () {
      var email = $('#adEmail').textContent;
      try {
        var r = await window.sb.auth.resend({
          type: 'signup',
          email: email,
          options: { emailRedirectTo: new URL('index.html', location.href).href }
        });
        if (r.error) throw r.error;
        showMsg('确认邮件已重新发送', false);
      } catch (err) {
        showMsg(friendlyError(err), true);
      }
    });

    setMode('login');
  });
})();
