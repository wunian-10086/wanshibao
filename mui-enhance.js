/* =======================================================================
   班级综合素质评价 · MUI 交互增强层
   -----------------------------------------------------------------------
   只做界面/交互层面的增强，不动 app.js 的任何数据逻辑：
    1) TouchRipple  按钮水波纹（MUI 的点击反馈）
    2) AppBar       真实高度写入 --appbar-h，滚动时抬高阴影
    3) 登录页        输入框升级为 Material 描边输入框（标签 + 自动聚焦）
    4) 顶栏状态      “已保存/同步中”等状态文字在蓝色顶栏上清晰可读
    5) 记录明细      搜索框边打字边筛选时保持光标位置（不用重新点一下）
    6) 弹窗          打开后自动聚焦第一个输入项，方便键盘操作
   ======================================================================= */
(function () {
  'use strict';

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  /* ---------------------------------------------------------------
     1. TouchRipple：水波纹
     --------------------------------------------------------------- */
  function spawnRipple(el, ev) {
    if (!el || el.disabled || el.dataset.noRipple === '1') return;
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var size = Math.max(rect.width, rect.height) * 1.2;
    var x = (ev ? ev.clientX : rect.left + rect.width / 2) - rect.left;
    var y = (ev ? ev.clientY : rect.top + rect.height / 2) - rect.top;
    var span = document.createElement('span');
    span.className = 'mui-ripple';
    span.style.width = span.style.height = size + 'px';
    span.style.left = (x - size / 2) + 'px';
    span.style.top = (y - size / 2) + 'px';
    el.appendChild(span);
    span.addEventListener('animationend', function () { span.remove(); });
    setTimeout(function () { span.remove(); }, 900);
  }

  document.addEventListener('pointerdown', function (ev) {
    if (reduceMotion || ev.button !== 0) return;
    var el = ev.target && ev.target.closest
      ? ev.target.closest('button, .chip, label.chip')
      : null;
    if (el) spawnRipple(el, ev);
  }, true);

  /* ---------------------------------------------------------------
     2. AppBar：高度变量 + 滚动阴影
     --------------------------------------------------------------- */
  function setupAppBar() {
    var header = document.querySelector('header');
    if (!header) return;
    var root = document.documentElement;
    function syncHeight() {
      var h = Math.round(header.getBoundingClientRect().height);
      if (h > 0) root.style.setProperty('--appbar-h', h + 'px');
    }
    syncHeight();
    if (window.ResizeObserver) new ResizeObserver(syncHeight).observe(header);
    window.addEventListener('resize', syncHeight);
    window.addEventListener('load', syncHeight);
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 4); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------------------------------------------------------------
     3. 顶栏同步状态：蓝底上的可读配色
     --------------------------------------------------------------- */
  var BAD_HINT = /#c62828|rgb\(198,\s*40,\s*40\)/i;
  function paintSync(errorState) {
    var el = document.getElementById('syncState');
    if (!el) return;
    var bad = typeof errorState === 'boolean' ? errorState : BAD_HINT.test(el.style.color || '');
    el.style.color = bad ? '#ffe0e0' : 'rgba(255,255,255,.88)';
    el.style.fontWeight = bad ? '600' : '400';
  }
  if (typeof window.setSync === 'function') {
    var rawSetSync = window.setSync;
    window.setSync = function (text, bad) {
      rawSetSync.apply(this, arguments);
      paintSync(bad);
    };
  }

  /* ---------------------------------------------------------------
     4. 登录页：Material 输入框（标签 + 描边）
     --------------------------------------------------------------- */
  var LOGIN_IDS = ['lgUser', 'lgPass', 'lgName', 'lgInvite'];
  function upgradeLoginFields() {
    LOGIN_IDS.forEach(function (id) {
      var input = document.getElementById(id);
      if (!input || (input.parentNode && input.parentNode.classList.contains('field'))) return;
      var text = input.getAttribute('placeholder') || '';
      var wrap = document.createElement('div');
      wrap.className = 'field';
      wrap.setAttribute('data-login-field', id);
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      if (text) {
        var label = document.createElement('label');
        label.setAttribute('for', id);
        label.textContent = text;
        wrap.insertBefore(label, input);
        input.removeAttribute('placeholder');
        if (!input.getAttribute('aria-label')) input.setAttribute('aria-label', text);
      }
    });
    syncLoginVisibility();
  }
  function syncLoginVisibility() {
    var wraps = document.querySelectorAll('#login [data-login-field]');
    Array.prototype.forEach.call(wraps, function (w) {
      var input = w.querySelector('input');
      if (input) w.hidden = !!input.hidden;
    });
  }
  if (typeof window.setLoginMode === 'function') {
    var rawSetLoginMode = window.setLoginMode;
    window.setLoginMode = function () {
      var out = rawSetLoginMode.apply(this, arguments);
      syncLoginVisibility();
      return out;
    };
  }
  if (typeof window.showLogin === 'function') {
    var rawShowLogin = window.showLogin;
    window.showLogin = function () {
      var out = rawShowLogin.apply(this, arguments);
      upgradeLoginFields();
      syncLoginVisibility();
      return out;
    };
  }

  /* ---------------------------------------------------------------
     5. 记录明细：边打字边筛选时保持光标
     --------------------------------------------------------------- */
  var KEEP_FOCUS = /^(q|from|to|typeFilter|personSearch)$/;
  function keepFocus(fnName) {
    var raw = window[fnName];
    if (typeof raw !== 'function') return;
    window[fnName] = function () {
      var active = document.activeElement;
      var id = active && active.id && KEEP_FOCUS.test(active.id) ? active.id : null;
      var caret = null;
      if (id) {
        try { caret = [active.selectionStart, active.selectionEnd]; } catch (e) { caret = null; }
      }
      var out = raw.apply(this, arguments);
      if (id) {
        var next = document.getElementById(id);
        if (next && next !== active) {
          try {
            next.focus({ preventScroll: true });
            if (caret && caret[0] !== null && next.setSelectionRange) next.setSelectionRange(caret[0], caret[1]);
          } catch (e) {}
        }
      }
      return out;
    };
  }

  /* ---------------------------------------------------------------
     6. 弹窗：打开后聚焦第一个输入项，键盘用户不用再点一下
     --------------------------------------------------------------- */
  function focusDialog() {
    var modal = document.getElementById('modal');
    if (!modal) return;
    var field = modal.querySelector('.mbody input:not([type=hidden]):not([disabled]), .mbody select:not([disabled]), .mbody textarea:not([disabled])');
    if (!field) return;
    setTimeout(function () {
      try {
        field.focus({ preventScroll: true });
        /* 光标放到末尾，避免一进来就把原来的内容全选中、误覆盖 */
        if (field.setSelectionRange && typeof field.value === 'string') {
          var end = field.value.length;
          field.setSelectionRange(end, end);
        }
      } catch (e) {}
    }, 30);
  }
  if (typeof window.modal === 'function') {
    var rawModal = window.modal;
    window.modal = function () {
      var out = rawModal.apply(this, arguments);
      focusDialog();
      return out;
    };
  }

  /* ---------------------------------------------------------------
     7. 二次确认弹窗：确定键标成危险色
     --------------------------------------------------------------- */
  if (typeof window.dangerConfirm === 'function') {
    var rawDangerConfirm = window.dangerConfirm;
    window.dangerConfirm = function () {
      var out = rawDangerConfirm.apply(this, arguments);
      var ok = document.getElementById('ok');
      if (ok) ok.classList.add('mui-danger');
      return out;
    };
  }

  /* ---------------------------------------------------------------
     启动
     --------------------------------------------------------------- */
  function init() {
    upgradeLoginFields();
    paintSync();
    setupAppBar();
    keepFocus('records');
    var toast = document.getElementById('toast');
    if (toast) {
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
    }
    // 页面因为筛选/切页重绘后，顶栏高度可能变化
    if (typeof window.render === 'function') {
      var rawRender = window.render;
      window.render = function () {
        var out = rawRender.apply(this, arguments);
        paintSync();
        try { document.documentElement.style.setProperty('--appbar-h', Math.round(document.querySelector('header').getBoundingClientRect().height) + 'px'); } catch (e) {}
        return out;
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
