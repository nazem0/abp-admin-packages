// Security logs page (port of security-logs.page.ts): every sign-in, failure, lockout, sign-out and credential change.
(function () {
  const { html, render, icon, on, api, L, can, fmt, pageUrl, params } = AbpAdmin;
  const root = document.getElementById('abp-security-logs');
  const PAGE_SIZE = 25;
  const FULL = { dateStyle: 'full', timeStyle: 'long' };
  const REFRESH = 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7';
  // The request trace lives in the audit-logging package: link only when it's installed.
  const auditUrl = can('AbpAdmin.AuditLogs') ? pageUrl('AuditLogs') : null;

  const q = params();
  const state = {
    range: '7d', userName: q.get('user') ?? '', failedOnly: q.get('failed') === '1', action: null, ip: '', page: 0, openId: null,
    counts: [], rows: [], total: 0, loading: false, error: false, tick: 0,
  };
  let seq = 0, cseq = 0;

  render(root, html`
    <div id="sl-top"></div>
    <section class="card stream">
      <div class="filters">
        <label class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input class="input" type="search" data-act="user" placeholder="${L('AbpAdmin::SecurityLogs:UserNamePlaceholder')}" aria-label="${L('AbpAdmin::SecurityLogs:FilterByUserName')}" value="${state.userName}" />
        </label>
        <input class="input ip" data-act="ip" placeholder="${L('AbpAdmin::SecurityLogs:IpAddress')}" aria-label="${L('AbpAdmin::SecurityLogs:FilterByIp')}" />
        <span id="sl-sel"></span>
      </div>
      <div id="sl-list"></div>
    </section>`);
  const topEl = root.querySelector('#sl-top');
  const selEl = root.querySelector('#sl-sel');
  const listEl = root.querySelector('#sl-list');
  const userInput = root.querySelector('[data-act=user]');
  const ipInput = root.querySelector('[data-act=ip]');

  const sum = f => state.counts.filter(x => f(x.action ?? '')).reduce((n, x) => n + (x.count ?? 0), 0);
  const totals = () => ({ all: sum(() => true), ok: sum(a => a === 'LoginSucceeded'), failed: sum(fmt.isFailure), lockouts: sum(a => a === 'LoginLockedout') });
  const pages = () => Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const filtered = () => !!(state.action || state.failedOnly || state.userName || state.ip);
  const windowOf = () => fmt.rangeWindow(state.range);

  function drawTop() {
    const t = totals();
    render(topEl, html`
      <header class="top">
        <div><h1>${L('AbpAdmin::SecurityLogs:Title')}</h1><p class="muted">${L('AbpAdmin::SecurityLogs:Subtitle')}</p></div>
        <div class="top-actions">
          <div class="seg" role="radiogroup" aria-label="${L('AbpAdmin::SecurityLogs:TimeRange')}">
            ${fmt.RANGES.map(r => html`<button type="button" role="radio" data-act="range" data-key="${r.key}" aria-checked="${state.range === r.key}">${L(r.labelKey)}</button>`)}
          </div>
          <button class="icon-btn ${state.loading ? 'spin' : ''}" type="button" data-act="refresh" aria-label="${L('AbpAdmin::Common:Refresh')}" title="${L('AbpAdmin::Common:Refresh')}">${icon(REFRESH)}</button>
        </div>
      </header>
      <div class="tiles">
        <button type="button" class="tile card" data-act="pick" data-action="" aria-pressed="${!state.action && !state.failedOnly}"><span class="muted">${L('AbpAdmin::SecurityLogs:AllEvents')}</span><strong>${t.all}</strong></button>
        <button type="button" class="tile card tone-ok" data-act="pick" data-action="LoginSucceeded" aria-pressed="${state.action === 'LoginSucceeded'}"><span class="muted">${L('AbpAdmin::SecurityLogs:SuccessfulSignIns')}</span><strong>${t.ok}</strong></button>
        <button type="button" class="tile card tone-err" data-act="pick" data-action="" data-failed="1" aria-pressed="${state.failedOnly}"><span class="muted">${L('AbpAdmin::SecurityLogs:FailedSignIns')}</span><strong>${t.failed}</strong></button>
        <button type="button" class="tile card tone-warn" data-act="pick" data-action="LoginLockedout" aria-pressed="${state.action === 'LoginLockedout'}"><span class="muted">${L('AbpAdmin::SecurityLogs:Lockouts')}</span><strong>${t.lockouts}</strong></button>
      </div>`);
  }

  function drawSel() {
    render(selEl, html`<select class="input" data-act="action" aria-label="${L('AbpAdmin::SecurityLogs:FilterByAction')}">
        <option value="">${L('AbpAdmin::SecurityLogs:AnyAction')}</option>
        ${state.counts.map(c => html`<option value="${c.action}">${fmt.describeAction(c.action).label} (${c.count})</option>`)}
      </select>
      ${filtered() ? html` <button class="link" type="button" data-act="clear">${L('AbpAdmin::SecurityLogs:ClearFilters')}</button>` : ''}`);
    selEl.querySelector('select').value = state.action ?? '';
  }

  function event(e) {
    const a = fmt.describeAction(e.action);
    const open = state.openId === e.id;
    return html`<li class="${open ? 'open' : ''}">
      <button type="button" class="ev" data-act="toggle" data-id="${e.id}" aria-expanded="${open}">
        <span class="ico tone-${a.tone}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${a.icon}" /></svg></span>
        <span class="what"><b>${a.label}</b><small>${e.userName || L('AbpAdmin::SecurityLogs:UnknownUser')}</small></span>
        <span class="client hide-sm"><span class="mono">${e.clientId || '—'}</span><small>${e.identity}</small></span>
        <span class="net hide-sm"><span class="mono">${e.clientIpAddress || '—'}</span><small>${fmt.browserName(e.browserInfo)}</small></span>
        <time title="${fmt.stamp(e.creationTime, FULL)}">${fmt.relative(e.creationTime)}</time>
      </button>
      ${open ? html`<dl class="details">
        <dt>${L('AbpAdmin::SecurityLogs:Detail:When')}</dt><dd>${fmt.stamp(e.creationTime, FULL)}</dd>
        <dt>${L('AbpAdmin::SecurityLogs:Detail:User')}</dt><dd>${e.userName || '—'} ${e.userName ? html`<button type="button" class="link" data-act="only-user" data-value="${e.userName}">${L('AbpAdmin::SecurityLogs:OnlyThisUser')}</button>` : ''}</dd>
        <dt>${L('AbpAdmin::SecurityLogs:Detail:Client')}</dt><dd class="mono">${e.clientId || '—'}</dd>
        <dt>${L('AbpAdmin::SecurityLogs:IpAddress')}</dt><dd class="mono">${e.clientIpAddress || '—'} ${e.clientIpAddress ? html`<button type="button" class="link" data-act="only-ip" data-value="${e.clientIpAddress}">${L('AbpAdmin::SecurityLogs:OnlyThisIp')}</button>` : ''}</dd>
        <dt>${L('AbpAdmin::SecurityLogs:Detail:Application')}</dt><dd>${e.applicationName || '—'} · ${e.identity}</dd>
        <dt>${L('AbpAdmin::SecurityLogs:Detail:Correlation')}</dt><dd class="mono">${e.correlationId || '—'}
          ${e.correlationId && auditUrl ? html`<a class="link" href="${auditUrl + AbpAdmin.query({ correlation: e.correlationId })}">${L('AbpAdmin::SecurityLogs:OpenTrace')}</a>` : ''}</dd>
        <dt>${L('AbpAdmin::SecurityLogs:Detail:Browser')}</dt><dd class="mono small">${e.browserInfo || '—'}</dd>
      </dl>` : ''}
    </li>`;
  }

  function drawList() {
    const rows = state.rows;
    render(listEl, html`
      ${state.error ? html`<div class="state err">${L('AbpAdmin::SecurityLogs:LoadFailed')} <button class="btn" type="button" data-act="refresh">${L('AbpAdmin::Common:Retry')}</button></div>`
      : state.loading && !rows.length ? html`<div class="skeleton rows">${[1, 2, 3, 4, 5, 6].map(() => html`<i></i>`)}</div>`
      : !rows.length ? html`<div class="state empty">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z" /></svg>
          <b>${L('AbpAdmin::SecurityLogs:NoEvents')}</b><span class="muted">${L('AbpAdmin::SecurityLogs:NoEventsHint')}</span></div>`
      : html`<ul class="events ${state.loading ? 'loading' : ''}">${rows.map(event)}</ul>`}
      ${state.total > 0 ? html`<footer class="pager"><span class="muted">${L(state.total === 1 ? 'AbpAdmin::SecurityLogs:CountOne' : 'AbpAdmin::SecurityLogs:CountMany', String(state.total))}</span>
        ${pages() > 1 ? html`<div><button class="btn" type="button" data-act="prev" ${state.page === 0 ? 'disabled' : ''}>${L('AbpAdmin::Common:Previous')}</button>
          <span class="muted">${L('AbpAdmin::SecurityLogs:PageOf', String(state.page + 1), String(pages()))}</span>
          <button class="btn" type="button" data-act="next" ${state.page + 1 >= pages() ? 'disabled' : ''}>${L('AbpAdmin::Common:Next')}</button></div>` : ''}</footer>` : ''}`);
  }

  async function loadCounts() {
    const id = ++cseq;
    try {
      const w = windowOf();
      const c = await api.get('/api/abp-admin/security-log/action-counts', { startTime: w.startTime, endTime: w.endTime });
      if (id !== cseq) return;
      state.counts = c ?? [];
    } catch { if (id !== cseq) return; state.counts = []; }
    drawTop(); drawSel();
  }

  async function loadList() {
    const id = ++seq;
    state.loading = true; state.error = false; drawTop(); drawList();
    try {
      const r = await api.get('/api/abp-admin/security-log', {
        ...windowOf(), actionName: state.action || undefined, failedOnly: state.failedOnly || undefined, userName: state.userName || undefined,
        clientIpAddress: state.ip || undefined, skipCount: state.page * PAGE_SIZE, maxResultCount: PAGE_SIZE,
      });
      if (id !== seq) return;
      state.rows = r.items ?? []; state.total = r.totalCount ?? 0;
    } catch { if (id !== seq) return; state.error = true; }
    state.loading = false; drawTop(); drawList();
  }

  const reload = () => { state.page = 0; drawSel(); loadList(); };
  function pick(action, failedOnly) { state.action = action; state.failedOnly = failedOnly; reload(); }

  on(root, 'click', '[data-act=range]', (e, b) => { state.range = b.dataset.key; state.page = 0; loadCounts(); loadList(); });
  on(root, 'click', '[data-act=refresh]', () => { loadCounts(); loadList(); });
  on(root, 'click', '[data-act=pick]', (e, b) => pick(b.dataset.action || null, b.dataset.failed === '1'));
  on(root, 'change', '[data-act=action]', (e, el) => pick(el.value || null, false));
  on(root, 'click', '[data-act=clear]', () => { state.userName = ''; state.ip = ''; userInput.value = ''; ipInput.value = ''; pick(null, false); });
  const setUser = v => { if (state.userName !== v) { state.userName = v; reload(); } };
  on(root, 'change', '[data-act=user]', (e, el) => setUser(el.value.trim()));
  root.addEventListener('search', e => { if (e.target.matches('[data-act=user]')) setUser(e.target.value.trim()); });
  on(root, 'change', '[data-act=ip]', (e, el) => { state.ip = el.value.trim(); reload(); });
  on(root, 'click', '[data-act=toggle]', (e, b) => { state.openId = state.openId === b.dataset.id ? null : b.dataset.id; drawList(); });
  on(root, 'click', '[data-act=only-user]', (e, b) => { userInput.value = b.dataset.value; setUser(b.dataset.value); });
  on(root, 'click', '[data-act=only-ip]', (e, b) => { ipInput.value = b.dataset.value; state.ip = b.dataset.value; reload(); });
  on(root, 'click', '[data-act=prev]', () => { state.page--; loadList(); });
  on(root, 'click', '[data-act=next]', () => { state.page++; loadList(); });

  drawTop(); drawSel(); drawList(); loadCounts(); loadList();
})();
