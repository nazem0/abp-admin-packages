// Audit logs page: statistics dashboard (range picker, traffic chart, status/method breakdowns, endpoint lists), request list, request detail sheet.
(function () {
  const { html, raw, render, on, api, L, fmt, errorText, params, setParams } = AbpAdmin;
  const root = document.getElementById('abp-audit-logs');
  const PAGE_SIZE = 30;
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const SEARCH = 'M20 20l-3.5-3.5';
  const deepLink = params().get('correlation') || '';

  const state = {
    range: '7d', win: fmt.rangeWindow('7d'),
    url: '', user: '', correlation: deepLink, method: '', status: null, outcome: 'all', minDuration: null, page: 0,
    stats: null, statsError: false, statsLoading: false,
    logs: null, logsError: false, logsLoading: false,
    opened: false,
  };

  // ---------- statistics (port of audit-stats.component) ----------
  const W = 720, H = 190, PAD_L = 34, PAD_R = 40, PAD_T = 12, PAD_B = 26;
  const nf = new Intl.NumberFormat(AbpAdmin.locale());
  const nf1 = new Intl.NumberFormat(AbpAdmin.locale(), { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const tone = key => (key === '—' ? 'info' : fmt.statusTone(+key));
  const SHORT_DAY = { month: 'short', day: 'numeric' };
  const LONG_DAY = { weekday: 'short', month: 'short', day: 'numeric' };

  function niceMax(v) {
    const pow = 10 ** Math.floor(Math.log10(v));
    return [1, 2, 2.5, 5, 10].map(m => m * pow).find(n => n >= v) ?? v;
  }

  function statsView(s) {
    const days = s.days;
    const maxReq = niceMax(Math.max(1, ...days.map(d => d.requests)));
    const maxAvg = Math.max(1, ...days.map(d => d.averageDuration));
    const y = v => H - PAD_B - (v / maxReq) * (H - PAD_T - PAD_B);
    const slot = (W - PAD_L - PAD_R) / Math.max(1, days.length);
    const errorRate = s.totalRequests ? (s.failedRequests / s.totalRequests) * 100 : 0;
    const yTicks = [0, maxReq / 2, maxReq].map(v => ({ v: Math.round(v), y: y(v) }));
    const w = Math.max(3, Math.min(28, slot * 0.62));
    const every = Math.ceil(days.length / 10);
    const bars = days.map((d, i) => {
      // One bar per day: full height = all requests, the failed share sits at its base.
      const x = PAD_L + slot * i + (slot - w) / 2, base = y(0);
      const hOk = base - y(d.requests), hErr = base - y(d.failed);
      return { i, x, w, gap: slot - w, yOk: base - hOk, hOk, yErr: base - hErr, hErr, label: i % every === 0 ? fmt.calendarDay(d.date, SHORT_DAY) : '' };
    });
    // Days without traffic have no duration, so they break the line instead of dipping to 0.
    const points = days.map((d, i) => d.requests === 0 ? null : { i, x: PAD_L + slot * i + slot / 2, y: H - PAD_B - (d.averageDuration / maxAvg) * (H - PAD_T - PAD_B) });
    let line = '', prev = false;
    for (const p of points) { if (p) line += `${prev ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `; prev = !!p; }
    const maxSpark = Math.max(1, ...days.map(d => d.requests));
    const step = 100 / Math.max(1, days.length - 1);
    const spark = days.map((d, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(26 - (d.requests / maxSpark) * 24).toFixed(1)}`).join(' ');

    const maxCount = Math.max(1, ...s.topEndpoints.map(e => e.count));
    const maxDur = Math.max(1, ...s.slowestEndpoints.map(e => e.averageDuration));
    const failedText = n => L('AbpAdmin::AuditLogs:Stats:FailedCount', String(n));
    const lists = [
      { title: L('AbpAdmin::AuditLogs:Stats:Busiest'), hint: L('AbpAdmin::AuditLogs:Stats:ByRequests'), items: s.topEndpoints, max: maxCount, maxCount,
        metric: e => e.count, value: e => (e.failed ? `${e.count} · ${failedText(e.failed)}` : `${e.count}`) },
      { title: L('AbpAdmin::AuditLogs:Stats:Slowest'), hint: L('AbpAdmin::AuditLogs:Stats:ByAvgDuration'), items: s.slowestEndpoints, max: maxDur,
        maxCount: Math.max(1, ...s.slowestEndpoints.map(e => e.count)), metric: e => e.averageDuration, value: e => fmt.duration(e.averageDuration) },
    ];

    return html`
      <section class="kpis" aria-label="${L('AbpAdmin::AuditLogs:Stats:KeyFigures')}">
        <div class="kpi card">
          <span class="label">${L('AbpAdmin::AuditLogs:Stats:Requests')}</span>
          <strong>${nf.format(s.totalRequests)}</strong>
          <svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d="${spark}" /></svg>
        </div>
        <div class="kpi card ${errorRate > 5 ? 'tone-err' : 'tone-ok'}">
          <span class="label">${L('AbpAdmin::AuditLogs:Stats:ErrorRate')}</span>
          <strong>${nf1.format(errorRate)}<small>%</small></strong>
          <span class="sub">${failedText(s.failedRequests)}</span>
        </div>
        <div class="kpi card">
          <span class="label">${L('AbpAdmin::AuditLogs:Stats:AvgDuration')}</span>
          <strong>${fmt.duration(s.averageDuration)}</strong>
          <span class="sub">${L('AbpAdmin::AuditLogs:Stats:Max', fmt.duration(s.maxDuration))}</span>
        </div>
        <div class="kpi card">
          <span class="label">${L('AbpAdmin::AuditLogs:Stats:ActiveUsers')}</span>
          <strong>${s.uniqueUsers}</strong>
          <span class="sub">${L('AbpAdmin::AuditLogs:Stats:MostActive', s.topUsers[0]?.key ?? '—')}</span>
        </div>
        <div class="kpi card">
          <span class="label">${L('AbpAdmin::AuditLogs:Stats:EntityChanges')}</span>
          <strong>${nf.format(s.entityChanges)}</strong>
          <span class="sub">${L('AbpAdmin::AuditLogs:Stats:RowsWritten')}</span>
        </div>
      </section>

      <section class="grid">
        <div class="card panel chart">
          <header>
            <h3>${L('AbpAdmin::AuditLogs:Stats:Traffic')}</h3>
            <div class="legend">
              <span><i class="sw ok"></i>${L('AbpAdmin::AuditLogs:Stats:Succeeded')}</span>
              <span><i class="sw err"></i>${L('AbpAdmin::AuditLogs:Stats:Failed')}</span>
              <span><i class="sw line"></i>${L('AbpAdmin::AuditLogs:Stats:AvgDuration')}</span>
            </div>
          </header>
          <div class="readout" aria-live="polite"><span class="muted">${L('AbpAdmin::AuditLogs:Stats:HoverHint')}</span></div>
          <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${L('AbpAdmin::AuditLogs:Stats:ChartLabel')}">
            ${yTicks.map(t => html`<line class="gridline" x1="${PAD_L}" x2="${W - PAD_R}" y1="${t.y}" y2="${t.y}" />
              <text class="axis" x="${PAD_L - 8}" y="${t.y + 4}" text-anchor="end">${t.v}</text>`)}
            ${bars.map(b => html`<g class="day" data-i="${b.i}">
              <rect class="hit" x="${b.x - b.gap / 2}" y="${PAD_T}" width="${b.w + b.gap}" height="${H - PAD_T - PAD_B}" />
              <rect class="ok" x="${b.x}" y="${b.yOk}" width="${b.w}" height="${b.hOk}" rx="3" />
              <rect class="err" x="${b.x}" y="${b.yErr}" width="${b.w}" height="${b.hErr}" rx="3" />
              ${b.label ? html`<text class="axis" x="${b.x + b.w / 2}" y="${H - 8}" text-anchor="middle">${b.label}</text>` : ''}
            </g>`)}
            <path class="line" d="${line}" />
            ${points.filter(Boolean).map(p => html`<circle class="pt" data-i="${p.i}" cx="${p.x}" cy="${p.y}" r="3.5" />`)}
            <text class="axis" x="${W - PAD_R + 6}" y="${PAD_T + 4}">${fmt.duration(maxAvg)}</text>
          </svg>
        </div>

        <div class="card panel">
          <header><h3>${L('AbpAdmin::AuditLogs:Stats:StatusCodes')}</h3></header>
          <div class="stack" role="img" aria-label="${L('AbpAdmin::AuditLogs:Stats:StatusDistribution')}">
            ${s.statusCodes.map(c => html`<span class="tone-${tone(c.key)}" style="flex-grow:${c.count}" title="${c.key}: ${c.count}"></span>`)}
          </div>
          <ul class="codes">
            ${s.statusCodes.map(c => html`<li>
              <button class="pill tone-${tone(c.key)}" type="button" data-pick-status="${c.key}" ${c.key === '—' ? raw('disabled') : ''}>${c.key}</button>
              <span class="bar"><i class="tone-${tone(c.key)}" style="width:${(c.count / s.totalRequests) * 100}%"></i></span>
              <b>${c.count}</b></li>`)}
          </ul>
          <header class="sub-h"><h3>${L('AbpAdmin::AuditLogs:Stats:Methods')}</h3></header>
          <div class="methods">
            ${s.httpMethods.map(m => html`<button class="pill tone-${fmt.methodTone(m.key)}" type="button" data-pick-method="${m.key}"><span class="method">${m.key}</span> ${m.count}</button>`)}
          </div>
        </div>
      </section>

      <section class="grid two">
        ${lists.map(list => html`<div class="card panel">
          <header><h3>${list.title}</h3><span class="muted">${list.hint}</span></header>
          <ol class="endpoints">
            ${list.items.length ? list.items.map(e => html`<li>
              <button type="button" data-pick-url="${e.url ?? ''}" data-pick-method="${e.httpMethod ?? ''}" title="${e.httpMethod} ${e.url}">
                <span class="method tone-${fmt.methodTone(e.httpMethod)}">${e.httpMethod}</span>
                <span class="path mono">${e.url}</span>
                <span class="meter" aria-hidden="true"><i style="width:${list.metric(e) / list.max * 100}%"></i>${e.failed ? html`<i class="f" style="width:${e.failed / list.maxCount * 100}%"></i>` : ''}</span>
                <span class="val">${list.value(e)}</span>
              </button></li>`) : html`<li class="muted empty">${L('AbpAdmin::AuditLogs:Stats:NoTraffic')}</li>`}
          </ol>
        </div>`)}
      </section>`;
  }

  /** Chart hover is plain DOM work: re-rendering the SVG under the pointer would make it flicker. */
  function hoverDay(i) {
    const days = state.stats.days;
    const el = root.querySelector('.readout');
    if (!el) return;
    const d = i == null ? null : days[i];
    render(el, d ? html`
      <b>${fmt.calendarDay(d.date, LONG_DAY)}</b>
      <span>${L('AbpAdmin::AuditLogs:Stats:RequestsCount', String(d.requests))}</span>
      <span class="err-t">${L('AbpAdmin::AuditLogs:Stats:FailedCount', String(d.failed))}</span>
      <span>${L('AbpAdmin::AuditLogs:Stats:Avg', fmt.duration(d.averageDuration))}</span>`
      : html`<span class="muted">${L('AbpAdmin::AuditLogs:Stats:HoverHint')}</span>`);
    root.querySelectorAll('.chart .day').forEach(g => g.classList.toggle('dim', i != null && +g.dataset.i !== i));
    root.querySelectorAll('.chart .pt').forEach(p => p.classList.toggle('on', +p.dataset.i === i));
  }

  // ---------- page skeleton ----------
  const slot = name => root.querySelector(`[data-slot=${name}]`);

  function drawActions() {
    const busy = state.logsLoading || state.statsLoading;
    render(slot('actions'), html`
      <div class="seg" role="radiogroup" aria-label="${L('AbpAdmin::AuditLogs:TimeRange')}">
        ${fmt.RANGES.map(r => html`<button role="radio" type="button" aria-checked="${String(state.range === r.key)}" data-range="${r.key}">${L(r.labelKey)}</button>`)}
      </div>
      <button class="icon-btn ${busy ? 'spin' : ''}" type="button" data-act="refresh" aria-label="${L('AbpAdmin::Common:Refresh')}" title="${L('AbpAdmin::Common:Refresh')}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg></button>`);
  }

  function drawStats() {
    const el = slot('stats');
    if (state.stats) render(el, statsView(state.stats));
    else if (state.statsError) render(el, html`<div class="card state err">${L('AbpAdmin::AuditLogs:StatsLoadFailed')} <button class="btn" type="button" data-act="refresh">${L('AbpAdmin::Common:Retry')}</button></div>`);
    else render(el, html`<div class="skeleton kpis"><i></i><i></i><i></i><i></i><i></i></div>`);
  }

  function drawStatusOptions() {
    const sel = root.querySelector('[data-f=status]');
    render(sel, html`<option value="">${L('AbpAdmin::AuditLogs:AnyStatus')}</option>
      ${(state.stats?.statusCodes ?? []).filter(c => c.key !== '—').map(c => html`<option value="${c.key}" ${String(state.status) === c.key ? raw('selected') : ''}>${c.key}</option>`)}`);
    sel.value = state.status == null ? '' : String(state.status);
  }

  /** Push state into the (stable) filter controls, e.g. after "clear all" or a stats pick. */
  function syncFilters() {
    const set = (f, v) => { const el = root.querySelector(`[data-f=${f}]`); if (el) el.value = v ?? ''; };
    set('url', state.url); set('user', state.user); set('method', state.method); set('minDuration', state.minDuration);
    drawStatusOptions();
    root.querySelectorAll('[data-outcome]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.outcome === state.outcome)));
  }

  function chips() {
    const out = [];
    const add = (key, label) => out.push({ key, label });
    if (state.correlation) add('correlation', L('AbpAdmin::AuditLogs:Chip:Correlation', state.correlation.slice(0, 8)));
    if (state.url) add('url', L('AbpAdmin::AuditLogs:Chip:Url', state.url));
    if (state.user) add('user', L('AbpAdmin::AuditLogs:Chip:User', state.user));
    if (state.method) add('method', L('AbpAdmin::AuditLogs:Chip:Method', state.method));
    if (state.status !== null) add('status', L('AbpAdmin::AuditLogs:Chip:Status', String(state.status)));
    if (state.outcome !== 'all') add('outcome', L(state.outcome === 'failed' ? 'AbpAdmin::AuditLogs:Chip:FailedOnly' : 'AbpAdmin::AuditLogs:Chip:SucceededOnly'));
    if (state.minDuration) add('minDuration', L('AbpAdmin::AuditLogs:Chip:MinDuration', String(state.minDuration)));
    return out;
  }

  function drawChips() {
    const list = chips();
    render(slot('chips'), list.length ? html`<div class="chips">
      ${list.map(c => html`<button class="chip" type="button" data-chip="${c.key}" aria-label="${L('AbpAdmin::AuditLogs:RemoveFilter', c.label)}">${c.label} <span aria-hidden="true">×</span></button>`)}
      <button class="link" type="button" data-act="clear-all">${L('AbpAdmin::AuditLogs:ClearAll')}</button></div>` : '');
  }

  function drawList() {
    const items = state.logs?.items ?? [];
    const el = slot('list');
    el.classList.toggle('loading', state.logsLoading);
    const groups = [];
    items.forEach((log, i) => {
      const day = fmt.dayLabel(log.executionTime);
      if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
      groups.at(-1).items.push({ log, i });
    });
    const maxDuration = Math.max(1, ...items.map(l => l.executionDuration));
    // sqrt scale: a 2 s outlier must not flatten every 40 ms request to nothing
    const width = ms => Math.max(4, Math.sqrt(ms / maxDuration) * 100);
    const filtered = chips().length > 0;
    render(el, html`
      ${state.logsError ? html`<div class="state err">${L('AbpAdmin::AuditLogs:LoadFailed')} <button class="btn" type="button" data-act="refresh">${L('AbpAdmin::Common:Retry')}</button></div>` : ''}
      ${groups.length ? groups.map(g => html`<h2 class="day-head"><span>${g.day}</span></h2><ul>${g.items.map(({ log: l, i }) => {
        const u = fmt.splitUrl(l.url);
        return html`<li>
          <button class="entry tone-${fmt.statusTone(l.httpStatusCode, !!l.exceptions)}" type="button" data-i="${i}"
                  aria-label="${L('AbpAdmin::AuditLogs:EntryLabel', l.httpMethod ?? '', l.url ?? '', String(l.httpStatusCode ?? ''))}">
            <span class="time" title="${l.executionTime}">${fmt.stamp(l.executionTime, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span class="status"><i></i>${l.httpStatusCode ?? '—'}</span>
            <span class="method m tone-${fmt.methodTone(l.httpMethod)}">${l.httpMethod}</span>
            <span class="path mono">${u.path}<span class="muted">${u.query}</span></span>
            <span class="who"><span class="avatar xs" aria-hidden="true">${(l.userName || '·')[0].toUpperCase()}</span><span>${l.userName ?? L('AbpAdmin::AuditLogs:Anonymous')}</span></span>
            <span class="counts">
              ${l.actions.length ? html`<span title="${L('AbpAdmin::AuditLogs:ServiceActions')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M8 12h12M12 18h8" /></svg>${l.actions.length}</span>` : ''}
              ${l.entityChanges.length ? html`<span title="${L('AbpAdmin::AuditLogs:EntityChanges')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" /></svg>${l.entityChanges.length}</span>` : ''}
            </span>
            <span class="dur-cell"><span class="dbar"><i style="width:${width(l.executionDuration)}%"></i></span><span class="dval">${fmt.duration(l.executionDuration)}</span></span>
          </button></li>`;
      })}</ul>`)
        : state.logsLoading ? html`<div class="skeleton rows">${[1, 2, 3, 4, 5, 6].map(() => html`<i></i>`)}</div>`
        : !state.logsError ? html`<div class="state empty">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h10M4 19h7" /></svg>
            <b>${L('AbpAdmin::AuditLogs:NoMatches')}</b>
            <span class="muted">${L('AbpAdmin::AuditLogs:NoMatchesHint')}</span>
            ${filtered ? html`<button class="btn" type="button" data-act="clear-all">${L('AbpAdmin::AuditLogs:ClearFilters')}</button>` : ''}
          </div>` : ''}`);
  }

  function drawPager() {
    const total = state.logs?.totalCount ?? 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    render(slot('pager'), total > 0 ? html`<footer class="pager">
      <span class="muted">${L(total === 1 ? 'AbpAdmin::AuditLogs:RequestCountOne' : 'AbpAdmin::AuditLogs:RequestCountMany', String(total))}</span>
      <div>
        <button class="btn" type="button" data-act="prev" ${state.page === 0 ? raw('disabled') : ''}>${L('AbpAdmin::Common:Previous')}</button>
        <span class="muted">${L('AbpAdmin::AuditLogs:PageOf', String(state.page + 1), String(pages))}</span>
        <button class="btn" type="button" data-act="next" ${state.page + 1 >= pages ? raw('disabled') : ''}>${L('AbpAdmin::Common:Next')}</button>
      </div></footer>` : '');
  }

  function drawSkeleton() {
    render(root, html`
      <header class="top">
        <div><h1>${L('AbpAdmin::AuditLogs:Title')}</h1><p class="muted">${L('AbpAdmin::AuditLogs:Subtitle')}</p></div>
        <div class="top-actions" data-slot="actions"></div>
      </header>
      <div class="al-stats" data-slot="stats"></div>
      <section class="card stream" id="al-stream">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="${SEARCH}" /></svg>
            <span class="sr-only">${L('AbpAdmin::AuditLogs:FilterByUrl')}</span>
            <input class="input" data-f="url" placeholder="${L('AbpAdmin::AuditLogs:FilterByUrlPlaceholder')}" value="${state.url}" />
          </label>
          <label><span class="sr-only">${L('AbpAdmin::AuditLogs:UserName')}</span>
            <input class="input" data-f="user" placeholder="${L('AbpAdmin::AuditLogs:User')}" value="${state.user}" /></label>
          <label><span class="sr-only">${L('AbpAdmin::AuditLogs:HttpMethod')}</span>
            <select class="input" data-f="method">
              <option value="">${L('AbpAdmin::AuditLogs:AnyMethod')}</option>
              ${METHODS.map(m => html`<option value="${m}">${m}</option>`)}
            </select></label>
          <label><span class="sr-only">${L('AbpAdmin::AuditLogs:StatusCode')}</span><select class="input" data-f="status"></select></label>
          <label class="dur"><span class="sr-only">${L('AbpAdmin::AuditLogs:MinDurationMs')}</span>
            <input class="input" type="number" min="0" step="50" data-f="minDuration" placeholder="${L('AbpAdmin::AuditLogs:MinDurationPlaceholder')}" /></label>
          <div class="seg small" role="radiogroup" aria-label="${L('AbpAdmin::AuditLogs:Outcome')}">
            <button role="radio" type="button" data-outcome="all" aria-checked="true">${L('AbpAdmin::Common:All')}</button>
            <button role="radio" type="button" data-outcome="ok" aria-checked="false">${L('AbpAdmin::AuditLogs:Succeeded')}</button>
            <button role="radio" type="button" data-outcome="failed" aria-checked="false">${L('AbpAdmin::AuditLogs:Failed')}</button>
          </div>
        </div>
        <div data-slot="chips"></div>
        <div class="list" data-slot="list" aria-live="polite"></div>
        <div data-slot="pager"></div>
      </section>`);
    drawActions(); drawStats(); drawStatusOptions(); drawChips(); drawList(); drawPager();
  }

  // ---------- data ----------
  let statsToken = 0, logsToken = 0;

  async function loadStats() {
    const token = ++statsToken;
    state.statsLoading = true; state.statsError = false; drawActions();
    try {
      const s = await api.get('/api/abp-admin/audit-log/statistics', state.win);
      if (token !== statsToken) return;
      state.stats = s;
    } catch { if (token !== statsToken) return; state.stats = null; state.statsError = true; }
    state.statsLoading = false;
    drawActions(); drawStats(); drawStatusOptions();
  }

  async function loadLogs() {
    const token = ++logsToken;
    state.logsLoading = true; state.logsError = false; drawActions(); drawList();
    try {
      const r = await api.get('/api/abp-admin/audit-log', {
        ...state.win,
        url: state.url || undefined, userName: state.user || undefined, correlationId: state.correlation || undefined,
        httpMethod: state.method || undefined, httpStatusCode: state.status ?? undefined,
        hasException: state.outcome === 'all' ? undefined : state.outcome === 'failed',
        minExecutionDuration: state.minDuration ?? undefined,
        skipCount: state.page * PAGE_SIZE, maxResultCount: PAGE_SIZE,
      });
      if (token !== logsToken) return;
      state.logs = r;
    } catch { if (token !== logsToken) return; state.logs = null; state.logsError = true; }
    state.logsLoading = false;
    drawActions(); drawList(); drawPager();
    // Deep link from a correlation id: open the matching request as soon as it is loaded.
    const first = state.logs?.items?.[0];
    if (deepLink && !state.opened && first?.correlationId === deepLink) { state.opened = true; AbpAdmin.auditLogging.openRequest(first); }
  }

  /** Filters changed: back to the first page, refetch the list (stats only depend on the time window). */
  function filtersChanged() {
    state.page = 0;
    drawChips(); loadLogs();
  }

  function clearAll() {
    Object.assign(state, { url: '', user: '', correlation: '', method: '', status: null, outcome: 'all', minDuration: null, page: 0 });
    if (deepLink) setParams({ correlation: null });
    syncFilters(); drawChips(); loadLogs();
  }

  function refreshWindow() {
    state.win = fmt.rangeWindow(state.range);
    loadStats(); loadLogs();
  }

  // ---------- events ----------
  const text = el => el.value.trim();
  on(root, 'change', '[data-f]', (e, el) => {
    const f = el.dataset.f;
    if (f === 'url') state.url = text(el);
    else if (f === 'user') state.user = text(el);
    else if (f === 'method') state.method = text(el);
    else if (f === 'status') state.status = el.value === '' ? null : Number(el.value);
    else if (f === 'minDuration') state.minDuration = el.value === '' ? null : Number(el.value);
    filtersChanged();
  });
  on(root, 'click', '[data-outcome]', (e, el) => {
    state.outcome = el.dataset.outcome;
    root.querySelectorAll('[data-outcome]').forEach(b => b.setAttribute('aria-checked', String(b === el)));
    filtersChanged();
  });
  on(root, 'click', '[data-range]', (e, el) => {
    state.range = el.dataset.range; state.page = 0;
    refreshWindow();
  });
  on(root, 'click', '[data-act=refresh]', refreshWindow);
  on(root, 'click', '[data-act=clear-all]', clearAll);
  on(root, 'click', '[data-chip]', (e, el) => {
    const key = el.dataset.chip;
    if (key === 'outcome') state.outcome = 'all';
    else if (key === 'status' || key === 'minDuration') state[key] = null;
    else {
      state[key] = '';
      if (key === 'correlation' && deepLink) setParams({ correlation: null });
    }
    syncFilters(); filtersChanged();
  });
  on(root, 'click', '[data-act=prev]', () => { state.page--; loadLogs(); });
  on(root, 'click', '[data-act=next]', () => { state.page++; loadLogs(); });
  on(root, 'click', '.entry[data-i]', (e, el) => AbpAdmin.auditLogging.openRequest(state.logs.items[+el.dataset.i]));

  // Clicking a figure in the dashboard filters the list.
  on(root, 'click', '[data-pick-status], [data-pick-method], [data-pick-url]', (e, el) => {
    Object.assign(state, { url: '', user: '', correlation: '', method: '', status: null, outcome: 'all', minDuration: null, page: 0 });
    if (deepLink) setParams({ correlation: null });
    if (el.dataset.pickUrl) state.url = el.dataset.pickUrl.replace(/\/\{id\}.*$/, '');
    if (el.dataset.pickMethod) state.method = el.dataset.pickMethod;
    if (el.dataset.pickStatus) state.status = +el.dataset.pickStatus;
    syncFilters(); drawChips(); loadLogs();
    document.getElementById('al-stream').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  on(root, 'mouseover', '.chart .day', (e, el) => hoverDay(+el.dataset.i));
  on(root, 'mouseout', '.chart .day', (e, el) => { if (!el.contains(e.relatedTarget)) hoverDay(null); });

  drawSkeleton();
  loadStats();
  loadLogs();
})();
