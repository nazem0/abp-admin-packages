// Background jobs: the persisted job queue. Port of background-jobs.page.ts.
(function () {
  const { html, render, icon, on, api, L, can, fmt, toast, errorText, params, setParams } = AbpAdmin;
  const root = document.getElementById('abp-background-jobs');
  const PAGE_SIZE = 25;
  const STATES = [
    { state: 0, key: 'waiting', label: 'AbpAdmin::BackgroundJobs:State:Waiting', hint: 'AbpAdmin::BackgroundJobs:State:WaitingHint', tone: 'info' },
    { state: 1, key: 'retrying', label: 'AbpAdmin::BackgroundJobs:State:Retrying', hint: 'AbpAdmin::BackgroundJobs:State:RetryingHint', tone: 'warn' },
    { state: 2, key: 'abandoned', label: 'AbpAdmin::BackgroundJobs:State:Abandoned', hint: 'AbpAdmin::BackgroundJobs:State:AbandonedHint', tone: 'err' },
  ];
  const PRIORITY = { 5: 'Low', 10: 'BelowNormal', 15: 'Normal', 20: 'AboveNormal', 25: 'High' };
  const FULL = { dateStyle: 'medium', timeStyle: 'medium' };
  const canManage = can('AbpAdmin.BackgroundJobs.Manage');

  const state = {
    state: STATES.find(s => s.key === params().get('state'))?.state ?? null,
    jobName: '', page: 0, openId: null, confirming: null,
    counts: null, items: [], total: 0, loading: false, error: false,
  };
  let seq = 0;

  const stateOf = j => (j.isAbandoned ? STATES[2] : (j.tryCount ?? 0) > 0 ? STATES[1] : STATES[0]);

  async function load() {
    const my = ++seq;
    state.loading = true; state.error = false; drawTop(); drawList();
    try {
      const [counts, list] = await Promise.all([
        api.get('/api/abp-admin/background-job/counts'),
        api.get('/api/abp-admin/background-job', { state: state.state, jobName: state.jobName, skipCount: state.page * PAGE_SIZE, maxResultCount: PAGE_SIZE }),
      ]);
      if (my !== seq) return;
      state.counts = counts; state.items = list.items ?? []; state.total = list.totalCount ?? 0;
    } catch { if (my !== seq) return; state.error = true; }
    state.loading = false; drawTop(); drawList();
  }

  function shell() {
    render(root, html`
      <header class="top">
        <div>
          <h1>${L('AbpAdmin::BackgroundJobs:Title')}</h1>
          <p class="muted">${L('AbpAdmin::BackgroundJobs:Subtitle', 'IBackgroundJobManager')}</p>
        </div>
        <div class="top-actions">
          <button class="icon-btn" id="bj-refresh" data-act="refresh" aria-label="${L('AbpAdmin::Common:Refresh')}" title="${L('AbpAdmin::Common:Refresh')}">
            ${icon('M20 11a8 8 0 10-2.3 5.7M20 4v7h-7')}
          </button>
        </div>
      </header>
      <div class="tiles" id="bj-tiles" role="group" aria-label="${L('AbpAdmin::BackgroundJobs:FilterByState')}"></div>
      <section class="card stream">
        <div class="filters">
          <label class="search">
            ${icon('M20 20l-3.5-3.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z')}
            <input class="input" type="search" id="bj-name" value="${state.jobName}" placeholder="${L('AbpAdmin::BackgroundJobs:JobNamePlaceholder')}" aria-label="${L('AbpAdmin::BackgroundJobs:FilterByJobName')}" />
          </label>
        </div>
        <div id="bj-list"></div>
      </section>`);
  }

  function drawTop() {
    document.getElementById('bj-refresh').classList.toggle('spin', state.loading);
    render(document.getElementById('bj-tiles'), STATES.map(s => html`
      <button class="tile card tone-${s.tone}" data-act="toggle" data-state="${s.state}" aria-pressed="${state.state === s.state}">
        <span class="muted">${L(s.label)}</span>
        <strong>${state.counts?.[s.key] ?? '–'}</strong>
        <small class="muted">${L(s.hint)}</small>
      </button>`));
  }

  function row(j) {
    const st = stateOf(j), open = state.openId === j.id;
    return html`<li class="${open ? 'open' : ''}">
      <div class="job">
        <button class="main" data-act="open" data-id="${j.id}" aria-expanded="${open}">
          <span class="dot tone-${st.tone}" aria-hidden="true"></span>
          <span class="name"><b>${fmt.shortType(j.jobName)}</b><small class="mono">${j.jobName}</small></span>
          <span class="meta hide-sm"><span class="pill tone-${st.tone}">${L(st.label)}</span>
            ${j.priority !== 15 ? html`<span class="pill">${L('AbpAdmin::BackgroundJobs:Priority:' + (PRIORITY[j.priority] ?? 'Normal'))}</span>` : ''}</span>
          <span class="tries">${L(j.tryCount === 1 ? 'AbpAdmin::BackgroundJobs:TryOne' : 'AbpAdmin::BackgroundJobs:TryMany', String(j.tryCount ?? 0))}</span>
          <span class="when" title="${fmt.stamp(j.nextTryTime, FULL)}">${j.isAbandoned ? L('AbpAdmin::BackgroundJobs:AbandonedLower') : L('AbpAdmin::BackgroundJobs:NextIn', fmt.relative(j.nextTryTime))}</span>
        </button>
        ${canManage ? (state.confirming === j.id
          ? html`<span class="confirm"><button class="btn sm danger" data-act="delete" data-id="${j.id}">${L('AbpAdmin::Common:Delete')}</button><button class="btn sm" data-act="cancel">${L('AbpAdmin::Common:Cancel')}</button></span>`
          : html`<span class="acts">
              <button class="icon-btn" data-act="retry" data-id="${j.id}" title="${L('AbpAdmin::BackgroundJobs:RunNow')}" aria-label="${L('AbpAdmin::BackgroundJobs:RunAria', j.jobName)}">${icon('M7 4v16l13-8z')}</button>
              <button class="icon-btn" data-act="confirm" data-id="${j.id}" title="${L('AbpAdmin::Common:Delete')}" aria-label="${L('AbpAdmin::BackgroundJobs:DeleteAria', j.jobName)}">${icon('M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3')}</button>
            </span>`) : ''}
      </div>
      ${open ? html`<div class="detail">
        <dl>
          <dt>${L('AbpAdmin::BackgroundJobs:Queued')}</dt><dd>${fmt.stamp(j.creationTime, FULL)}</dd>
          <dt>${L('AbpAdmin::BackgroundJobs:LastTry')}</dt><dd>${j.lastTryTime ? fmt.stamp(j.lastTryTime, FULL) : L('AbpAdmin::Common:Never')}</dd>
          <dt>${L('AbpAdmin::BackgroundJobs:NextTry')}</dt><dd>${fmt.stamp(j.nextTryTime, FULL)}</dd>
          ${j.applicationName ? html`<dt>${L('AbpAdmin::BackgroundJobs:Application')}</dt><dd>${j.applicationName}</dd>` : ''}
        </dl>
        <pre>${fmt.pretty(j.jobArgs)}</pre>
      </div>` : ''}
    </li>`;
  }

  function drawList() {
    const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    let body;
    if (state.error) body = html`<div class="state err">${L('AbpAdmin::BackgroundJobs:LoadFailed')} <button class="btn" data-act="refresh">${L('AbpAdmin::Common:Retry')}</button></div>`;
    else if (state.loading && !state.items.length) body = html`<div class="skeleton rows"><i></i><i></i><i></i></div>`;
    else if (!state.items.length) body = html`<div class="state empty">${icon('M20 6 9 17l-5-5')}
      <b>${L('AbpAdmin::BackgroundJobs:QueueEmpty')}</b><span class="muted">${L(state.state !== null || state.jobName ? 'AbpAdmin::BackgroundJobs:NoMatch' : 'AbpAdmin::BackgroundJobs:AllRun')}</span></div>`;
    else body = html`<ul class="jobs">${state.items.map(row)}</ul>`;
    render(document.getElementById('bj-list'), html`${body}
      ${state.total > PAGE_SIZE ? html`<footer class="pager">
        <span class="muted">${L('AbpAdmin::BackgroundJobs:Count', String(state.total))}</span>
        <div>
          <button class="btn" data-act="prev" ${state.page === 0 ? 'disabled' : ''}>${L('AbpAdmin::Common:Previous')}</button>
          <span class="muted">${L('AbpAdmin::BackgroundJobs:PageOf', String(state.page + 1), String(pages))}</span>
          <button class="btn" data-act="next" ${state.page + 1 >= pages ? 'disabled' : ''}>${L('AbpAdmin::Common:Next')}</button>
        </div>
      </footer>` : ''}`);
  }

  const reload = () => load();
  const setName = e => { const v = e.target.value.trim(); if (v !== state.jobName) { state.jobName = v; state.page = 0; load(); } };

  on(root, 'click', '[data-act]', async (e, el) => {
    const { act, id } = el.dataset;
    if (act === 'refresh') return reload();
    if (act === 'toggle') {
      const s = Number(el.dataset.state);
      state.state = state.state === s ? null : s; state.page = 0;
      setParams({ state: STATES.find(x => x.state === state.state)?.key });
      return reload();
    }
    if (act === 'open') { state.openId = state.openId === id ? null : id; return drawList(); }
    if (act === 'confirm') { state.confirming = id; return drawList(); }
    if (act === 'cancel') { state.confirming = null; return drawList(); }
    if (act === 'prev') { state.page--; return reload(); }
    if (act === 'next') { state.page++; return reload(); }
    if (act === 'retry') {
      const j = state.items.find(x => x.id === id);
      try { await api.post(`/api/abp-admin/background-job/${id}/retry`); toast.ok(L('AbpAdmin::BackgroundJobs:QueuedToRun', fmt.shortType(j?.jobName))); reload(); }
      catch (err) { toast.error(errorText(err)); }
    }
    if (act === 'delete') {
      try { await api.delete(`/api/abp-admin/background-job/${id}`); state.confirming = null; toast.ok(L('AbpAdmin::BackgroundJobs:Deleted')); reload(); }
      catch (err) { state.confirming = null; toast.error(errorText(err)); drawList(); }
    }
  });
  on(root, 'change', '#bj-name', setName);
  root.addEventListener('search', e => { if (e.target.id === 'bj-name') setName(e); }, true);

  shell(); drawTop(); load();
})();
