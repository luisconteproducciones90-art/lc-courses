/*! LC-AI BUSINESS widget — insertar con:
    <script src="https://TU-SUBDOMINIO/lc-ai-widget.js" data-company="lcb_xxxxxxxxxxxxxxxxxxxxxxxx" async></script> */
(function () {
  'use strict';
  var script = document.currentScript || (function () { var s = document.querySelectorAll('script[data-company]'); return s[s.length - 1]; })();
  if (!script || !script.dataset.company) return;
  var KEY = script.dataset.company;
  var BASE = new URL(script.src, location.href).origin;
  var API = BASE + '/api/widget/' + encodeURIComponent(KEY);
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin storage */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
  };
  var VK = 'lcai_v_' + KEY; var CK = 'lcai_c_' + KEY;
  var visitor = store.get(VK);
  if (!visitor) { visitor = (window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()) + String(Date.now())).replace(/[^A-Za-z0-9]/g, '').padEnd(24, 'x').slice(0, 40); store.set(VK, visitor); }
  var convId = store.get(CK);
  var seen = {}; var lastTs = null; var poll = null; var open = false; var busy = false;

  function api(path, opts) {
    return fetch(API + path, opts).then(function (r) { return r.json().then(function (j) { if (!r.ok) { var e = new Error((j && j.error && j.error.message) || 'Error'); e.status = r.status; throw e; } return j; }); });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function contrast(hex) { var n = parseInt(String(hex).replace('#', ''), 16) || 0; var l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)); return l > 150 ? '#0b0d14' : '#ffffff'; }

  api('/config').then(function (cfg) { mount(cfg); }).catch(function () { /* widget no disponible: no se muestra nada */ });

  function mount(cfg) {
    var primary = /^#[0-9a-fA-F]{6}$/.test(cfg.theme.primary) ? cfg.theme.primary : '#39ff88';
    var secondary = /^#[0-9a-fA-F]{6}$/.test(cfg.theme.secondary) ? cfg.theme.secondary : '#8b5cf6';
    var ink = contrast(primary);
    var host = el('div'); host.setAttribute('data-lc-ai-widget', '');
    var root = host.attachShadow({ mode: 'open' });
    var side = cfg.position === 'left' ? 'left' : 'right';
    var css = ':host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
      + '.btn{position:fixed;bottom:20px;' + side + ':20px;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,' + primary + ',' + secondary + ');color:' + ink + ';box-shadow:0 10px 30px rgba(0,0,0,.35);display:grid;place-items:center;z-index:2147483646;transition:transform .15s}'
      + '.btn:hover{transform:scale(1.06)}.btn svg{width:26px;height:26px}'
      + '.panel{position:fixed;bottom:90px;' + side + ':20px;width:370px;max-width:calc(100vw - 24px);height:min(560px,calc(100vh - 110px));background:#0f1220;color:#eef1fb;border:1px solid #262c47;border-radius:18px;display:none;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.5);z-index:2147483647}'
      + '.panel.on{display:flex}'
      + '.head{display:flex;align-items:center;gap:10px;padding:14px;background:linear-gradient(135deg,' + primary + ',' + secondary + ');color:' + ink + '}'
      + '.ava{width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.25);display:grid;place-items:center;font-size:20px;overflow:hidden;flex:none}.ava img{width:100%;height:100%;object-fit:cover}'
      + '.head b{display:block;font-size:15px}.head small{opacity:.85;font-size:12px}.x{margin-left:auto;background:none;border:0;color:inherit;font-size:22px;cursor:pointer;line-height:1;padding:4px 8px}'
      + '.body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px;background:#080a13}'
      + '.m{max-width:84%;padding:9px 13px;border-radius:14px;font-size:14.5px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}'
      + '.m.customer{align-self:flex-end;background:' + primary + ';color:' + ink + ';border-bottom-right-radius:4px}'
      + '.m.ai,.m.human{align-self:flex-start;background:#171b30;border:1px solid #262c47;border-bottom-left-radius:4px}.m.human{border-color:' + primary + '}'
      + '.m.system{align-self:center;color:#8b93b3;font-size:12.5px;text-align:center}.who{display:block;font-size:11px;opacity:.65;margin-bottom:2px}'
      + '.typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:#171b30;border-radius:14px}.typing i{width:6px;height:6px;border-radius:50%;background:#8b93b3;animation:b 1.2s infinite}.typing i:nth-child(2){animation-delay:.2s}.typing i:nth-child(3){animation-delay:.4s}'
      + '@keyframes b{0%,60%,100%{opacity:.25}30%{opacity:1}}'
      + 'form{display:flex;gap:8px;padding:10px;border-top:1px solid #262c47;background:#0f1220}input{flex:1;min-width:0;background:#0a0c16;color:#eef1fb;border:1px solid #2a3150;border-radius:10px;padding:10px 12px;font-size:15px;outline:none}input:focus{border-color:' + primary + '}'
      + 'form button{border:0;border-radius:10px;padding:0 16px;font-weight:700;cursor:pointer;background:' + primary + ';color:' + ink + '}form button:disabled{opacity:.5}'
      + '.foot{text-align:center;font-size:11px;color:#5d6585;padding:0 0 8px;background:#0f1220}'
      + '@media (max-width:480px){.panel{inset:0;width:100%;max-width:none;height:100%;border-radius:0;bottom:0}.btn{bottom:16px}}'
      + '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}';
    // Hoja de estilos construible: funciona aunque el sitio anfitrión tenga una CSP estricta (sin 'unsafe-inline')
    var sheet = null;
    try { if (root.adoptedStyleSheets !== undefined && window.CSSStyleSheet && CSSStyleSheet.prototype.replaceSync) { sheet = new CSSStyleSheet(); sheet.replaceSync(css); root.adoptedStyleSheets = [sheet]; } } catch (e) { sheet = null; }
    var btn = el('button', 'btn'); btn.setAttribute('aria-label', 'Abrir chat');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 01-11.6 7.1L3 21l1.9-5.4A8 8 0 1121 12z"/></svg>'; // SVG estático propio (sin datos externos)
    var panel = el('div', 'panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Chat con ' + cfg.agent.name);
    var ava = el('div', 'ava');
    if (/^https:\/\//.test(cfg.agent.avatar || '')) { var im = el('img'); im.src = cfg.agent.avatar; im.alt = ''; ava.appendChild(im); } else ava.textContent = cfg.agent.avatar || '🤖';
    var title = el('div'); title.appendChild(el('b', null, cfg.agent.name)); title.appendChild(el('small', null, '● En línea · ' + cfg.company));
    var close = el('button', 'x', '×'); close.setAttribute('aria-label', 'Cerrar');
    var head = el('div', 'head'); head.appendChild(ava); head.appendChild(title); head.appendChild(close);
    var body = el('div', 'body'); body.setAttribute('aria-live', 'polite');
    var input = el('input'); input.placeholder = 'Escribí tu mensaje…'; input.maxLength = 1000; input.setAttribute('aria-label', 'Mensaje'); input.autocomplete = 'off';
    var send = el('button', null, 'Enviar'); send.type = 'submit';
    var form = el('form'); form.appendChild(input); form.appendChild(send);
    panel.appendChild(head); panel.appendChild(body); panel.appendChild(form); panel.appendChild(el('div', 'foot', 'Con tecnología LC-AI BUSINESS'));
    if (!sheet) root.appendChild(el('style', null, css)); root.appendChild(btn); root.appendChild(panel);
    document.body.appendChild(host);

    function add(role, text, id, who) {
      if (id) { if (seen[id]) return; seen[id] = 1; }
      var m = el('div', 'm ' + role);
      if (who) m.appendChild(el('span', 'who', who));
      m.appendChild(document.createTextNode(text));
      body.appendChild(m); body.scrollTop = body.scrollHeight; return m;
    }
    function welcome() { add('ai', cfg.agent.welcome); }
    function load() {
      body.textContent = ''; seen = {}; lastTs = null;
      if (!convId) { welcome(); return Promise.resolve(); }
      return api('/messages?visitorId=' + encodeURIComponent(visitor) + '&conversationId=' + encodeURIComponent(convId)).then(function (r) {
        welcome(); r.messages.forEach(render);
      }).catch(function (e) { if (e.status === 404) { convId = null; store.del(CK); body.textContent = ''; welcome(); } });
    }
    function render(m) { lastTs = m.created_at; add(m.role === 'human' ? 'human' : m.role, m.content, m.id, m.role === 'human' ? 'Equipo' : null); }
    function pollNow() {
      if (!convId || !open) return;
      var q = '/messages?visitorId=' + encodeURIComponent(visitor) + '&conversationId=' + encodeURIComponent(convId) + (lastTs ? '&after=' + encodeURIComponent(lastTs) : '');
      api(q).then(function (r) { r.messages.forEach(function (m) { if (m.role !== 'customer') render(m); else lastTs = m.created_at; }); }).catch(function () { /* reintenta */ });
    }
    function toggle(on) {
      open = on; panel.classList.toggle('on', on); btn.style.display = on && window.innerWidth <= 480 ? 'none' : 'grid';
      if (on) { load().then(function () { input.focus(); }); clearInterval(poll); poll = setInterval(pollNow, 4000); } else clearInterval(poll);
    }
    btn.addEventListener('click', function () { toggle(!open); });
    close.addEventListener('click', function () { toggle(false); });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = input.value.trim(); if (!text || busy) return;
      busy = true; send.disabled = true; input.value = '';
      add('customer', text);
      var typing = el('div', 'typing'); typing.setAttribute('aria-label', 'Escribiendo'); typing.appendChild(el('i')); typing.appendChild(el('i')); typing.appendChild(el('i')); body.appendChild(typing); body.scrollTop = body.scrollHeight;
      api('/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visitorId: visitor, conversationId: convId, message: text }) }).then(function (r) {
        typing.remove(); convId = r.conversationId; store.set(CK, convId);
        if (r.reply) add('ai', r.reply); else if (r.mode === 'human') add('system', 'Una persona del equipo continuará esta conversación.');
        (r.extra || []).forEach(function (t) { add('ai', t); });
        lastTs = new Date().toISOString();
      }).catch(function (err) { typing.remove(); add('system', err.status === 429 ? 'Estás enviando mensajes muy rápido. Esperá un momento.' : 'No pudimos enviar tu mensaje. Probá de nuevo.'); })
        .then(function () { busy = false; send.disabled = false; input.focus(); });
    });
  }
})();
