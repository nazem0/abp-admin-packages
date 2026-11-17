// Roles page (port of roles.page.ts including its role form).
(function () {
  const { html, render, icon, on, api, L, can, fmt, toast, errorText, params, pageUrl, sheet: makeSheet } = AbpAdmin;
  const root = document.getElementById('abp-roles');
  const IC = {
    plus: 'M12 5v14M5 12h14', search: 'M20 20l-3.5-3.5', edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', shield: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6zM9 12l2 2 4-4',
    del: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', close: 'M6 6l12 12M18 6 6 18',
  };
  // ponytail: first 100 roles only (as in the Angular page); add paging if a deployment ever has more.
  const state = { filter: '', rows: [], total: 0, loading: false, error: false, confirming: null, failure: null };
  let seq = 0;

  render(root, html`
    <header class="top">
      <div><h1>${L('AbpAdmin::Roles:Title')}</h1><p class="muted">${L('AbpAdmin::Roles:Subtitle')}</p></div>
      ${can('AbpIdentity.Roles.Create') ? html`<button class="btn primary" type="button" data-act="new">${icon(IC.plus)} ${L('AbpAdmin::Roles:NewRole')}</button>` : ''}
    </header>
    <section class="card stream">
      <div class="filters">
        <label class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="${IC.search}" /></svg>
          <input class="input" type="search" data-act="search" placeholder="${L('AbpAdmin::Roles:SearchPlaceholder')}" aria-label="${L('AbpAdmin::Roles:SearchLabel')}" />
        </label>
        <span id="r-fail" class="alert tone-err" hidden></span>
      </div>
      <div id="r-list"></div>
    </section>
    <dialog id="r-form" class="narrow" aria-labelledby="rf-title"></dialog>
    <dialog id="r-move" class="narrow" aria-labelledby="rm-title"></dialog>`);
  const listEl = root.querySelector('#r-list');
  const failEl = root.querySelector('#r-fail');
  const formEl = root.querySelector('#r-form');

  function drawFail() { failEl.hidden = !state.failure; failEl.textContent = state.failure ?? ''; }

  const changes = can('AbpAdmin.AuditLogs') && pageUrl('EntityChanges');
  function row(r) {
    const name = r.name ?? '';
    return html`<tr>
      <td><span class="who-cell"><span class="avatar sq" aria-hidden="true">${r.name?.[0]?.toUpperCase()}</span><b>${r.name}</b></span></td>
      <td><span class="pills">
        ${r.isStatic ? html`<span class="pill tone-accent" title="${L('AbpAdmin::Roles:StaticHint')}">${L('AbpAdmin::Roles:Static')}</span>` : ''}
        ${r.isDefault ? html`<span class="pill tone-info" title="${L('AbpAdmin::Roles:DefaultHint')}">${L('AbpAdmin::Roles:Default')}</span>` : ''}
        ${r.isPublic ? html`<span class="pill" title="${L('AbpAdmin::Roles:PublicHint')}">${L('AbpAdmin::Roles:Public')}</span>` : ''}
      </span></td>
      <td class="hide-sm muted">${fmt.relative(r.creationTime)}</td>
      <td class="actions">${state.confirming === r.id ? html`<span class="confirm">${L('AbpAdmin::Roles:DeleteConfirm', name)}
          <button class="btn sm danger" type="button" data-act="remove" data-id="${r.id}">${L('AbpAdmin::Common:Delete')}</button>
          <button class="btn sm" type="button" data-act="cancel-delete">${L('AbpAdmin::Common:Cancel')}</button></span>`
        : html`
          ${can('AbpIdentity.Roles.Update') ? html`<button class="icon-btn" type="button" data-act="edit" data-id="${r.id}" title="${L('AbpAdmin::Common:Edit')}" aria-label="${L('AbpAdmin::Roles:EditAria', name)}">${icon(IC.edit)}</button>` : ''}
          ${can('AbpIdentity.Roles.ManagePermissions') ? html`<button class="icon-btn" type="button" data-act="perms" data-id="${r.id}" title="${L('AbpAdmin::Roles:Permissions')}" aria-label="${L('AbpAdmin::Roles:PermissionsOf', name)}">${icon(IC.shield)}</button>` : ''}
          <button class="icon-btn" type="button" data-act="claims" data-id="${r.id}" title="${L('AbpAdmin::Claims:Title')}" aria-label="${L('AbpAdmin::Claims:Of', name)}">${icon('M20 12 12 20 4 12V4h8zM8.5 8.5v.01')}</button>
          ${can('AbpIdentity.Roles.Update') && can('AbpIdentity.Users.Update') ? html`<button class="icon-btn" type="button" data-act="move" data-id="${r.id}" title="${L('AbpAdmin::Roles:MoveUsers')}" aria-label="${L('AbpAdmin::Roles:MoveUsersOf', name)}">${icon('M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 11-4.7M16 14h6M19 11l3 3-3 3')}</button>` : ''}
          ${changes ? html`<a class="icon-btn" href="${changes + AbpAdmin.query({ type: 'Volo.Abp.Identity.IdentityRole', id: r.id })}" title="${L('AbpAdmin::Common:ChangeHistory')}" aria-label="${L('AbpAdmin::Common:ChangeHistoryOf', name)}">${icon('M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5')}</a>` : ''}
          ${can('AbpIdentity.Roles.Delete') && !r.isStatic ? html`<button class="icon-btn" type="button" data-act="confirm-delete" data-id="${r.id}" title="${L('AbpAdmin::Common:Delete')}" aria-label="${L('AbpAdmin::Roles:DeleteAria', name)}">${icon(IC.del)}</button>` : ''}`}
      </td></tr>`;
  }

  function drawList() {
    const rows = state.rows;
    render(listEl, html`
      ${state.error ? html`<div class="state err">${L('AbpAdmin::Roles:LoadFailed')} <button class="btn" type="button" data-act="reload">${L('AbpAdmin::Common:Retry')}</button></div>`
      : state.loading && !rows.length ? html`<div class="skeleton rows">${[1, 2, 3].map(() => html`<i></i>`)}</div>`
      : !rows.length ? html`<div class="state empty"><b>${L('AbpAdmin::Roles:NoRoles')}</b><span class="muted">${state.filter ? L('AbpAdmin::Roles:NoMatch', state.filter) : L('AbpAdmin::Roles:CreateFirst')}</span></div>`
      : html`<table class="table">
          <thead><tr><th>${L('AbpAdmin::Roles:Col:Role')}</th><th>${L('AbpAdmin::Roles:Col:Flags')}</th><th class="hide-sm">${L('AbpAdmin::Common:Created')}</th><th><span class="sr-only">${L('AbpAdmin::Common:Actions')}</span></th></tr></thead>
          <tbody>${rows.map(row)}</tbody></table>
          <footer class="pager"><span class="muted">${L(state.total === 1 ? 'AbpAdmin::Roles:CountOne' : 'AbpAdmin::Roles:CountMany', String(state.total))}</span>
            ${state.total > rows.length ? html`<span class="muted">${L('AbpAdmin::Roles:ShowingFirst', String(rows.length))}</span>` : ''}</footer>`}`);
  }

  async function load() {
    const id = ++seq;
    state.loading = true; state.error = false; drawList();
    try {
      const r = await api.get('/api/identity/roles', { filter: state.filter || undefined, maxResultCount: 100 });
      if (id !== seq) return;
      state.rows = r.items ?? []; state.total = r.totalCount ?? 0;
    } catch { if (id !== seq) return; state.error = true; }
    state.loading = false; drawList();
  }

  const byId = id => state.rows.find(r => r.id === id);

  async function remove(r) {
    state.failure = null; drawFail();
    try {
      await api.delete(`/api/identity/roles/${r.id}`);
      state.confirming = null; toast.ok(L('AbpAdmin::Roles:Deleted', r.name ?? '')); load();
    } catch (e) { state.confirming = null; state.failure = errorText(e); drawFail(); drawList(); }
  }

  // ---------- form ----------
  const sheet = AbpAdmin.sheet(formEl, { onClose: () => { editing = null; } });
  let editing = null; // { role: dto | null }

  function openForm(role) {
    editing = { role };
    const x = role;
    render(formEl, html`<form id="rf" autocomplete="off">
      <header class="sh-head">
        <h2 id="rf-title">${L(x ? 'AbpAdmin::Roles:Form:EditRole' : 'AbpAdmin::Roles:NewRole')} ${x ? html`<small>${x.name}</small>` : ''}</h2>
        <button type="button" class="icon-btn" data-act="form-close" aria-label="${L('AbpAdmin::Common:Close')}">${icon(IC.close)}</button>
      </header>
      <div class="sh-body form">
        <label class="field"><span>${L('AbpAdmin::Common:Name')} <i>*</i></span>
          <input class="input" name="name" required maxlength="256" autocomplete="off" value="${x?.name ?? ''}" ${x?.isStatic ? 'readonly' : ''} />
          ${x?.isStatic ? html`<small>${L('AbpAdmin::Roles:Form:StaticHint')}</small>` : ''}</label>
        <label class="check"><input type="checkbox" class="switch" name="isDefault" ${x?.isDefault ? 'checked' : ''} />
          <span>${L('AbpAdmin::Roles:Default')} <small>${L('AbpAdmin::Roles:Form:DefaultHint')}</small></span></label>
        <label class="check"><input type="checkbox" class="switch" name="isPublic" ${(x ? x.isPublic : true) ? 'checked' : ''} />
          <span>${L('AbpAdmin::Roles:Public')} <small>${L('AbpAdmin::Roles:Form:PublicHint')}</small></span></label>
      </div>
      <footer class="sh-foot">
        <span id="rf-error" class="alert tone-err" hidden></span>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="form-close">${L('AbpAdmin::Common:Cancel')}</button>
        <button class="btn primary" type="submit" id="rf-save">${L(x ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Roles:Form:CreateRole')}</button>
      </footer>
    </form>`);
    sheet.open();
  }

  async function save(formNode) {
    const x = editing.role, fd = new FormData(formNode);
    const dto = { name: String(fd.get('name') ?? '').trim(), isDefault: fd.has('isDefault'), isPublic: fd.has('isPublic') };
    const btn = formEl.querySelector('#rf-save'), err = formEl.querySelector('#rf-error');
    btn.disabled = true; btn.textContent = L('AbpAdmin::Common:Saving'); err.hidden = true;
    try {
      if (x) await api.put(`/api/identity/roles/${x.id}`, { ...dto, concurrencyStamp: x.concurrencyStamp });
      else await api.post('/api/identity/roles', dto);
      toast.ok(L('AbpAdmin::Roles:Saved')); sheet.close(); load();
    } catch (e) {
      btn.disabled = false; btn.textContent = L(x ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Roles:Form:CreateRole');
      err.textContent = errorText(e); err.hidden = false;
    }
  }

  // ---------- events ----------
  on(formEl, 'click', '[data-act=form-close]', () => sheet.close());
  formEl.addEventListener('submit', e => { e.preventDefault(); save(e.target); });

  const search = el => { if (state.filter !== el.value.trim()) { state.filter = el.value.trim(); load(); } };
  on(root, 'click', '[data-act=new]', () => openForm(null));
  on(root, 'change', '[data-act=search]', (e, el) => search(el));
  root.addEventListener('search', e => { if (e.target.matches('[data-act=search]')) search(e.target); });
  on(root, 'click', '[data-act=reload]', load);
  on(root, 'click', '[data-act=edit]', (e, b) => { const r = byId(b.dataset.id); if (r) openForm(r); });
  on(root, 'click', '[data-act=confirm-delete]', (e, b) => { state.confirming = b.dataset.id; drawList(); });
  on(root, 'click', '[data-act=cancel-delete]', () => { state.confirming = null; drawList(); });
  on(root, 'click', '[data-act=remove]', (e, b) => { const r = byId(b.dataset.id); if (r) remove(r); });
  on(root, 'click', '[data-act=perms]', (e, b) => {
    const r = byId(b.dataset.id);
    if (r) AbpAdmin.permissionsEditor.open({ providerName: 'R', providerKey: r.name, title: L('AbpAdmin::Roles:RoleTitle', r.name ?? '') });
  });

  // ---------- move all users ----------
  const moveEl = root.querySelector('#r-move');
  const moveSheet = makeSheet(moveEl);
  let moving = null;
  function openMove(r) {
    moving = r;
    render(moveEl, html`<form>
      <header class="sh-head">
        <h2 id="rm-title">${L('AbpAdmin::Roles:MoveUsers')} <small>${r.name}</small></h2>
        <button type="button" class="icon-btn" data-act="move-close" aria-label="${L('AbpAdmin::Common:Close')}">${icon(IC.close)}</button>
      </header>
      <div class="sh-body form">
        <p class="muted">${L('AbpAdmin::Roles:MoveUsersIntro', r.name ?? '')}</p>
        <label class="field"><span>${L('AbpAdmin::Roles:MoveTo')}</span>
          <select class="input" name="target"><option value="">${L('AbpAdmin::Roles:MoveToNone')}</option>
            ${state.rows.filter(x => x.id !== r.id).map(x => html`<option value="${x.id}">${x.name}</option>`)}</select></label>
      </div>
      <footer class="sh-foot"><span class="spacer"></span>
        <button type="button" class="btn" data-act="move-close">${L('AbpAdmin::Common:Cancel')}</button>
        <button class="btn primary" type="submit">${L('AbpAdmin::Roles:MoveUsersGo')}</button></footer>
    </form>`);
    moveSheet.open();
  }
  moveEl.addEventListener('submit', async e => {
    e.preventDefault();
    const target = String(new FormData(e.target).get('target') ?? '') || null;
    const targetName = state.rows.find(x => x.id === target)?.name;
    e.target.querySelector('[type=submit]').disabled = true;
    try {
      const res = await api.post(`/api/abp-admin/role-users/${moving.id}/move-all-users`, { targetRoleId: target });
      toast.ok(targetName ? L('AbpAdmin::Roles:MovedTo', String(res.moved ?? 0), moving.name ?? '', targetName) : L('AbpAdmin::Roles:MovedOut', String(res.moved ?? 0), moving.name ?? ''));
      moveSheet.close();
    } catch (ex) { e.target.querySelector('[type=submit]').disabled = false; toast.error(errorText(ex)); }
  });
  on(moveEl, 'click', '[data-act=move-close]', () => moveSheet.close());
  on(root, 'click', '[data-act=move]', (e, b) => { const r = byId(b.dataset.id); if (r) openMove(r); });
  on(root, 'click', '[data-act=claims]', (e, b) => {
    const r = byId(b.dataset.id);
    if (r) AbpAdmin.claimsEditor.open({ kind: 'role', id: r.id, title: r.name, editable: can('AbpIdentity.Roles.Update') });
  });

  drawFail(); drawList(); load();
  if (params().get('new') === '1' && can('AbpIdentity.Roles.Create')) openForm(null);
})();
