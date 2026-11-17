// Users page (port of users.page.ts + user-form.component.ts). For a host admin with multi-tenancy on, lists users of every
// tenant and runs each row action inside that row's tenant (api option `tenant`), like the Angular TenantScope.
(function () {
  const { html, render, icon, on, api, L, can, fmt, toast, errorText, pageUrl, config, currentUser, params } = AbpAdmin;
  const root = document.getElementById('abp-users');
  const PAGE_SIZE = 20;
  const IC = {
    plus: 'M12 5v14M5 12h14', search: 'M20 20l-3.5-3.5', edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', unlock: 'M7 11V7a5 5 0 0 1 9.6-2M5 11h14v10H5z',
    lock: 'M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z', history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2', shield: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6zM9 12l2 2 4-4',
    del: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', close: 'M6 6l12 12M18 6 6 18',
  };

  /** Host admin with multi-tenancy on: users of every tenant. */
  const multi = !!config.multiTenancy?.isEnabled && !currentUser.tenantId && can('AbpAdmin.Tenants.ManageUsers');
  const state = { filter: '', page: 0, tenant: '', rows: [], total: 0, tenantNames: {}, tenants: [], loading: false, error: false, confirming: null, failure: null };
  let seq = 0;

  render(root, html`
    <header class="top">
      <div><h1>${L('AbpAdmin::Users:Title')}</h1><p class="muted">${L('AbpAdmin::Users:Subtitle')}</p></div>
      <span class="tools">
        <button class="btn" type="button" data-act="export" title="${L('AbpAdmin::Users:ExportHint')}">${icon('M12 4v11M7 10l5 5 5-5M5 20h14')} ${L('AbpAdmin::Users:Export')}</button>
        ${can('AbpIdentity.Users.Create') ? html`<label class="btn" title="${L('AbpAdmin::Users:ImportHint')}">${icon('M12 15V4M7 9l5-5 5 5M5 20h14')} ${L('AbpAdmin::Users:Import')}
          <input type="file" accept=".csv,text/csv" hidden data-act="import" /></label>` : ''}
        ${can('AbpIdentity.Users.Create') ? html`<button class="btn primary" type="button" data-act="new">${icon(IC.plus)} ${L('AbpAdmin::Users:NewUser')}</button>` : ''}
      </span>
    </header>
    <section class="card import" id="u-import" role="status" hidden></section>
    <section class="card stream">
      <div class="filters">
        <label class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="${IC.search}" /></svg>
          <input class="input" type="search" data-act="search" placeholder="${L('AbpAdmin::Users:SearchPlaceholder')}" aria-label="${L('AbpAdmin::Users:SearchLabel')}" />
        </label>
        <span id="u-tenant"></span>
        <span id="u-fail" class="alert tone-err" hidden></span>
      </div>
      <div id="u-list"></div>
    </section>
    <dialog id="u-form" class="narrow" aria-labelledby="uf-title"></dialog>`);
  const listEl = root.querySelector('#u-list');
  const failEl = root.querySelector('#u-fail');
  const formEl = root.querySelector('#u-form');
  /** Tenant a row's calls go to (the host admin's own scope when not in multi-tenant listing mode). */
  const tenantOf = u => (multi ? u.tenantId ?? undefined : undefined);

  // ---------- list ----------
  const fullName = u => [u.name, u.surname].filter(Boolean).join(' ');
  const initials = u => (fullName(u) || u.userName || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const locked = u => !!u.lockoutEnd && new Date(u.lockoutEnd).getTime() > Date.now();
  const pages = () => Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const tenantName = u => state.tenantNames?.[u.tenantId] ?? u.tenantId;

  function drawTenant() {
    const host = root.querySelector('#u-tenant');
    render(host, multi ? html`<label class="field inline"><span>${L('AbpAdmin::Users:TenantFilter')}</span>
      <select class="input" data-act="tenant">
        <option value="">${L('AbpAdmin::Users:AllTenants')}</option>
        <option value="host">${L('AbpAdmin::Users:Host')}</option>
        ${state.tenants.map(t => html`<option value="${t.id}">${t.name}</option>`)}
      </select></label>` : '');
    const sel = host.querySelector('select');
    if (sel) sel.value = state.tenant;
  }

  function drawFail() { failEl.hidden = !state.failure; failEl.textContent = state.failure ?? ''; }

  function row(u) {
    const name = u.userName ?? '';
    const history = can('AbpAdmin.SecurityLogs') && !u.tenantId && pageUrl('SecurityLogs');
    const changes = can('AbpAdmin.AuditLogs') && (!multi || !u.tenantId) && pageUrl('EntityChanges');
    const canUpdate = can('AbpIdentity.Users.Update');
    return html`<tr>
      <td><span class="who-cell"><span class="avatar" aria-hidden="true">${initials(u)}</span><span><b>${fullName(u) || u.userName}</b><small>@${u.userName}</small></span></span></td>
      ${multi ? html`<td>${u.tenantId ? html`<span class="pill">${tenantName(u)}</span>` : html`<span class="muted">${L('AbpAdmin::Users:Host')}</span>`}</td>` : ''}
      <td class="hide-sm">${u.email} ${u.emailConfirmed ? html`<span class="ok" title="${L('AbpAdmin::Users:EmailConfirmed')}" aria-label="${L('AbpAdmin::Users:Confirmed')}">✓</span>` : ''}</td>
      <td class="hide-sm muted">${u.phoneNumber || '—'}</td>
      <td><span class="pills">
        <span class="pill tone-${u.isActive ? 'ok' : 'warn'}">${L(u.isActive ? 'AbpAdmin::Common:Active' : 'AbpAdmin::Users:Inactive')}</span>
        ${locked(u) ? html`<span class="pill tone-err" title="${L('AbpAdmin::Users:LockedUntil', u.lockoutEnd + '')}">${L('AbpAdmin::Users:Locked')}</span>` : ''}
      </span></td>
      <td class="hide-sm muted">${fmt.relative(u.creationTime)}</td>
      <td class="actions">${state.confirming === u.id ? html`<span class="confirm">${L('AbpAdmin::Users:DeleteConfirm', name)}
          <button class="btn sm danger" type="button" data-act="remove" data-id="${u.id}">${L('AbpAdmin::Common:Delete')}</button>
          <button class="btn sm" type="button" data-act="cancel-delete">${L('AbpAdmin::Common:Cancel')}</button></span>`
        : html`
          ${canUpdate ? html`<button class="icon-btn" type="button" data-act="edit" data-id="${u.id}" title="${L('AbpAdmin::Common:Edit')}" aria-label="${L('AbpAdmin::Users:EditAria', name)}">${icon(IC.edit)}</button>` : ''}
          ${canUpdate ? (locked(u)
            ? html`<button class="icon-btn" type="button" data-act="unlock" data-id="${u.id}" title="${L('AbpAdmin::Users:Unlock')}" aria-label="${L('AbpAdmin::Users:UnlockAria', name)}">${icon(IC.unlock)}</button>`
            : u.id !== currentUser.id ? html`<button class="icon-btn" type="button" data-act="lock" data-id="${u.id}" title="${L('AbpAdmin::Users:LockFor24h')}" aria-label="${L('AbpAdmin::Users:LockAria', name)}">${icon(IC.lock)}</button>` : '') : ''}
          ${history ? html`<a class="icon-btn" href="${history + AbpAdmin.query({ user: u.userName })}" title="${L('AbpAdmin::Users:SignInHistory')}" aria-label="${L('AbpAdmin::Users:SignInHistoryOf', name)}">${icon(IC.history)}</a>` : ''}
          <button class="icon-btn" type="button" data-act="claims" data-id="${u.id}" title="${L('AbpAdmin::Claims:Title')}" aria-label="${L('AbpAdmin::Claims:Of', name)}">${icon('M20 12 12 20 4 12V4h8zM8.5 8.5v.01')}</button>
          ${changes ? html`<a class="icon-btn" href="${changes + AbpAdmin.query({ type: 'Volo.Abp.Identity.IdentityUser', id: u.id })}" title="${L('AbpAdmin::Common:ChangeHistory')}" aria-label="${L('AbpAdmin::Common:ChangeHistoryOf', name)}">${icon('M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5')}</a>` : ''}
          ${can('AbpIdentity.Users.ManagePermissions') ? html`<button class="icon-btn" type="button" data-act="perms" data-id="${u.id}" title="${L('AbpAdmin::Users:Permissions')}" aria-label="${L('AbpAdmin::Users:PermissionsOf', name)}">${icon(IC.shield)}</button>` : ''}
          ${can('AbpIdentity.Users.Delete') ? html`<button class="icon-btn" type="button" data-act="confirm-delete" data-id="${u.id}" title="${L('AbpAdmin::Common:Delete')}" aria-label="${L('AbpAdmin::Users:DeleteAria', name)}">${icon(IC.del)}</button>` : ''}`}
      </td></tr>`;
  }

  function drawList() {
    const rows = state.rows;
    render(listEl, html`
      ${state.error ? html`<div class="state err">${L('AbpAdmin::Users:LoadFailed')} <button class="btn" type="button" data-act="reload">${L('AbpAdmin::Common:Retry')}</button></div>`
      : state.loading && !rows.length ? html`<div class="skeleton rows">${[1, 2, 3, 4, 5].map(() => html`<i></i>`)}</div>`
      : !rows.length ? html`<div class="state empty">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
          <b>${L('AbpAdmin::Users:NoUsers')}</b><span class="muted">${state.filter ? L('AbpAdmin::Users:NoMatch', state.filter) : L('AbpAdmin::Users:CreateFirst')}</span></div>`
      : html`<table class="table ${state.loading ? 'loading' : ''}">
          <thead><tr><th>${L('AbpAdmin::Users:Col:User')}</th>${multi ? html`<th>${L('AbpAdmin::Users:Tenant')}</th>` : ''}<th class="hide-sm">${L('AbpAdmin::Users:Email')}</th><th class="hide-sm">${L('AbpAdmin::Users:Phone')}</th><th>${L('AbpAdmin::Common:Status')}</th><th class="hide-sm">${L('AbpAdmin::Common:Created')}</th><th><span class="sr-only">${L('AbpAdmin::Common:Actions')}</span></th></tr></thead>
          <tbody>${rows.map(row)}</tbody></table>`}
      ${state.total > PAGE_SIZE ? html`<footer class="pager"><span class="muted">${L('AbpAdmin::Users:CountMany', String(state.total))}</span>
          <div><button class="btn" type="button" data-act="prev" ${state.page === 0 ? 'disabled' : ''}>${L('AbpAdmin::Common:Previous')}</button>
          <span class="muted">${L('AbpAdmin::Users:PageOf', String(state.page + 1), String(pages()))}</span>
          <button class="btn" type="button" data-act="next" ${state.page + 1 >= pages() ? 'disabled' : ''}>${L('AbpAdmin::Common:Next')}</button></div></footer>`
      : state.total ? html`<footer class="pager"><span class="muted">${L(state.total === 1 ? 'AbpAdmin::Users:CountOne' : 'AbpAdmin::Users:CountMany', String(state.total))}</span></footer>` : ''}`);
  }

  async function load() {
    const id = ++seq;
    state.loading = true; state.error = false; drawList();
    const p = { filter: state.filter || undefined, skipCount: state.page * PAGE_SIZE, maxResultCount: PAGE_SIZE };
    try {
      const r = multi
        ? await api.get('/api/abp-admin/tenant-user', { ...p, hostOnly: state.tenant === 'host' || undefined, tenantId: state.tenant && state.tenant !== 'host' ? state.tenant : undefined })
        : await api.get('/api/identity/users', p);
      if (id !== seq) return;
      state.rows = r.items ?? []; state.total = r.totalCount ?? 0; state.tenantNames = r.tenantNames ?? {};
    } catch { if (id !== seq) return; state.error = true; }
    state.loading = false; drawList();
  }

  const byId = id => state.rows.find(u => u.id === id);

  async function lockAction(u, act) {
    try {
      if (act === 'lock') await api.post(`/api/abp-admin/user-lockout/${u.id}/lock`, { until: new Date(Date.now() + 24 * 3600_000).toISOString() }, { tenant: tenantOf(u) });
      else await api.post(`/api/abp-admin/user-lockout/${u.id}/unlock`, undefined, { tenant: tenantOf(u) });
      toast.ok(L(act === 'lock' ? 'AbpAdmin::Users:LockedFor24h' : 'AbpAdmin::Users:Unlocked', u.userName ?? ''));
      load();
    } catch (e) { toast.error(errorText(e)); }
  }

  // ---------- CSV import / export (users of the tenant picked in the filter, else the host) ----------
  const filterTenant = () => (multi && state.tenant && state.tenant !== 'host' ? state.tenant : undefined);
  async function exportCsv() {
    try {
      const blob = await api.request('GET', '/api/abp-admin/user-transfer/export', { tenant: filterTenant(), blob: true });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'users.csv' });
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast.error(errorText(e)); }
  }
  async function importCsv(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file, file.name);
    const box = root.querySelector('#u-import');
    try {
      const r = await api.post('/api/abp-admin/user-transfer/import', form, { tenant: filterTenant() });
      render(box, html`<b>${L('AbpAdmin::Users:ImportResult', String(r.created ?? 0), String(r.skipped?.length ?? 0), String(r.errors?.length ?? 0))}</b>
        ${r.skipped?.length ? html`<small class="muted">${L('AbpAdmin::Users:ImportSkipped', r.skipped.join(', '))}</small>` : ''}
        ${(r.errors ?? []).map(x => html`<small class="err">${L('AbpAdmin::Users:ImportLine', String(x.line ?? 0))} ${x.message}</small>`)}
        <button class="icon-btn close" type="button" data-act="import-close" aria-label="${L('AbpAdmin::Common:Close')}">${icon(IC.close)}</button>`);
      box.hidden = false;
      load();
    } catch (e) { toast.error(errorText(e)); }
  }

  async function remove(u) {
    state.failure = null; drawFail();
    try {
      await api.delete(`/api/identity/users/${u.id}`, undefined, { tenant: tenantOf(u) });
      state.confirming = null; toast.ok(L('AbpAdmin::Users:Deleted', u.userName ?? '')); load();
    } catch (e) { state.confirming = null; state.failure = errorText(e); drawFail(); drawList(); }
  }

  // ---------- form ----------
  const sheet = AbpAdmin.sheet(formEl, { onClose: () => { form = null; } });
  let form = null; // { user: dto | null, tenant }

  function openForm(user, tenant) {
    form = { user, tenant };
    const x = user;
    render(formEl, html`<form id="uf" autocomplete="off">
      <header class="sh-head">
        <span class="avatar" aria-hidden="true">${(x?.userName ?? '+')[0].toUpperCase()}</span>
        <h2 id="uf-title">${L(x ? 'AbpAdmin::Users:Form:EditUser' : 'AbpAdmin::Users:NewUser')} ${x ? html`<small>${x.userName}</small>` : ''}</h2>
        <button type="button" class="icon-btn" data-act="form-close" aria-label="${L('AbpAdmin::Common:Close')}">${icon(IC.close)}</button>
      </header>
      <div class="sh-body form">
        <div class="grid-2">
          <label class="field"><span>${L('AbpAdmin::Users:Form:UserName')} <i>*</i></span>
            <input class="input" name="userName" required maxlength="256" autocomplete="off" value="${x?.userName ?? ''}" /></label>
          <label class="field"><span>${L('AbpAdmin::Users:Email')} <i>*</i></span>
            <input class="input" name="email" type="email" required maxlength="256" autocomplete="off" value="${x?.email ?? ''}" /></label>
          <label class="field"><span>${L('AbpAdmin::Users:Form:FirstName')}</span>
            <input class="input" name="name" maxlength="64" value="${x?.name ?? ''}" /></label>
          <label class="field"><span>${L('AbpAdmin::Users:Form:LastName')}</span>
            <input class="input" name="surname" maxlength="64" value="${x?.surname ?? ''}" /></label>
          <label class="field"><span>${L('AbpAdmin::Users:Phone')}</span>
            <input class="input" name="phoneNumber" type="tel" maxlength="16" value="${x?.phoneNumber ?? ''}" /></label>
          <label class="field"><span>${L('AbpAdmin::Users:Form:Password')} ${x ? '' : html`<i>*</i>`}</span>
            <span class="pw">
              <input class="input" name="password" type="password" ${x ? '' : 'required'} autocomplete="new-password" maxlength="128" />
              <button type="button" class="link" data-act="pw">${L('AbpAdmin::Users:Form:Show')}</button>
            </span>
            <small>${L(x ? 'AbpAdmin::Users:Form:PasswordKeep' : 'AbpAdmin::Users:Form:PasswordPolicy')}</small></label>
        </div>
        <fieldset>
          <legend>${L('AbpAdmin::Users:Form:Roles')}</legend>
          <div id="uf-roles"><p class="muted">${L('AbpAdmin::Users:Form:LoadingRoles')}</p></div>
        </fieldset>
        <fieldset>
          <legend>${L('AbpAdmin::Users:Form:Account')}</legend>
          <label class="check"><input type="checkbox" class="switch" name="isActive" ${(x ? x.isActive : true) ? 'checked' : ''} />
            <span>${L('AbpAdmin::Common:Active')} <small>${L('AbpAdmin::Users:Form:ActiveHint')}</small></span></label>
          <label class="check"><input type="checkbox" class="switch" name="lockoutEnabled" ${(x ? x.lockoutEnabled : true) ? 'checked' : ''} />
            <span>${L('AbpAdmin::Users:Form:Lockout')} <small>${L('AbpAdmin::Users:Form:LockoutHint')}</small></span></label>
        </fieldset>
      </div>
      <footer class="sh-foot">
        <span id="uf-error" class="alert tone-err" hidden></span>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="form-close">${L('AbpAdmin::Common:Cancel')}</button>
        <button class="btn primary" type="submit" id="uf-save">${L(x ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Users:Form:CreateUser')}</button>
      </footer>
    </form>`);
    sheet.open();
    loadRoles();
  }

  async function loadRoles() {
    const f = form, x = f.user, box = formEl.querySelector('#uf-roles');
    try {
      const opt = { tenant: f.tenant ?? undefined };
      const [all, current] = await Promise.all([api.get('/api/identity/users/assignable-roles', undefined, opt), x ? api.get(`/api/identity/users/${x.id}/roles`, undefined, opt) : null]);
      if (form !== f) return;
      const roles = all.items ?? [];
      const selected = new Set((x ? current.items ?? [] : roles.filter(r => r.isDefault)).map(r => r.name));
      render(box, roles.length ? html`<div class="roles">${roles.map(r => html`<label class="check">
        <input type="checkbox" name="roleNames" value="${r.name}" ${selected.has(r.name) ? 'checked' : ''} />
        <span>${r.name} ${r.isDefault ? html`<small>${L('AbpAdmin::Users:Form:DefaultForNew')}</small>` : ''}</span></label>`)}</div>`
        : html`<p class="muted">${L('AbpAdmin::Users:Form:NoRoles')}</p>`);
    } catch (e) { if (form === f) render(box, html`<p class="muted">${errorText(e)}</p>`); }
  }

  async function save(formNode) {
    const f = form, x = f.user, fd = new FormData(formNode);
    const text = k => String(fd.get(k) ?? '').trim();
    const dto = {
      userName: text('userName'), email: text('email'), name: text('name') || undefined, surname: text('surname') || undefined,
      phoneNumber: text('phoneNumber') || undefined, isActive: fd.has('isActive'), lockoutEnabled: fd.has('lockoutEnabled'),
      roleNames: fd.getAll('roleNames').map(String),
    };
    const password = String(fd.get('password') ?? '');
    const btn = formEl.querySelector('#uf-save'), err = formEl.querySelector('#uf-error');
    btn.disabled = true; btn.textContent = L('AbpAdmin::Common:Saving'); err.hidden = true;
    const opt = { tenant: f.tenant ?? undefined };
    try {
      if (x) await api.put(`/api/identity/users/${x.id}`, { ...dto, password: password || undefined, concurrencyStamp: x.concurrencyStamp }, opt);
      else await api.post('/api/identity/users', { ...dto, password }, opt);
      toast.ok(L('AbpAdmin::Users:Saved')); sheet.close(); load();
    } catch (e) {
      btn.disabled = false; btn.textContent = L(x ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Users:Form:CreateUser');
      err.textContent = errorText(e); err.hidden = false;
    }
  }

  // ---------- events ----------
  on(formEl, 'click', '[data-act=form-close]', () => sheet.close());
  on(formEl, 'click', '[data-act=pw]', (e, b) => {
    const input = formEl.querySelector('[name=password]');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.textContent = L(show ? 'AbpAdmin::Users:Form:Hide' : 'AbpAdmin::Users:Form:Show');
  });
  formEl.addEventListener('submit', e => { e.preventDefault(); save(e.target); });

  const search = el => { if (state.filter !== el.value.trim()) { state.filter = el.value.trim(); state.page = 0; load(); } };
  on(root, 'click', '[data-act=new]', () => openForm(null, multi && state.tenant && state.tenant !== 'host' ? state.tenant : null));
  on(root, 'change', '[data-act=search]', (e, el) => search(el));
  root.addEventListener('search', e => { if (e.target.matches('[data-act=search]')) search(e.target); });
  on(root, 'change', '[data-act=tenant]', (e, el) => { state.tenant = el.value; state.page = 0; load(); });
  on(root, 'click', '[data-act=reload]', load);
  on(root, 'click', '[data-act=prev]', () => { state.page--; load(); });
  on(root, 'click', '[data-act=next]', () => { state.page++; load(); });
  on(root, 'click', '[data-act=edit]', (e, b) => { const u = byId(b.dataset.id); if (u) openForm(u, tenantOf(u)); });
  on(root, 'click', '[data-act=lock]', (e, b) => { const u = byId(b.dataset.id); if (u) lockAction(u, 'lock'); });
  on(root, 'click', '[data-act=unlock]', (e, b) => { const u = byId(b.dataset.id); if (u) lockAction(u, 'unlock'); });
  on(root, 'click', '[data-act=confirm-delete]', (e, b) => { state.confirming = b.dataset.id; drawList(); });
  on(root, 'click', '[data-act=cancel-delete]', () => { state.confirming = null; drawList(); });
  on(root, 'click', '[data-act=remove]', (e, b) => { const u = byId(b.dataset.id); if (u) remove(u); });
  on(root, 'click', '[data-act=export]', exportCsv);
  on(root, 'change', '[data-act=import]', (e, el) => importCsv(el));
  on(root, 'click', '[data-act=import-close]', () => { root.querySelector('#u-import').hidden = true; });
  on(root, 'click', '[data-act=claims]', (e, b) => {
    const u = byId(b.dataset.id);
    if (u) AbpAdmin.claimsEditor.open({ kind: 'user', id: u.id, title: u.userName, editable: can('AbpIdentity.Users.Update'), tenant: tenantOf(u) });
  });
  on(root, 'click', '[data-act=perms]', (e, b) => {
    const u = byId(b.dataset.id);
    if (u) AbpAdmin.permissionsEditor.open({ providerName: 'U', providerKey: u.id, title: u.userName, tenant: tenantOf(u) });
  });

  // ---------- start ----------
  drawTenant(); drawFail(); drawList();
  if (multi) api.get('/api/abp-admin/tenant', { maxResultCount: 1000 }).then(r => { state.tenants = r.items ?? []; drawTenant(); }).catch(() => {});
  load();
  if (params().get('new') === '1' && can('AbpIdentity.Users.Create')) openForm(null, null);
})();
