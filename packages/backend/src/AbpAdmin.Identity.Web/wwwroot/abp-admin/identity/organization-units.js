// Organization units page (port of organization-units.page.ts): a tree of departments/teams. Members get every role assigned
// to their unit and its parent units, so the tree is a way to hand out permissions by structure.
(function () {
  const { html, render, icon, on, api, L, can, toast, errorText } = AbpAdmin;
  const root = document.getElementById('abp-ous');
  const BASE = '/api/abp-admin/organization-unit';
  const IC = {
    plus: 'M12 5v14M5 12h14', search: 'M20 20l-3.5-3.5', edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', del: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', chev: 'M9 6l6 6-6 6', x: 'M6 6l12 12M18 6 6 18',
    pick: 'M9 4h6v4H9zM4 16h6v4H4zM14 16h6v4h-6zM12 8v4M7 16v-2h10v2',
  };
  const manageTree = can('AbpAdmin.OrganizationUnits.ManageTree');
  const manageMembers = can('AbpAdmin.OrganizationUnits.ManageMembers');
  const manageRoles = can('AbpAdmin.OrganizationUnits.ManageRoles');

  const state = {
    list: [], loading: true, error: false, collapsed: new Set(),
    adding: undefined, // parent id being added to; null = root; undefined = not adding
    selectedId: null, tab: 'members', renaming: false, confirmDelete: false,
    picking: null, picked: new Set(), memberFilter: '', userQuery: '',
    members: [], roles: [], userCands: [], allRoles: [],
  };
  let mseq = 0, rseq = 0, useq = 0, timer = 0;

  render(root, html`
    <header class="top">
      <div><h1>${L('AbpAdmin::OrganizationUnits:Title')}</h1><p class="muted">${L('AbpAdmin::OrganizationUnits:Subtitle')}</p></div>
      ${manageTree ? html`<button class="btn primary" type="button" data-act="add" data-parent="">${icon(IC.plus)} ${L('AbpAdmin::OrganizationUnits:NewRoot')}</button>` : ''}
    </header>
    <div class="split">
      <section class="card tree" id="ou-tree" aria-label="${L('AbpAdmin::OrganizationUnits:TreeLabel')}"></section>
      <section class="card detail" id="ou-detail" aria-live="polite"></section>
    </div>`);
  const treeEl = root.querySelector('#ou-tree');
  const detailEl = root.querySelector('#ou-detail');

  // ---------- tree model ----------
  function nodes() {
    const list = state.list;
    const byId = new Map(list.map(u => [u.id, u]));
    const pathOf = u => (u.parentId && byId.get(u.parentId) ? [...pathOf(byId.get(u.parentId)), byId.get(u.parentId).displayName] : []);
    return list.map(u => ({ ...u, depth: (u.code?.split('.').length ?? 1) - 1, hasChildren: list.some(c => c.parentId === u.id), path: pathOf(u) }));
  }
  function visible(all) {
    const hidden = new Set();
    return all.filter(n => {
      if (n.parentId && (hidden.has(n.parentId) || state.collapsed.has(n.parentId))) { hidden.add(n.id); return false; }
      return true;
    });
  }
  const selected = () => nodes().find(n => n.id === state.selectedId) ?? null;
  /** A unit can move anywhere except under itself or its descendants, or to where it already is. */
  const moveTargets = u => nodes().filter(n => n.id !== u.id && n.id !== u.parentId && !n.code?.startsWith(u.code + '.'));

  // ---------- tree view ----------
  const newRow = depth => html`<li class="new" style="--d:${depth}">
    <form data-form="create">
      <input class="input" name="name" data-act="new-name" placeholder="${L('AbpAdmin::OrganizationUnits:UnitName')}" aria-label="${L('AbpAdmin::OrganizationUnits:NewUnitName')}" maxlength="128" required />
      <button class="btn sm primary" type="submit">${L('AbpAdmin::OrganizationUnits:Add')}</button>
      <button type="button" class="btn sm" data-act="add-cancel">${L('AbpAdmin::Common:Cancel')}</button>
    </form></li>`;

  function drawTree() {
    const all = nodes(), vis = visible(all);
    render(treeEl, state.loading && !all.length ? html`<div class="skeleton rows">${[1, 2, 3, 4].map(() => html`<i></i>`)}</div>`
      : state.error ? html`<div class="state err">${L('AbpAdmin::OrganizationUnits:LoadFailed')} <button class="btn" type="button" data-act="reload">${L('AbpAdmin::Common:Retry')}</button></div>`
      : html`<ul role="tree">
        ${state.adding === null ? newRow(0) : ''}
        ${vis.map(n => {
          const coll = state.collapsed.has(n.id), sel = state.selectedId === n.id;
          return html`<li role="treeitem" aria-level="${n.depth + 1}" aria-expanded="${n.hasChildren ? String(!coll) : ''}" aria-selected="${sel}" style="--d:${n.depth}" class="${sel ? 'sel' : ''}">
            <button type="button" class="chev ${n.hasChildren ? '' : 'leaf'}" data-act="toggle" data-id="${n.id}" aria-label="${L(coll ? 'AbpAdmin::OrganizationUnits:Expand' : 'AbpAdmin::OrganizationUnits:Collapse', n.displayName ?? '')}" ${n.hasChildren ? '' : 'disabled'}>
              <svg viewBox="0 0 24 24" aria-hidden="true" class="${coll ? '' : 'open'}"><path d="${IC.chev}" /></svg></button>
            <button type="button" class="name" data-act="select" data-id="${n.id}">
              <span class="folder" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${IC.folder}" /></svg></span>
              <span class="label">${n.displayName}</span>
              <span class="counts" title="${L('AbpAdmin::OrganizationUnits:Counts', n.memberCount + '', n.roleCount + '')}">${n.memberCount}</span>
            </button>
            ${manageTree ? html`<button type="button" class="icon-btn add" data-act="add" data-parent="${n.id}" title="${L('AbpAdmin::OrganizationUnits:AddChild')}" aria-label="${L('AbpAdmin::OrganizationUnits:AddChildAria', n.displayName ?? '')}">${icon(IC.plus)}</button>` : ''}
          </li>${state.adding === n.id ? newRow(n.depth + 1) : ''}`;
        })}
        ${!vis.length && state.adding === undefined ? html`<li class="state empty">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${IC.folder}" /></svg>
          <b>${L('AbpAdmin::OrganizationUnits:NoUnits')}</b><span class="muted">${L('AbpAdmin::OrganizationUnits:NoUnitsHint')}</span></li>` : ''}
      </ul>`);
    const input = treeEl.querySelector('[data-act=new-name]');
    if (input) input.focus();
  }

  // ---------- detail view ----------
  const person = m => ([m.name, m.surname].join(' ').trim() || m.userName);

  function drawPeople() {
    const box = detailEl.querySelector('#ou-people');
    if (!box) return;
    if (state.tab === 'members') {
      render(box, state.members.length ? state.members.map(m => html`<li>
          <span class="avatar" aria-hidden="true">${(m.name || m.userName || '?')[0].toUpperCase()}</span>
          <span class="who"><b>${person(m)}</b><small>@${m.userName} · ${m.email}</small></span>
          ${manageMembers ? html`<button class="icon-btn" type="button" data-act="remove-member" data-id="${m.id}" title="${L('AbpAdmin::OrganizationUnits:RemoveFromUnit')}" aria-label="${L('AbpAdmin::OrganizationUnits:RemoveAria', m.userName ?? '')}">${icon(IC.x)}</button>` : ''}
        </li>`)
        : html`<li class="state empty"><b>${L('AbpAdmin::OrganizationUnits:NoMembers')}</b><span class="muted">${L('AbpAdmin::OrganizationUnits:NoMembersHint')}</span></li>`);
    } else {
      render(box, state.roles.length ? state.roles.map(r => html`<li>
          <span class="avatar sq" aria-hidden="true">${(r.name || '?')[0].toUpperCase()}</span>
          <span class="who"><b>${r.name}</b></span>
          ${manageRoles ? html`<button class="icon-btn" type="button" data-act="remove-role" data-id="${r.id}" title="${L('AbpAdmin::OrganizationUnits:RemoveRole')}" aria-label="${L('AbpAdmin::OrganizationUnits:RemoveRoleAria', r.name ?? '')}">${icon(IC.x)}</button>` : ''}
        </li>`)
        : html`<li class="state empty"><b>${L('AbpAdmin::OrganizationUnits:NoRoles')}</b><span class="muted">${L('AbpAdmin::OrganizationUnits:NoRolesHint')}</span></li>`);
    }
  }

  function candidates() {
    if (state.picking === 'users') {
      const already = new Set(state.members.map(m => m.id));
      return state.userCands.filter(c => !already.has(c.id));
    }
    const already = new Set(state.roles.map(r => r.id));
    return state.allRoles.filter(r => !already.has(r.id));
  }

  function drawCands() {
    const box = detailEl.querySelector('#ou-cands');
    if (!box) return;
    const list = candidates();
    if (state.picking === 'users') {
      render(box, list.length ? list.map(c => html`<li><label class="check"><input type="checkbox" data-act="pick" data-id="${c.id}" ${state.picked.has(c.id) ? 'checked' : ''} />
          <span>${c.name} ${c.surname} <small>@${c.userName} · ${c.email}</small></span></label></li>`)
        : html`<li class="muted">${L(state.userQuery ? 'AbpAdmin::OrganizationUnits:NoMatchingUsers' : 'AbpAdmin::OrganizationUnits:TypeToSearch')}</li>`);
    } else {
      render(box, list.length ? list.map(r => html`<li><label class="check"><input type="checkbox" data-act="pick" data-id="${r.id}" ${state.picked.has(r.id) ? 'checked' : ''} /><span>${r.name}</span></label></li>`)
        : html`<li class="muted">${L('AbpAdmin::OrganizationUnits:AllAssigned')}</li>`);
    }
  }

  function drawPickFoot() {
    const box = detailEl.querySelector('#ou-pickfoot');
    if (!box) return;
    const n = state.picked.size;
    render(box, html`<span class="muted small">${L('AbpAdmin::OrganizationUnits:Selected', String(n))}</span>
      <button class="btn sm" type="button" data-act="pick-cancel">${L('AbpAdmin::Common:Cancel')}</button>
      <button class="btn sm primary" type="button" data-act="${state.picking === 'users' ? 'add-members' : 'add-roles'}" ${n ? '' : 'disabled'}>${L(n ? 'AbpAdmin::OrganizationUnits:AddN' : 'AbpAdmin::OrganizationUnits:Add', String(n))}</button>`);
  }

  function drawDetail() {
    const u = selected();
    if (!u) {
      render(detailEl, html`<div class="state empty pick-one">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${IC.pick}" /></svg>
        <b>${L('AbpAdmin::OrganizationUnits:SelectUnit')}</b><span class="muted">${L('AbpAdmin::OrganizationUnits:SelectUnitHint')}</span></div>`);
      return;
    }
    const targets = manageTree ? moveTargets(u) : [];
    render(detailEl, html`
      <header class="dhead">
        <nav class="crumbs" aria-label="${L('AbpAdmin::OrganizationUnits:UnitPath')}">${u.path.map(p => html`<span>${p}</span><span class="sep" aria-hidden="true">›</span>`)}</nav>
        ${state.renaming ? html`<form class="rename" data-form="rename">
            <input class="input" name="name" value="${u.displayName}" aria-label="${L('AbpAdmin::OrganizationUnits:UnitName')}" maxlength="128" required />
            <button class="btn sm primary" type="submit">${L('AbpAdmin::Common:Save')}</button>
            <button type="button" class="btn sm" data-act="rename-cancel">${L('AbpAdmin::Common:Cancel')}</button>
          </form>`
        : html`<div class="title">
            <h2>${u.displayName}</h2>
            <span class="mono muted small" title="${L('AbpAdmin::OrganizationUnits:HierarchyCode')}">${u.code}</span>
            ${manageTree ? html`<span class="tools">
              <button class="icon-btn" type="button" data-act="rename" title="${L('AbpAdmin::OrganizationUnits:Rename')}" aria-label="${L('AbpAdmin::OrganizationUnits:RenameAria')}">${icon(IC.edit)}</button>
              <select class="input move" data-act="move" aria-label="${L('AbpAdmin::OrganizationUnits:MoveAria')}">
                <option value="" selected disabled>${L('AbpAdmin::OrganizationUnits:MoveTo')}</option>
                ${u.parentId ? html`<option value="root">${L('AbpAdmin::OrganizationUnits:TopLevel')}</option>` : ''}
                ${targets.map(t => html`<option value="${t.id}">${'— '.repeat(t.depth)}${t.displayName}</option>`)}
              </select>
              ${state.confirmDelete ? html`<span class="confirm">${L('AbpAdmin::OrganizationUnits:DeleteWithSub')}
                  <button class="btn sm danger" type="button" data-act="remove">${L('AbpAdmin::Common:Delete')}</button>
                  <button class="btn sm" type="button" data-act="delete-cancel">${L('AbpAdmin::Common:Cancel')}</button></span>`
                : html`<button class="icon-btn" type="button" data-act="delete" title="${L('AbpAdmin::Common:Delete')}" aria-label="${L('AbpAdmin::OrganizationUnits:DeleteAria')}">${icon(IC.del)}</button>`}
            </span>` : ''}
          </div>`}
        <div class="seg" role="tablist" aria-label="${L('AbpAdmin::OrganizationUnits:UnitDetails')}">
          <button type="button" role="tab" data-act="tab" data-tab="members" aria-selected="${state.tab === 'members'}" aria-checked="${state.tab === 'members'}">${L('AbpAdmin::OrganizationUnits:MembersTab', u.memberCount + '')}</button>
          <button type="button" role="tab" data-act="tab" data-tab="roles" aria-selected="${state.tab === 'roles'}" aria-checked="${state.tab === 'roles'}">${L('AbpAdmin::OrganizationUnits:RolesTab', u.roleCount + '')}</button>
        </div>
      </header>
      <div class="pane">
        ${state.tab === 'members' ? html`<div class="bar">
            <label class="search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="${IC.search}" /></svg>
              <input class="input" type="search" data-act="member-filter" value="${state.memberFilter}" placeholder="${L('AbpAdmin::OrganizationUnits:FilterMembers')}" aria-label="${L('AbpAdmin::OrganizationUnits:FilterMembersLabel')}" />
            </label>
            ${manageMembers ? html`<button class="btn" type="button" data-act="picking" data-kind="users" aria-expanded="${state.picking === 'users'}">${L('AbpAdmin::OrganizationUnits:AddMembers')}</button>` : ''}
          </div>`
        : html`<p class="muted small hint">${L('AbpAdmin::OrganizationUnits:RolesHint', u.displayName ?? '')}</p>
          ${manageRoles ? html`<div class="bar"><span></span><button class="btn" type="button" data-act="picking" data-kind="roles" aria-expanded="${state.picking === 'roles'}">${L('AbpAdmin::OrganizationUnits:AddRoles')}</button></div>` : ''}`}
        ${state.picking ? html`<div class="picker">
          ${state.picking === 'users' ? html`<input class="input" type="search" data-act="user-query" value="${state.userQuery}" placeholder="${L('AbpAdmin::OrganizationUnits:SearchUsers')}" aria-label="${L('AbpAdmin::OrganizationUnits:SearchUsersLabel')}" />` : ''}
          <ul id="ou-cands"></ul>
          <div class="pick-foot" id="ou-pickfoot"></div>
        </div>` : ''}
        <ul class="people" id="ou-people"></ul>
      </div>`);
    drawPeople(); drawCands(); drawPickFoot();
    const rn = detailEl.querySelector('.rename input');
    if (rn) rn.focus();
    const uq = detailEl.querySelector('[data-act=user-query]');
    if (uq) uq.focus();
  }

  const draw = () => { drawTree(); drawDetail(); };

  // ---------- data ----------
  async function loadTree() {
    try { state.list = await api.get(`${BASE}/tree`) ?? []; state.error = false; } catch { state.error = true; }
    state.loading = false; draw();
  }
  async function loadMembers() {
    const id = ++mseq;
    if (!state.selectedId) return;
    try {
      const r = await api.get(`${BASE}/${state.selectedId}/members`, { filter: state.memberFilter || undefined, maxResultCount: 200 });
      if (id !== mseq) return;
      state.members = r.items ?? [];
    } catch { if (id !== mseq) return; state.members = []; }
    drawPeople(); drawCands();
  }
  async function loadRoles() {
    const id = ++rseq;
    if (!state.selectedId || state.tab !== 'roles') return;
    try {
      const r = await api.get(`${BASE}/${state.selectedId}/roles`);
      if (id !== rseq) return;
      state.roles = r ?? [];
    } catch { if (id !== rseq) return; state.roles = []; }
    drawPeople(); drawCands();
  }
  async function searchUsers() {
    const id = ++useq;
    if (state.picking !== 'users' || !state.userQuery) { state.userCands = []; drawCands(); return; }
    try {
      const r = await api.get('/api/identity/users', { filter: state.userQuery, maxResultCount: 20 });
      if (id !== useq) return;
      state.userCands = r.items ?? [];
    } catch { if (id !== useq) return; state.userCands = []; }
    drawCands();
  }
  async function loadAllRoles() {
    try { state.allRoles = (await api.get('/api/identity/roles/all')).items ?? []; } catch { state.allRoles = []; }
    drawCands();
  }

  /** Selection or tab changed: the dependent state resets, like the Angular linkedSignals. */
  function resetPicking() { state.picking = null; state.picked = new Set(); state.userQuery = ''; state.userCands = []; }
  function select(id) {
    state.selectedId = id; state.renaming = false; state.confirmDelete = false; state.memberFilter = ''; state.members = []; state.roles = [];
    resetPicking(); draw();
    if (id) { loadMembers(); loadRoles(); }
  }

  const fail = e => toast.error(errorText(e));
  async function run(fn) { try { await fn(); } catch (e) { fail(e); } }

  // ---------- events ----------
  on(root, 'click', '[data-act=reload]', () => { state.loading = true; state.error = false; drawTree(); loadTree(); });
  on(root, 'click', '[data-act=add]', (e, b) => {
    const parent = b.dataset.parent || null;
    if (parent) state.collapsed.delete(parent);
    state.adding = parent; drawTree();
  });
  on(root, 'click', '[data-act=add-cancel]', () => { state.adding = undefined; drawTree(); });
  root.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (e.target.matches('[data-act=new-name]')) { e.stopPropagation(); state.adding = undefined; drawTree(); }
    else if (e.target.closest('.rename')) { e.stopPropagation(); state.renaming = false; drawDetail(); }
  });
  on(root, 'click', '[data-act=toggle]', (e, b) => { const s = state.collapsed; if (s.has(b.dataset.id)) s.delete(b.dataset.id); else s.add(b.dataset.id); drawTree(); });
  on(root, 'click', '[data-act=select]', (e, b) => select(b.dataset.id));

  root.addEventListener('submit', e => {
    e.preventDefault();
    const kind = e.target.dataset.form, name = e.target.elements.name.value.trim();
    if (!name) return;
    if (kind === 'create') run(async () => {
      const parentId = state.adding;
      const ou = await api.post(BASE, { displayName: name, parentId: parentId ?? undefined });
      state.adding = undefined; toast.ok(L('AbpAdmin::OrganizationUnits:Created', ou.displayName ?? ''));
      await loadTree(); select(ou.id);
    });
    else if (kind === 'rename') run(async () => {
      await api.put(`${BASE}/${state.selectedId}`, { displayName: name });
      state.renaming = false; toast.ok(L('AbpAdmin::OrganizationUnits:Renamed')); loadTree();
    });
  });

  on(root, 'click', '[data-act=rename]', () => { state.renaming = true; drawDetail(); });
  on(root, 'click', '[data-act=rename-cancel]', () => { state.renaming = false; drawDetail(); });
  on(root, 'click', '[data-act=delete]', () => { state.confirmDelete = true; drawDetail(); });
  on(root, 'click', '[data-act=delete-cancel]', () => { state.confirmDelete = false; drawDetail(); });
  on(root, 'click', '[data-act=remove]', () => run(async () => {
    const u = selected();
    await api.delete(`${BASE}/${u.id}`);
    toast.ok(L('AbpAdmin::OrganizationUnits:Deleted', u.displayName ?? '')); state.selectedId = null; select(null); loadTree();
  }));
  on(root, 'change', '[data-act=move]', (e, el) => {
    const target = el.value, u = selected();
    el.value = '';
    if (!target || !u) return;
    run(async () => {
      await api.post(`${BASE}/${u.id}/move`, { newParentId: target === 'root' ? undefined : target });
      toast.ok(L('AbpAdmin::OrganizationUnits:Moved', u.displayName ?? '')); loadTree();
    });
  });

  on(root, 'click', '[data-act=tab]', (e, b) => { state.tab = b.dataset.tab; resetPicking(); drawDetail(); loadRoles(); });
  const memberFilter = el => { const v = el.value.trim(); if (v !== state.memberFilter) { state.memberFilter = v; loadMembers(); } };
  on(root, 'change', '[data-act=member-filter]', (e, el) => memberFilter(el));
  root.addEventListener('search', e => { if (e.target.matches('[data-act=member-filter]')) memberFilter(e.target); });
  on(root, 'click', '[data-act=picking]', (e, b) => {
    const kind = b.dataset.kind;
    const was = state.picking;
    resetPicking();
    state.picking = was === kind ? null : kind;
    drawDetail();
    if (state.picking === 'roles') loadAllRoles();
  });
  on(root, 'click', '[data-act=pick-cancel]', () => { resetPicking(); drawDetail(); });
  on(root, 'input', '[data-act=user-query]', (e, el) => {
    state.userQuery = el.value.trim();
    clearTimeout(timer); timer = setTimeout(searchUsers, 200);
  });
  on(root, 'change', '[data-act=pick]', (e, el) => { if (el.checked) state.picked.add(el.dataset.id); else state.picked.delete(el.dataset.id); drawPickFoot(); });

  const afterChange = () => { resetPicking(); loadTree(); };
  on(root, 'click', '[data-act=add-members]', () => run(async () => {
    const u = selected(), n = state.picked.size;
    await api.post(`${BASE}/${u.id}/members`, { ids: [...state.picked] });
    toast.ok(L('AbpAdmin::OrganizationUnits:MembersAdded', String(n), u.displayName ?? '')); afterChange(); loadMembers();
  }));
  on(root, 'click', '[data-act=remove-member]', (e, b) => run(async () => {
    const u = selected(), m = state.members.find(x => x.id === b.dataset.id);
    await api.delete(`${BASE}/${u.id}/member/${b.dataset.id}`);
    toast.ok(L('AbpAdmin::OrganizationUnits:MemberRemoved', m?.userName ?? '')); loadMembers(); loadTree();
  }));
  on(root, 'click', '[data-act=add-roles]', () => run(async () => {
    const u = selected(), n = state.picked.size;
    await api.post(`${BASE}/${u.id}/roles`, { ids: [...state.picked] });
    toast.ok(L('AbpAdmin::OrganizationUnits:RolesAssigned', String(n), u.displayName ?? '')); afterChange(); loadRoles();
  }));
  on(root, 'click', '[data-act=remove-role]', (e, b) => run(async () => {
    const u = selected(), r = state.roles.find(x => x.id === b.dataset.id);
    await api.delete(`${BASE}/${u.id}/role/${b.dataset.id}`);
    toast.ok(L('AbpAdmin::OrganizationUnits:RoleRemoved', r?.name ?? '')); loadRoles(); loadTree();
  }));

  draw(); loadTree();
})();
