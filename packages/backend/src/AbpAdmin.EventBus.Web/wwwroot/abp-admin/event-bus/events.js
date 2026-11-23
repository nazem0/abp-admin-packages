// Events: the distributed event bus outbox and inbox. Port of events.page.ts.
(function () {
  const { html, render, icon, on, api, L, can, fmt, toast, errorText } = AbpAdmin;
  const root = document.getElementById('abp-events');

  // EventBoxKind and EventRecordStatus as numbers (the API's enums).
  const KIND = { Outbox: 0, Inbox: 1 };
  const STATES = [
    { status: 0, key: 'waiting', label: 'AbpAdmin::Events:State:Waiting', tone: 'info' },
    { status: 1, key: 'retrying', label: 'AbpAdmin::Events:State:Retrying', tone: 'warn' },
    { status: 2, key: 'discarded', label: 'AbpAdmin::Events:State:Discarded', tone: 'err' },
    { status: 3, key: 'processed', label: 'AbpAdmin::Events:State:Processed', tone: 'ok' },
  ];
  const FULL = { dateStyle: 'medium', timeStyle: 'medium' };
  const canManage = can('AbpAdmin.EventBoxes.Manage');

  const state = {
    boxes: [], boxesError: false, boxesLoading: true, picked: null, status: null, eventName: '',
    page: 0, size: AbpAdmin.pageSize(25), items: [], total: 0, loading: false, error: false, openId: null, confirming: null,
  };
  let seq = 0;

  /** The picked box (kept across refreshes by kind + name), else the first one. */
  const box = () => state.boxes.find(b => state.picked && b.kind === state.picked.kind && b.name === state.picked.name) ?? state.boxes[0];
  const stateOf = e => STATES.find(s => s.status === e.status) ?? STATES[0];

  async function loadBoxes() {
    state.boxesLoading = true; drawTop();
    try { state.boxes = await api.get('/api/abp-admin/event-box/boxes'); state.boxesError = false; }
    catch { state.boxesError = true; }
    state.boxesLoading = false; drawTop();
    if (box()) return loadList();
    drawList();
  }

  async function loadList() {
    const b = box();
    if (!b) return;
    const my = ++seq;
    state.loading = true; state.error = false; drawList();
    try {
      const r = await api.get('/api/abp-admin/event-box', {
        kind: b.kind, box: b.name, status: state.status ?? undefined, eventName: state.eventName || undefined,
        skipCount: state.page * state.size, maxResultCount: state.size,
      });
      if (my !== seq) return;
      state.items = r.items ?? []; state.total = r.totalCount ?? 0;
      if (AbpAdmin.pastEnd(state)) return loadList();
    } catch { if (my !== seq) return; state.error = true; }
    state.loading = false; drawList();
  }

  function shell() {
    render(root, html`
      <header class="top">
        <div>
          <h1>${L('AbpAdmin::Events:Title')}</h1>
          <p class="muted">${L('AbpAdmin::Events:Subtitle')}</p>
        </div>
        <div class="top-actions">
          <button class="icon-btn" id="ev-refresh" type="button" data-act="refresh" aria-label="${L('AbpAdmin::Common:Refresh')}" title="${L('AbpAdmin::Common:Refresh')}">
            ${icon('M20 11a8 8 0 10-2.3 5.7M20 4v7h-7')}
          </button>
        </div>
      </header>
      <div id="ev-top"></div>
      <div id="ev-body"></div>`);
  }

  function drawTop() {
    document.getElementById('ev-refresh').classList.toggle('spin', state.boxesLoading || state.loading);
    const top = document.getElementById('ev-top');
    if (state.boxesError) return render(top, html`<div class="card state err">${L('AbpAdmin::Events:LoadFailed')} <button class="btn" type="button" data-act="refresh">${L('AbpAdmin::Common:Retry')}</button></div>`);
    if (state.boxesLoading && !state.boxes.length) return render(top, html`<div class="card skeleton rows"><i></i><i></i></div>`);
    if (!state.boxes.length) return render(top, html`<div class="card state empty">
      <b>${L('AbpAdmin::Events:NoBoxes')}</b>
      <span class="muted">${L('AbpAdmin::Events:NoBoxesHint')}</span>
      <code class="mono">options.Outboxes.Configure(box =&gt; box.UseDbContext&lt;MyDbContext&gt;());</code>
    </div>`);
    const b = box();
    render(top, html`
      <nav class="tabs" aria-label="${L('AbpAdmin::Events:Boxes')}">
        ${state.boxes.map((x, i) => html`<button type="button" class="${x === b ? 'active' : ''}" aria-pressed="${x === b}" data-act="pick" data-i="${i}">
          ${L(x.kind === KIND.Outbox ? 'AbpAdmin::Events:Outbox' : 'AbpAdmin::Events:Inbox')}
          <small class="muted">${x.name === 'Default' ? x.dbContext : x.name}</small>
          ${x.waiting + x.retrying ? html`<span class="pill tone-info">${x.waiting + x.retrying}</span>` : ''}
          ${x.discarded ? html`<span class="pill tone-err">${x.discarded}</span>` : ''}
        </button>`)}
      </nav>
      ${b.kind === KIND.Inbox
        ? html`<div class="tiles" role="group" aria-label="${L('AbpAdmin::Events:FilterByState')}">
            ${STATES.map(s => html`<button type="button" class="tile card tone-${s.tone}" aria-pressed="${state.status === s.status}" data-act="toggle" data-status="${s.status}">
              <span class="muted">${L(s.label)}</span><strong>${b[s.key] ?? 0}</strong></button>`)}
          </div>`
        : html`<p class="muted hint">${L('AbpAdmin::Events:OutboxHint')}</p>`}`);
  }

  function row(e) {
    const st = stateOf(e), open = state.openId === e.id, b = box();
    return html`<li class="${open ? 'open' : ''}">
      <div class="row">
        <button class="main" type="button" data-act="open" data-id="${e.id}" aria-expanded="${open}">
          <span class="dot tone-${st.tone}" aria-hidden="true"></span>
          <span class="name"><b>${fmt.shortType(e.eventName)}</b><small class="mono">${e.eventName}</small></span>
          <span class="hide-sm"><span class="pill tone-${st.tone}">${L(st.label)}</span></span>
          <span class="when" title="${fmt.stamp(e.creationTime, FULL)}">${fmt.relative(e.creationTime)}</span>
        </button>
        ${canManage ? (state.confirming === e.id
          ? html`<span class="acts"><button class="btn sm danger" type="button" data-act="delete" data-id="${e.id}">${L('AbpAdmin::Common:Delete')}</button><button class="btn sm" type="button" data-act="cancel">${L('AbpAdmin::Common:Cancel')}</button></span>`
          : html`<span class="acts">
              ${b.kind === KIND.Inbox && e.status !== 0 ? html`<button class="icon-btn" type="button" data-act="retry" data-id="${e.id}" title="${L('AbpAdmin::Events:Retry')}" aria-label="${L('AbpAdmin::Events:RetryAria', e.eventName)}">${icon('M7 4v16l13-8z')}</button>` : ''}
              <button class="icon-btn" type="button" data-act="confirm" data-id="${e.id}" title="${L('AbpAdmin::Common:Delete')}" aria-label="${L('AbpAdmin::Events:DeleteAria', e.eventName)}">${icon('M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3')}</button>
            </span>`) : ''}
      </div>
      ${open ? html`<div class="detail">
        <dl>
          <dt>${L('AbpAdmin::Events:Created')}</dt><dd>${fmt.stamp(e.creationTime, FULL)}</dd>
          ${e.messageId ? html`<dt>${L('AbpAdmin::Events:MessageId')}</dt><dd class="mono">${e.messageId}</dd>` : ''}
          ${e.retryCount ? html`<dt>${L('AbpAdmin::Events:Retries')}</dt><dd>${e.retryCount}</dd>` : ''}
          ${e.nextRetryTime ? html`<dt>${L('AbpAdmin::Events:NextRetry')}</dt><dd>${fmt.stamp(e.nextRetryTime, FULL)}</dd>` : ''}
          ${e.handledTime ? html`<dt>${L('AbpAdmin::Events:Handled')}</dt><dd>${fmt.stamp(e.handledTime, FULL)}</dd>` : ''}
        </dl>
        <pre>${fmt.pretty(e.eventData)}</pre>
      </div>` : ''}
    </li>`;
  }

  function drawList() {
    document.getElementById('ev-refresh').classList.toggle('spin', state.boxesLoading || state.loading);
    const body = document.getElementById('ev-body');
    if (!box()) return render(body, '');
    let list;
    if (state.error) list = html`<div class="state err">${L('AbpAdmin::Events:LoadFailed')} <button class="btn" type="button" data-act="refresh">${L('AbpAdmin::Common:Retry')}</button></div>`;
    else if (state.loading && !state.items.length) list = html`<div class="skeleton rows"><i></i><i></i><i></i></div>`;
    else if (!state.items.length) list = html`<div class="state empty">${icon('M20 6 9 17l-5-5')}<b>${L('AbpAdmin::Events:Empty')}</b></div>`;
    else list = html`<ul class="events">${state.items.map(row)}</ul>`;
    render(body, html`<section class="card stream">
      <div class="filters">
        <label class="search">
          ${icon('M20 20l-3.5-3.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z')}
          <input class="input" type="search" id="ev-name" value="${state.eventName}" placeholder="${L('AbpAdmin::Events:EventNamePlaceholder')}" aria-label="${L('AbpAdmin::Events:EventNamePlaceholder')}" />
        </label>
      </div>
      ${list}
      ${state.total ? AbpAdmin.pager(state.total, state.page, state.size) : ''}
    </section>`);
  }

  const refresh = () => loadBoxes();
  AbpAdmin.onPager(root, (page, size) => { state.page = page; state.size = size; loadList(); });
  const setName = e => { const v = e.target.value.trim(); if (v !== state.eventName) { state.eventName = v; state.page = 0; loadList(); } };

  on(root, 'click', '[data-act]', async (e, el) => {
    const { act, id } = el.dataset;
    if (act === 'refresh') return refresh();
    if (act === 'pick') {
      const b = state.boxes[Number(el.dataset.i)];
      state.picked = { kind: b.kind, name: b.name }; state.status = null; state.page = 0; state.openId = null;
      drawTop(); return loadList();
    }
    if (act === 'toggle') {
      const s = Number(el.dataset.status);
      state.status = state.status === s ? null : s; state.page = 0;
      drawTop(); return loadList();
    }
    if (act === 'open') { state.openId = state.openId === id ? null : id; return drawList(); }
    if (act === 'confirm') { state.confirming = id; return drawList(); }
    if (act === 'cancel') { state.confirming = null; return drawList(); }
    const b = box();
    if (act === 'retry') {
      const ev = state.items.find(x => x.id === id);
      try { await api.post(`/api/abp-admin/event-box/${id}/retry` + AbpAdmin.query({ box: b.name })); toast.ok(L('AbpAdmin::Events:Requeued', fmt.shortType(ev?.eventName))); refresh(); }
      catch (err) { toast.error(errorText(err)); }
    }
    if (act === 'delete') {
      try { await api.delete(`/api/abp-admin/event-box/${id}`, { kind: b.kind, box: b.name }); state.confirming = null; toast.ok(L('AbpAdmin::Events:Deleted')); refresh(); }
      catch (err) { state.confirming = null; toast.error(errorText(err)); drawList(); }
    }
  });
  on(root, 'change', '#ev-name', setName);
  root.addEventListener('search', e => { if (e.target.id === 'ev-name') setName(e); }, true);

  shell(); drawTop(); loadBoxes();
})();
