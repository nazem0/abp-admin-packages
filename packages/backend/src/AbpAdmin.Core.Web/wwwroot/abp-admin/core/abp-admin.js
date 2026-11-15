/*
 * ABP Admin browser runtime for the Razor Pages console (window.AbpAdmin). Pages are plain scripts that render with
 * `html` templates and call the same REST APIs as the Angular UI. No framework, no build step.
 *
 *   const { html, render, api, L, can, toast, fmt } = AbpAdmin;
 *   render(root, html`<b>${user.userName}</b>`);           // every ${…} is escaped; nest html`` / arrays freely
 *   const page = await api.get('/api/abp-admin/audit-log', { maxResultCount: 20 });
 *   await api.post('/api/identity/users', dto, { tenant: id }); // `tenant`: act inside that tenant (__tenant header)
 *   L('AbpAdmin::Users:Title'), can('AbpIdentity.Users.Create'), toast.ok(L('AbpAdmin::Users:Saved'))
 */
(function () {
  'use strict';

  const config = window.abpAdminConfig || {};
  const root = document.documentElement;

  // ---------- templates (escaping by default) ----------
  class Html { constructor(s) { this.s = s; } toString() { return this.s; } }
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  const escape = v => String(v).replace(/[&<>"'`]/g, c => ESC[c]);
  const part = v => v instanceof Html ? v.s : Array.isArray(v) ? v.map(part).join('') : v == null || v === false ? '' : escape(v);
  /** Tagged template: interpolations are escaped; html`` results and arrays of them are inserted as markup. */
  const html = (strings, ...values) => new Html(strings.reduce((out, s, i) => out + s + (i < values.length ? part(values[i]) : ''), ''));
  /** Trusted markup (e.g. a constant SVG path set). Never pass user or API data. */
  const raw = s => new Html(String(s));
  const render = (el, view) => { el.innerHTML = part(view); return el; };
  /** `d` attribute of a stroke icon: html`${icon(path)}` → <svg viewBox="0 0 24 24"><path d="…"/></svg>. */
  const icon = (d, cls = '') => html`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" /></svg>`;

  /** Delegated events: on(root, 'click', '[data-act=save]', (e, el) => …). Survives re-renders of root's content. */
  function on(el, type, selector, handler) {
    el.addEventListener(type, e => {
      const target = e.target instanceof Element ? e.target.closest(selector) : null;
      if (target && el.contains(target)) handler(e, target);
    });
  }

  // ---------- localization, permissions, user ----------
  const values = config.localization?.values ?? {};
  /** L('AbpAdmin::Key', 'a', 'b') → text with {0} {1} filled; '::Key' means the AbpAdmin resource. Unknown keys show the key. */
  function L(key, ...args) {
    const i = key.indexOf('::');
    const resource = i <= 0 ? 'AbpAdmin' : key.slice(0, i);
    const name = i < 0 ? key : key.slice(i + 2);
    const text = values[resource]?.[name] ?? name;
    return text.replace(/\{(\d+)\}/g, (m, n) => (args[n] ?? m));
  }
  const granted = config.auth?.grantedPolicies ?? {};
  /** Empty = yes; 'a || b' = any of them. */
  const can = policy => !policy || policy.split('||').some(p => granted[p.trim()]);
  const currentUser = config.currentUser ?? {};
  const culture = config.localization?.currentCulture?.name || root.lang || 'en';
  const locale = () => culture;

  // ---------- API ----------
  const antiforgery = () => document.querySelector('meta[name="abp-admin-csrf"]')?.content ?? '';
  class ApiError extends Error {
    constructor(status, body) {
      const err = body?.error;
      const validation = err?.validationErrors?.map(v => v.message).filter(Boolean).join(' ');
      super(validation || err?.message || L('AbpAdmin::Common:SomethingWentWrong'));
      this.status = status; this.body = body;
    }
  }
  /** Query string from an object: arrays repeat the key, null/undefined/'' are skipped. */
  function query(params) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v == null || v === '') continue;
      (Array.isArray(v) ? v : [v]).forEach(x => q.append(k, x instanceof Date ? x.toISOString() : String(x)));
    }
    const s = q.toString();
    return s ? `?${s}` : '';
  }
  async function request(method, url, { params, body, tenant } = {}) {
    const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers.RequestVerificationToken = antiforgery();
    if (tenant) headers.__tenant = tenant;
    const res = await fetch(url + query(params), { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }
  const api = {
    get: (url, params, opts) => request('GET', url, { ...opts, params }),
    post: (url, body, opts) => request('POST', url, { ...opts, body }),
    put: (url, body, opts) => request('PUT', url, { ...opts, body }),
    delete: (url, params, opts) => request('DELETE', url, { ...opts, params }),
    request,
  };
  /** Human message of any error (ApiError messages come localized from ABP). */
  const errorText = e => (e instanceof ApiError ? e.message : L('AbpAdmin::Common:SomethingWentWrong'));

  // ---------- toasts ----------
  const toastHost = () => document.getElementById('abp-admin-toasts');
  let toastId = 0;
  function showToast(text, tone) {
    const host = toastHost();
    if (!host) return;
    const el = document.createElement('div');
    el.className = `toast tone-${tone}`;
    el.dataset.id = String(++toastId);
    render(el, html`<span class="dot" aria-hidden="true"></span><span class="txt">${text}</span>
      <button class="icon-btn" type="button" aria-label="${L('AbpAdmin::Toast:Dismiss')}">${icon('M6 6l12 12M18 6 6 18')}</button>`);
    el.querySelector('button').addEventListener('click', () => el.remove());
    while (host.children.length > 3) host.firstElementChild.remove();
    host.append(el);
    setTimeout(() => el.remove(), tone === 'err' ? 7000 : 3500);
  }
  const toast = { ok: t => showToast(t, 'ok'), error: t => showToast(t, 'err'), info: t => showToast(t, 'info') };

  // ---------- sheets (native modal <dialog class="sheet">) ----------
  /** sheet(dialogEl, { onClose }) → { open(), close() }. Esc and backdrop clicks close it. */
  function sheet(dialog, { onClose } = {}) {
    dialog.classList.add('sheet');
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) close(); });
    function close() { if (dialog.open) dialog.close(); onClose?.(); }
    return { open: () => { if (!dialog.open) dialog.showModal(); }, close, el: dialog };
  }

  // ---------- theme ----------
  const THEME_KEY = 'abp-admin.theme';
  const theme = {
    get mode() { try { const v = localStorage.getItem(THEME_KEY); return v === 'dark' || v === 'system' ? v : 'light'; } catch { return 'light'; } },
    set(mode) {
      if (mode === 'system') root.removeAttribute('data-abp-admin-theme'); else root.setAttribute('data-abp-admin-theme', mode);
      try { localStorage.setItem(THEME_KEY, mode); } catch { /* storage blocked */ }
      document.dispatchEvent(new CustomEvent('abp-admin:theme', { detail: mode }));
    },
    cycle() { const m = theme.mode; theme.set(m === 'light' ? 'dark' : m === 'dark' ? 'system' : 'light'); },
  };

  // ---------- deep links ----------
  const params = () => new URLSearchParams(location.search);
  /** Replace query parameters without a reload (null/'' removes one). */
  function setParams(changes) {
    const p = params();
    for (const [k, v] of Object.entries(changes)) { if (v == null || v === '') p.delete(k); else p.set(k, v); }
    const s = p.toString();
    history.replaceState(null, '', location.pathname + (s ? `?${s}` : ''));
  }
  /** /AbpAdmin/{path}, or null when that page isn't installed (link from one feature to another). */
  const pageUrl = path => (config.abpAdmin?.pages ?? []).some(p => p.toLowerCase() === path.toLowerCase()) ? `/AbpAdmin/${path}` : null;

  // ---------- formatting (port of the Angular format.ts) ----------
  const setting = name => config.setting?.values?.[name];
  /** IANA zone every time shows in: Abp.Timing.TimeZone when the server clock is UTC, else the browser's. */
  const displayZone = (() => {
    const zone = setting('Abp.Timing.TimeZone');
    return config.clock?.kind === 'Utc' && zone && zone !== 'Unspecified' ? zone : undefined;
  })();
  const toMs = s => (s ? new Date(s).getTime() : 0);
  const RANGES = [
    { key: '24h', labelKey: 'AbpAdmin::Format:Range24h', days: 1 },
    { key: '7d', labelKey: 'AbpAdmin::Format:Range7d', days: 7 },
    { key: '30d', labelKey: 'AbpAdmin::Format:Range30d', days: 30 },
    { key: '90d', labelKey: 'AbpAdmin::Format:Range90d', days: 90 },
  ];
  const rangeWindow = key => {
    const end = new Date();
    const start = new Date(end.getTime() - RANGES.find(r => r.key === key).days * 86400000);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  };
  const stamp = (s, opts) => (s ? new Date(s).toLocaleString(locale(), { ...opts, timeZone: displayZone }) : '');
  const calendarDay = (day, opts) => new Date(`${day}T00:00:00Z`).toLocaleDateString(locale(), { ...opts, timeZone: 'UTC' });
  const dayKey = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: displayZone });
  const failed = log => !!log.exceptions || (log.httpStatusCode ?? 0) >= 400;
  const statusTone = (code, hasException = false) => hasException || (code ?? 0) >= 500 ? 'err' : (code ?? 0) >= 400 ? 'warn' : 'ok';
  const methodTone = m => ({ GET: 'info', DELETE: 'err', PUT: 'warn', PATCH: 'warn' })[m] ?? 'ok';
  const changeLabelKey = { 0: 'AbpAdmin::Format:Created', 1: 'AbpAdmin::Format:Updated', 2: 'AbpAdmin::Format:Deleted' };
  const changeTone = { 0: 'ok', 1: 'warn', 2: 'err' };
  const shortType = full => full?.split('.').pop() ?? '';
  const actionLabel = (service, method) => `${shortType(service).replace(/(AppService|Controller|Service)$/, '')} · ${(method ?? '').replace(/Async$/, '')}`;
  const unit = (n, u, digits) => new Intl.NumberFormat(locale(), { style: 'unit', unit: u, unitDisplay: 'short', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  function duration(ms) {
    if (!locale().startsWith('en')) return ms < 1000 ? unit(Math.round(ms), 'millisecond', 0) : unit(ms / 1000, 'second', ms < 10000 ? 2 : 1);
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
  }
  const upper = s => s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1);
  function relative(s, now = Date.now()) {
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
    const diff = (toMs(s) - now) / 1000, abs = Math.abs(diff);
    if (abs < 45) return rtf.format(0, 'second');
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86400), 'day');
  }
  function dayLabel(s) {
    const key = dayKey(toMs(s));
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
    if (key === dayKey(Date.now())) return upper(rtf.format(0, 'day'));
    if (key === dayKey(Date.now() - 86400000)) return upper(rtf.format(-1, 'day'));
    return calendarDay(key, { weekday: 'long', month: 'short', day: 'numeric' });
  }
  const clock = s => stamp(s, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function pretty(value) { if (!value) return ''; try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } }
  function flatParams(json) {
    if (!json) return [];
    let rootValue;
    try { rootValue = JSON.parse(json); } catch { return [{ path: '(raw)', value: json }]; }
    const rows = [];
    const walk = (v, path) => {
      if (v !== null && typeof v === 'object') {
        const entries = Array.isArray(v) ? v.map((x, i) => [`${path}[${i}]`, x]) : Object.entries(v).map(([k, x]) => [path ? `${path}.${k}` : k, x]);
        if (!entries.length) rows.push({ path, value: Array.isArray(v) ? '[]' : '{}' });
        entries.forEach(([p, x]) => walk(x, p));
      } else rows.push({ path, value: v == null ? null : String(v) });
    };
    walk(rootValue, '');
    return rows.filter(r => r.path);
  }
  function plainValue(value) {
    if (value == null) return null;
    try { const v = JSON.parse(value); return v == null ? null : typeof v === 'string' ? v : JSON.stringify(v); } catch { return value; }
  }
  const splitUrl = url => { const [path, q] = (url ?? '').split('?'); return { path, query: q ? `?${q}` : '' }; };
  function browserName(info) {
    if (!info) return '—';
    const m = info.match(/(Edg|OPR|Chrome|Firefox|Safari|node|curl|PostmanRuntime|python-requests|okhttp)[/ ]?([\d.]*)/i);
    if (!m) return info.slice(0, 40);
    const name = { Edg: 'Edge', OPR: 'Opera' }[m[1]] ?? m[1];
    const os = /Windows/.test(info) ? ' · Windows' : /Mac OS/.test(info) ? ' · macOS' : /Android/.test(info) ? ' · Android' : /iPhone|iPad/.test(info) ? ' · iOS' : /Linux/.test(info) ? ' · Linux' : '';
    return `${name} ${m[2].split('.')[0]}`.trim() + os;
  }

  // Security log actions: wording, tone and icon (port of security-log-actions.ts).
  const SL = {
    IN: 'M15 4h4v16h-4M10 8l4 4-4 4M14 12H4', OUT: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10', X: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6',
    LOCK: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z', KEY: 'M15 7a4 4 0 1 1-3.9 4.9L4 19v-3h3v-3h3l1.1-1.1A4 4 0 0 1 15 7z',
    EDIT: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', SHIELD: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z',
  };
  const KNOWN = {
    LoginSucceeded: ['ok', SL.IN], LoginInvalidUserName: ['err', SL.X], LoginInvalidUserNameOrPassword: ['err', SL.X], LoginFailed: ['err', SL.X],
    LoginLockedout: ['warn', SL.LOCK], LoginNotAllowed: ['err', SL.X], LoginRequiresTwoFactor: ['info', SL.SHIELD], Logout: ['info', SL.OUT],
    ChangePassword: ['accent', SL.KEY], ChangeEmail: ['accent', SL.EDIT], ChangePhoneNumber: ['accent', SL.EDIT], ChangeUserName: ['accent', SL.EDIT],
  };
  /** { label, tone, icon } for an IdentitySecurityLogActionConsts value. */
  function describeAction(action) {
    if (action && KNOWN[action]) return { label: L(`AbpAdmin::SecurityLogs:Action:${action}`), tone: KNOWN[action][0], icon: KNOWN[action][1] };
    const words = (action ?? 'Unknown').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return { label: words[0].toUpperCase() + words.slice(1), tone: action?.startsWith('Login') ? 'err' : 'accent', icon: SL.SHIELD };
  }
  const isFailure = action => !!action?.startsWith('Login') && action !== 'LoginSucceeded';

  const fmt = {
    displayZone, toMs, RANGES, rangeWindow, stamp, calendarDay, failed, statusTone, methodTone, changeLabelKey, changeTone, shortType, actionLabel,
    duration, relative, dayLabel, clock, pretty, flatParams, plainValue, splitUrl, browserName, describeAction, isFailure,
  };

  // ---------- shell: palette, theme button, language menu ----------
  function initPalette() {
    const dialog = document.getElementById('abp-admin-palette');
    if (!dialog) return;
    const input = dialog.querySelector('input');
    const list = dialog.querySelector('ul');
    const commands = (config.abpAdmin?.commands ?? []).map(c => ({ ...c, label: L(c.labelKey), hint: L(c.hintKey) }));
    commands.push({ id: 'theme', label: L('AbpAdmin::Palette:SwitchTheme'), hint: L('AbpAdmin::Palette:Appearance'), keywords: 'dark light mode',
      icon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z', run: () => theme.cycle() });
    let active = 0, results = [];
    const draw = () => {
      const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const inLabel = c => words.every(w => c.label.toLowerCase().includes(w));
      results = commands.filter(c => words.every(w => `${c.label} ${c.hint} ${c.keywords}`.toLowerCase().includes(w))).sort((a, b) => +inLabel(b) - +inLabel(a));
      active = Math.min(active, Math.max(results.length - 1, 0));
      render(list, results.length ? results.map((c, i) => html`
        <li role="option" id="cp-${i}" data-i="${i}" aria-selected="${i === active}">${icon(c.icon)}<span>${c.label}</span><small>${c.hint}</small></li>`)
        : html`<li class="none">${L('AbpAdmin::Palette:NoMatch', input.value)}</li>`);
      input.setAttribute('aria-activedescendant', `cp-${active}`);
    };
    const run = c => { dialog.close(); if (c.run) c.run(); else location.href = c.url; };
    const show = () => { input.value = ''; active = 0; draw(); dialog.showModal(); input.focus(); };
    input.addEventListener('input', () => { active = 0; draw(); });
    input.addEventListener('keydown', e => {
      const n = results.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(n, 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + n) % Math.max(n, 1); draw(); }
      else if (e.key === 'Enter' && results[active]) run(results[active]);
    });
    on(list, 'mousemove', 'li[data-i]', (e, li) => { if (+li.dataset.i !== active) { active = +li.dataset.i; draw(); } });
    on(list, 'click', 'li[data-i]', (e, li) => run(results[+li.dataset.i]));
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (dialog.open) dialog.close(); else show(); }
    });
    document.querySelectorAll('[data-abp-admin-palette]').forEach(b => b.addEventListener('click', show));
  }

  function initThemeButton() {
    const button = document.querySelector('[data-abp-admin-theme-toggle]');
    if (!button) return;
    const ICONS = {
      light: html`<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />`,
      dark: html`<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />`,
      system: html`<rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />`,
    };
    const paint = () => {
      const label = L(`AbpAdmin::Shell:Theme:${theme.mode}`);
      button.title = L('AbpAdmin::Shell:ThemeTitle', label);
      button.setAttribute('aria-label', L('AbpAdmin::Shell:ThemeAria', label));
      render(button, html`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[theme.mode]}</svg>`);
    };
    button.addEventListener('click', () => theme.cycle());
    document.addEventListener('abp-admin:theme', paint);
    paint();
  }

  document.addEventListener('DOMContentLoaded', () => { initPalette(); initThemeButton(); });

  window.AbpAdmin = {
    config, html, raw, render, icon, on, L, can, currentUser, locale, api, ApiError, errorText, query, toast, sheet, theme,
    params, setParams, pageUrl, fmt, setting,
  };
})();
