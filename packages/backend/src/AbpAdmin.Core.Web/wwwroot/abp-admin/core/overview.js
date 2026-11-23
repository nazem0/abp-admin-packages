// Overview page: dashboard numbers (each section comes from an installed feature), alerts, recent sign-in events, quick links.
(function () {
  const { html, render, icon, on, api, L, can, fmt, pageUrl, config, currentUser } = AbpAdmin;
  const root = document.getElementById('abp-overview');
  const WARN = 'M12 8v5M12 16.5v.5M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z';
  const canSecurity = can('AbpAdmin.SecurityLogs');

  const state = { data: null, error: false, loading: false, recent: [] };

  /** <a> to another page with optional query, or a plain <div> when that page isn't installed. */
  const link = (page, query, cls, content) => {
    const url = pageUrl(page);
    return url ? html`<a class="${cls}" href="${url + AbpAdmin.query(query)}">${content}</a>` : html`<div class="${cls}">${content}</div>`;
  };

  function greeting() {
    const h = new Date().getHours();
    const name = currentUser.name || currentUser.userName || '';
    const part = h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
    return L(`AbpAdmin::Overview:Greeting${part}${name ? '' : 'Anon'}`, name);
  }

  function alerts(d) {
    const n = (count, one, many) => L(count === 1 ? one : many, String(count));
    const list = [];
    if (d.users?.locked) list.push({ tone: 'warn', text: n(d.users.locked, 'AbpAdmin::Overview:Alert:UsersLockedOne', 'AbpAdmin::Overview:Alert:UsersLockedMany'), page: 'Users' });
    if (d.signIns?.failed) list.push({ tone: 'err', text: n(d.signIns.failed, 'AbpAdmin::Overview:Alert:FailedSignInsOne', 'AbpAdmin::Overview:Alert:FailedSignInsMany'), page: 'SecurityLogs', query: { failed: '1' } });
    if (d.requests?.failed) list.push({ tone: 'err', text: n(d.requests.failed, 'AbpAdmin::Overview:Alert:RequestsFailedOne', 'AbpAdmin::Overview:Alert:RequestsFailedMany'), page: 'AuditLogs' });
    if (d.jobs?.abandoned) list.push({ tone: 'warn', text: n(d.jobs.abandoned, 'AbpAdmin::Overview:Alert:JobsAbandonedOne', 'AbpAdmin::Overview:Alert:JobsAbandonedMany'), page: 'BackgroundJobs', query: { state: 'abandoned' } });
    return list;
  }

  function kpis(d) {
    const out = [];
    if (d.users) out.push(link('Users', null, 'kpi card', html`<span class="label">${L('AbpAdmin::Overview:Kpi:Users')}</span><strong>${d.users.total}</strong>
      <span class="sub"><b class="ok">${L('AbpAdmin::Overview:Kpi:NewThisWeek', d.users.newLast7Days)}</b> · ${L('AbpAdmin::Overview:Kpi:Inactive', d.users.inactive)} · ${L('AbpAdmin::Overview:Kpi:Locked', d.users.locked)}</span>`));
    if (d.signIns) out.push(link('SecurityLogs', null, 'kpi card', html`<span class="label">${L('AbpAdmin::Overview:Kpi:SignIns')}</span><strong>${d.signIns.succeeded}</strong>
      <span class="sub"><b class="${d.signIns.failed ? 'err' : ''}">${L('AbpAdmin::Overview:Kpi:Failed', d.signIns.failed)}</b> · ${L('AbpAdmin::Overview:Kpi:Lockouts', d.signIns.lockouts)}</span>`));
    if (d.requests) out.push(link('AuditLogs', null, 'kpi card', html`<span class="label">${L('AbpAdmin::Overview:Kpi:Requests')}</span><strong>${d.requests.last24Hours}</strong>
      <span class="sub"><b class="${d.requests.failed ? 'err' : ''}">${L('AbpAdmin::Overview:Kpi:Failed', d.requests.failed)}</b> · ${L('AbpAdmin::Overview:Kpi:Avg', fmt.duration(d.requests.averageMs ?? 0))}</span>`));
    if (d.jobs) out.push(link('BackgroundJobs', null, 'kpi card', html`<span class="label">${L('AbpAdmin::Overview:Kpi:BackgroundJobs')}</span><strong>${d.jobs.waiting}</strong>
      <span class="sub">${L('AbpAdmin::Overview:Kpi:Queued')} · <b class="${d.jobs.abandoned ? 'err' : ''}">${L('AbpAdmin::Overview:Kpi:Abandoned', d.jobs.abandoned)}</b></span>`));
    if (d.roles != null) out.push(link('Roles', null, 'kpi card', html`<span class="label">${L('AbpAdmin::Overview:Kpi:Roles')}</span><strong>${d.roles}</strong><span class="sub">${L('AbpAdmin::Overview:Kpi:RolesSub')}</span>`));
    if (d.applications != null) out.push(link('Applications', null, 'kpi card', html`<span class="label">${L('AbpAdmin::Overview:Kpi:Clients')}</span><strong>${d.applications}</strong><span class="sub">${L('AbpAdmin::Overview:Kpi:ClientsSub')}</span>`));
    return out;
  }

  function recentFeed() {
    if (!canSecurity) return '';
    const all = pageUrl('SecurityLogs');
    return html`<section class="card feed" aria-labelledby="rs-h">
      <header><h2 id="rs-h">${L('AbpAdmin::Overview:RecentEvents')}</h2>${all ? html`<a href="${all}">${L('AbpAdmin::Common:ViewAll')}</a>` : ''}</header>
      <ul>${state.recent.length ? state.recent.map(e => {
        const a = fmt.describeAction(e.action);
        return html`<li>
          <span class="ico tone-${a.tone}" aria-hidden="true">${icon(a.icon)}</span>
          <span class="what"><b>${a.label}</b><small>${e.userName || L('AbpAdmin::Overview:UnknownUser')} · ${e.clientId || e.identity} · ${e.clientIpAddress}</small></span>
          <time class="muted">${fmt.relative(e.creationTime)}</time>
        </li>`;
      }) : html`<li class="muted none">${L('AbpAdmin::Overview:NoEvents')}</li>`}</ul>
    </section>`;
  }

  function quickLinks() {
    const pages = new Set(config.abpAdmin?.pages ?? []);
    const items = (config.abpAdmin?.commands ?? []).filter(c => pages.has(c.id) && c.id !== 'Overview');
    return html`<section class="card feed" aria-labelledby="go-h">
      <header><h2 id="go-h">${L('AbpAdmin::Overview:JumpTo')}</h2><span class="muted small">${L('AbpAdmin::Overview:OrPress')} <kbd>Ctrl K</kbd></span></header>
      <div class="links">${items.map(c => html`<a href="${c.url}">${icon(c.icon)}<span>${L(c.labelKey)}</span></a>`)}</div>
    </section>`;
  }

  function draw() {
    const d = state.data;
    render(root, html`
      <header class="top">
        <div><h1>${greeting()}</h1><p class="muted">${L('AbpAdmin::Overview:Subtitle')}</p></div>
        <div class="top-actions">
          ${can('AbpAdmin.Cache') ? html`<button class="btn" type="button" data-act="clear-caches" title="${L('AbpAdmin::Cache:ClearAllHint')}" ${state.clearing ? 'disabled' : ''}>
            ${icon('M20 20H9l-5-5 10-10 7 7-8 8M9 9l7 7')} ${L('AbpAdmin::Cache:ClearAll')}</button>` : ''}
          <button class="icon-btn ${state.loading ? 'spin' : ''}" type="button" data-act="refresh" aria-label="${L('AbpAdmin::Common:Refresh')}" title="${L('AbpAdmin::Common:Refresh')}">
            ${icon('M20 11a8 8 0 10-2.3 5.7M20 4v7h-7')}</button>
        </div>
      </header>
      ${state.error ? html`<div class="card state err">${L('AbpAdmin::Overview:LoadFailed')} <button class="btn" type="button" data-act="refresh">${L('AbpAdmin::Common:Retry')}</button></div>`
        : d ? html`
          ${alerts(d).length ? html`<section class="alerts" aria-label="${L('AbpAdmin::Overview:NeedsAttention')}">${alerts(d).map(a =>
              link(a.page, a.query, `alert-row tone-${a.tone}`, html`${icon(WARN)}<span>${a.text}</span><b>${L('AbpAdmin::Overview:Review')}</b>`))}</section>`
            : html`<div class="calm card"><span class="dot" aria-hidden="true"></span> ${L('AbpAdmin::Overview:AllClear')}</div>`}
          <section class="kpis">${kpis(d)}</section>
          <div class="cols">${recentFeed()}${quickLinks()}</div>`
        : html`<div class="skeleton kpis">${[1, 2, 3, 4].map(() => html`<i></i>`)}</div>`}
    `);
  }

  async function load() {
    state.loading = true; state.error = false; draw();
    try {
      const [data, recent] = await Promise.all([
        api.get('/api/abp-admin/dashboard'),
        canSecurity ? api.get('/api/abp-admin/security-log', { maxResultCount: 7 }) : Promise.resolve({ items: [] }),
      ]);
      state.data = data; state.recent = recent.items ?? [];
    } catch { state.error = true; }
    state.loading = false; draw();
  }

  on(root, 'click', '[data-act=refresh]', load);
  // Every cached permission, setting and feature value (from the host: in every tenant too).
  on(root, 'click', '[data-act=clear-caches]', async () => {
    state.clearing = true; draw();
    try {
      const r = await api.post('/api/abp-admin/cache/clear-all');
      AbpAdmin.toast.ok(L('AbpAdmin::Cache:ClearedAll', String(r.users), String(r.roles), String(r.tenants)));
    } catch (err) { AbpAdmin.toast.error(AbpAdmin.errorText(err)); }
    state.clearing = false; draw();
  });
  load();
})();
