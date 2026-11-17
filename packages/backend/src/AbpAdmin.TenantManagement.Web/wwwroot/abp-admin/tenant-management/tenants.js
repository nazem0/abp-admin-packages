// Tenants: create, rename, enable/disable, delete, the multi-tenancy switch and per-tenant databases. Port of tenants.page.ts.
(function () {
  const { html, render, icon, on, api, L, can, fmt, toast, errorText, sheet, params, pageUrl } = AbpAdmin;
  const changesPage = can('AbpAdmin.AuditLogs') && pageUrl('EntityChanges');
  const root = document.getElementById('abp-tenants');
  const API = '/api/abp-admin/tenant';
  const CLOSE = 'M6 6l12 12M18 6 6 18';
  const canDb = can('AbpAdmin.Tenants.ManageConnectionStrings');

  const state = { filter: '', items: [], total: 0, loading: false, error: false, enabled: false, modeLoading: true, switching: false, busy: null, confirming: null };
  let seq = 0;

  // ---------- page shell (rendered once; list/multi-tenancy card re-render on their own) ----------
  render(root, html`
    <header class="top">
      <div>
        <h1>${L('AbpAdmin::Tenants:Title')}</h1>
        <p class="muted">${L('AbpAdmin::Tenants:Subtitle')}</p>
      </div>
      ${can('AbpAdmin.Tenants.Create') ? html`<button class="btn primary" data-act="new">${icon('M12 5v14M5 12h14')} ${L('AbpAdmin::Tenants:New')}</button>` : ''}
    </header>
    <section class="card mt" id="tn-mode"></section>
    <section class="card stream">
      <div class="filters">
        <label class="search">
          ${icon('M20 20l-3.5-3.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z')}
          <input class="input" type="search" id="tn-filter" placeholder="${L('AbpAdmin::Tenants:SearchPlaceholder')}" aria-label="${L('AbpAdmin::Tenants:Search')}" />
        </label>
      </div>
      <div id="tn-list"></div>
    </section>
    <dialog id="tn-form" class="narrow" aria-labelledby="tf-title"></dialog>
    <dialog id="tn-db" class="narrow" aria-labelledby="td-title"></dialog>
    <dialog id="tn-feat" aria-labelledby="tft-title"></dialog>
    <dialog id="tn-admin" class="narrow" aria-labelledby="ta-title"></dialog>`);
  const $ = id => document.getElementById(id);
  const formSheet = sheet($('tn-form'));
  const dbSheet = sheet($('tn-db'));

  // ---------- data ----------
  async function loadMode() {
    try { state.enabled = !!(await api.get(`${API}/multi-tenancy`)).isEnabled; } catch { /* switch stays off and disabled state clears */ }
    state.modeLoading = false; drawMode();
  }
  async function loadList() {
    const my = ++seq;
    state.loading = true; state.error = false; drawList();
    try {
      const r = await api.get(API, { filter: state.filter, maxResultCount: 200 });
      if (my !== seq) return;
      state.items = r.items ?? []; state.total = r.totalCount ?? 0;
    } catch { if (my !== seq) return; state.error = true; }
    state.loading = false; drawList();
  }

  // ---------- multi-tenancy card ----------
  function drawMode() {
    const el = $('tn-mode');
    el.classList.toggle('off', !state.enabled);
    render(el, html`<label class="check">
      <input type="checkbox" class="switch" role="switch" data-act="multi" ${state.enabled ? 'checked' : ''}
             ${!can('AbpAdmin.Tenants.ManageMultiTenancy') || state.modeLoading || state.switching ? 'disabled' : ''} />
      <span><b>${L(state.enabled ? 'AbpAdmin::Tenants:MultiOn' : 'AbpAdmin::Tenants:MultiOff')}</b>
        <small>${L(state.enabled ? 'AbpAdmin::Tenants:MultiOnHint' : 'AbpAdmin::Tenants:MultiOffHint')}</small></span>
    </label>`);
  }

  // ---------- list ----------
  function rowView(t) {
    const name = t.name ?? '';
    return html`<tr class="${t.isActive ? '' : 'inactive'}">
      <td><span class="who-cell"><span class="avatar sq" aria-hidden="true">${(name || '?')[0].toUpperCase()}</span><b>${name}</b></span></td>
      <td>
        <label class="status">
          <input type="checkbox" class="switch" role="switch" data-act="active" data-id="${t.id}" ${t.isActive ? 'checked' : ''}
                 ${!can('AbpAdmin.Tenants.Update') || state.busy === t.id ? 'disabled' : ''}
                 aria-label="${L(t.isActive ? 'AbpAdmin::Tenants:DisableAria' : 'AbpAdmin::Tenants:EnableAria', name)}" />
          <span class="pill ${t.isActive ? 'tone-ok' : 'tone-warn'}">${L(t.isActive ? 'AbpAdmin::Common:Active' : 'AbpAdmin::Common:Disabled')}</span>
        </label>
      </td>
      <td><span class="pill ${t.hasOwnDatabase ? 'tone-accent' : ''}">${L(t.hasOwnDatabase ? 'AbpAdmin::Tenants:Own' : 'AbpAdmin::Tenants:Shared')}</span></td>
      <td class="hide-sm muted">${fmt.relative(t.creationTime)}</td>
      <td class="actions">${state.confirming === t.id
        ? html`<span class="confirm">${L('AbpAdmin::Tenants:DeleteConfirm', name)}
            <button class="btn sm danger" data-act="delete" data-id="${t.id}">${L('AbpAdmin::Common:Delete')}</button>
            <button class="btn sm" data-act="cancel">${L('AbpAdmin::Common:Cancel')}</button></span>`
        : html`${canDb ? html`<button class="icon-btn" data-act="db" data-id="${t.id}" title="${L('AbpAdmin::Tenants:Database')}" aria-label="${L('AbpAdmin::Tenants:DatabaseAria', name)}">${icon('M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5M19 5.5c0 1.4-3.1 2.5-7 2.5S5 6.9 5 5.5 8.1 3 12 3s7 1.1 7 2.5z')}</button>` : ''}
          ${can('AbpAdmin.Tenants.ManageFeatures') ? html`<button class="icon-btn" data-act="features" data-id="${t.id}" title="${L('AbpAdmin::Tenants:Features')}" aria-label="${L('AbpAdmin::Tenants:FeaturesOf', name)}">${icon('M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4')}</button>` : ''}
          ${can('AbpAdmin.Tenants.ManageUsers') ? html`<button class="icon-btn" data-act="admins" data-id="${t.id}" title="${L('AbpAdmin::Tenants:Admins')}" aria-label="${L('AbpAdmin::Tenants:AdminsOf', name)}">${icon('M2.5 20a6.5 6.5 0 0 1 13 0M17 8h5M19.5 5.5v5M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z')}</button>` : ''}
          ${changesPage ? html`<a class="icon-btn" href="${changesPage + AbpAdmin.query({ type: 'Volo.Abp.TenantManagement.Tenant', id: t.id })}" title="${L('AbpAdmin::Common:ChangeHistory')}" aria-label="${L('AbpAdmin::Common:ChangeHistoryOf', name)}">${icon('M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5')}</a>` : ''}
          ${can('AbpAdmin.Tenants.Update') ? html`<button class="icon-btn" data-act="edit" data-id="${t.id}" title="${L('AbpAdmin::Tenants:Rename')}" aria-label="${L('AbpAdmin::Tenants:RenameAria', name)}">${icon('M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4')}</button>` : ''}
          ${can('AbpAdmin.Tenants.Delete') ? html`<button class="icon-btn" data-act="confirm" data-id="${t.id}" title="${L('AbpAdmin::Common:Delete')}" aria-label="${L('AbpAdmin::Tenants:DeleteAria', name)}">${icon('M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3')}</button>` : ''}`}
      </td>
    </tr>`;
  }

  function drawList() {
    const el = $('tn-list');
    if (state.error) return render(el, html`<div class="state err">${L('AbpAdmin::Tenants:LoadError')} <button class="btn" data-act="reload">${L('AbpAdmin::Common:Retry')}</button></div>`);
    if (state.loading && !state.items.length) return render(el, html`<div class="skeleton rows"><i></i><i></i></div>`);
    if (!state.items.length) return render(el, html`<div class="state empty"><b>${L('AbpAdmin::Tenants:Empty')}</b>
      <span class="muted">${state.filter ? L('AbpAdmin::Tenants:NoMatch', state.filter) : L('AbpAdmin::Tenants:CreateFirst')}</span></div>`);
    render(el, html`<table class="table">
      <thead><tr><th>${L('AbpAdmin::Tenants:Tenant')}</th><th>${L('AbpAdmin::Common:Status')}</th><th>${L('AbpAdmin::Tenants:Database')}</th>
        <th class="hide-sm">${L('AbpAdmin::Common:Created')}</th><th><span class="sr-only">${L('AbpAdmin::Common:Actions')}</span></th></tr></thead>
      <tbody>${state.items.map(rowView)}</tbody>
    </table>
    <footer class="pager"><span class="muted">${L(state.total === 1 ? 'AbpAdmin::Tenants:CountOne' : 'AbpAdmin::Tenants:CountMany', String(state.total))}</span></footer>`);
  }

  // ---------- shared sheet pieces ----------
  const closeBtn = () => html`<button type="button" class="icon-btn" data-act="close" aria-label="${L('AbpAdmin::Common:Close')}">${icon(CLOSE)}</button>`;
  const dbChoice = own => html`<div class="field" role="radiogroup" aria-label="${L('AbpAdmin::Tenants:Database')}">
    <span>${L('AbpAdmin::Tenants:Database')}</span>
    <div class="dbseg">
      <label><input type="radio" name="db" value="shared" ${own ? '' : 'checked'} /> ${L('AbpAdmin::Tenants:Shared')}</label>
      <label><input type="radio" name="db" value="own" ${own ? 'checked' : ''} /> ${L('AbpAdmin::Tenants:ItsOwn')}</label>
    </div></div>`;
  const csField = value => html`<div class="csf">
    <label class="field"><span>${L('AbpAdmin::Tenants:Connection:Label')} <i>*</i></span>
      <textarea class="input mono" name="connectionString" rows="3" required maxlength="1024" spellcheck="false" placeholder="Server=…;Database=acme;…">${value ?? ''}</textarea>
      <small>${L('AbpAdmin::Tenants:Connection:Hint')}</small></label>
    <div class="test"><button type="button" class="btn sm" data-act="test">${L('AbpAdmin::Tenants:Connection:Test')}</button><span class="test-result"></span></div>
  </div>`;

  /** Wires "Test connection" inside a dialog: on(dlg) is delegated, so it survives re-renders of the field. */
  function wireTest(dlg) {
    on(dlg, 'input', 'textarea[name=connectionString]', (e, ta) => { ta.closest('.csf').querySelector('.test-result').replaceChildren(); });
    on(dlg, 'click', '[data-act=test]', async (e, btn) => {
      const box = btn.closest('.csf'), out = box.querySelector('.test-result');
      btn.disabled = true; btn.textContent = L('AbpAdmin::Tenants:Connection:Testing');
      let text, tone;
      try {
        const r = await api.post(`${API}/check-connection-string`, { connectionString: box.querySelector('textarea').value });
        [text, tone] = !r.connected ? [L('AbpAdmin::Tenants:Connection:CantConnect'), 'tone-err']
          : r.databaseExists ? [L('AbpAdmin::Tenants:Connection:ConnectedExists'), 'tone-ok'] : [L('AbpAdmin::Tenants:Connection:ConnectedCreate'), 'tone-ok'];
      } catch (err) { [text, tone] = [errorText(err), 'tone-err']; }
      btn.disabled = false; btn.textContent = L('AbpAdmin::Tenants:Connection:Test');
      render(out, html`<span class="pill ${tone}">${text}</span>`);
    });
  }
  wireTest($('tn-form')); wireTest($('tn-db'));

  const setError = (dlg, text) => render(dlg.querySelector('.err-slot'), text ? html`<span class="alert tone-err">${text}</span>` : '');
  const field = (form, k) => String(new FormData(form).get(k) ?? '');

  // ---------- create / rename sheet ----------
  let editing = null; // tenant being renamed, or null for a new one

  function openForm(tenant) {
    editing = tenant;
    const x = tenant;
    render($('tn-form'), html`<form>
      <header class="sh-head">
        <h2 id="tf-title">${L(x ? 'AbpAdmin::Tenants:Form:Rename' : 'AbpAdmin::Tenants:Form:New')} ${x ? html`<small>${x.name}</small>` : ''}</h2>
        ${closeBtn()}
      </header>
      <div class="sh-body form">
        <label class="field"><span>${L('AbpAdmin::Common:Name')} <i>*</i></span>
          <input class="input" name="name" required maxlength="64" autocomplete="off" value="${x?.name ?? ''}" placeholder="acme" />
          <small>${L('AbpAdmin::Tenants:Form:NameHint')}</small></label>
        ${x ? '' : html`
          <label class="field"><span>${L('AbpAdmin::Tenants:Form:AdminEmail')} <i>*</i></span>
            <input class="input" name="adminEmailAddress" type="email" required maxlength="256" autocomplete="off" placeholder="admin@acme.com" /></label>
          <label class="field"><span>${L('AbpAdmin::Tenants:Form:AdminPassword')} <i>*</i></span>
            <input class="input" name="adminPassword" type="password" required maxlength="128" autocomplete="new-password" />
            <small>${L('AbpAdmin::Tenants:Form:AdminPasswordHint', 'admin')}</small></label>
          ${canDb ? html`<div data-slot="choice">${dbChoice(false)}</div><div data-slot="cs"></div>` : ''}`}
      </div>
      <footer class="sh-foot">
        <span class="err-slot"></span>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="close">${L('AbpAdmin::Common:Cancel')}</button>
        <button class="btn primary" data-save>${L(x ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Tenants:Form:CreateTenant')}</button>
      </footer>
    </form>`);
    formSheet.open();
    $('tn-form').querySelector('input[name=name]').focus();
  }

  on($('tn-form'), 'change', 'input[name=db]', (e, r) => {
    render($('tn-form').querySelector('[data-slot=cs]'), r.value === 'own' ? csField('') : '');
  });
  on($('tn-form'), 'click', '[data-act=close]', () => formSheet.close());
  on($('tn-form'), 'submit', 'form', async (e, form) => {
    e.preventDefault();
    const text = k => field(form, k).trim();
    const name = text('name');
    const btn = form.querySelector('[data-save]');
    const own = form.querySelector('input[name=db]:checked')?.value === 'own';
    btn.disabled = true; btn.textContent = L('AbpAdmin::Common:Saving'); setError($('tn-form'), '');
    try {
      if (editing) await api.put(`${API}/${editing.id}`, { name });
      else await api.post(API, { name, adminEmailAddress: text('adminEmailAddress'), adminPassword: field(form, 'adminPassword'), connectionString: own ? text('connectionString') : null });
      toast.ok(L(editing ? 'AbpAdmin::Tenants:Form:Renamed' : 'AbpAdmin::Tenants:Form:Created', name));
      formSheet.close(); loadList();
    } catch (err) {
      btn.disabled = false; btn.textContent = L(editing ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Tenants:Form:CreateTenant'); setError($('tn-form'), errorText(err));
    }
  });

  // ---------- database sheet ----------
  let dbTenant = null;

  function dbBody(own) {
    return html`${dbChoice(own)}
      ${own ? html`${csField(dbBody.cs)}
        <details class="admin" ${dbTenant.hasOwnDatabase ? '' : 'open'}>
          <summary>${L('AbpAdmin::Tenants:Db:AdminSummary')}</summary>
          <p class="muted">${L('AbpAdmin::Tenants:Db:AdminNote', 'admin@abp.io', '1q2w3E*')}</p>
          <label class="field"><span>${L('AbpAdmin::Tenants:Form:AdminEmail')}</span>
            <input class="input" name="adminEmailAddress" type="email" maxlength="256" autocomplete="off" /></label>
          <label class="field"><span>${L('AbpAdmin::Tenants:Form:AdminPassword')}</span>
            <input class="input" name="adminPassword" type="password" maxlength="128" autocomplete="new-password" /></label>
        </details>` : ''}
      <p class="alert tone-warn">${L(own ? 'AbpAdmin::Tenants:Db:WarnOwn' : 'AbpAdmin::Tenants:Db:WarnShared')}</p>`;
  }

  async function openDb(t) {
    dbTenant = t; dbBody.cs = '';
    const draw = body => render($('tn-db'), html`<form>
      <header class="sh-head">
        <h2 id="td-title">${L('AbpAdmin::Tenants:Database')} <small>${t.name}</small></h2>
        ${closeBtn()}
      </header>
      <div class="sh-body form" data-slot="body">${body}</div>
      <footer class="sh-foot">
        <span class="err-slot"></span>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="close">${L('AbpAdmin::Common:Cancel')}</button>
        <button class="btn primary" data-save ${body === null ? 'disabled' : ''}>${L('AbpAdmin::Common:Save')}</button>
      </footer>
    </form>`);
    draw(html`<div class="skeleton rows"><i></i></div>`);
    $('tn-db').querySelector('[data-save]').disabled = true;
    dbSheet.open();
    try {
      dbBody.cs = (await api.get(`${API}/${t.id}/connection-string`)).connectionString ?? '';
      if (dbTenant !== t) return;
      draw(dbBody(!!t.hasOwnDatabase));
    } catch {
      if (dbTenant !== t) return;
      draw(html`<div class="state err">${L('AbpAdmin::Tenants:Db:LoadError')} <button type="button" class="btn" data-act="db-retry">${L('AbpAdmin::Common:Retry')}</button></div>`);
      $('tn-db').querySelector('[data-save]').disabled = true;
    }
  }

  on($('tn-db'), 'change', 'input[name=db]', (e, r) => render($('tn-db').querySelector('[data-slot=body]'), dbBody(r.value === 'own')));
  on($('tn-db'), 'click', '[data-act=close]', () => dbSheet.close());
  on($('tn-db'), 'click', '[data-act=db-retry]', () => openDb(dbTenant));
  on($('tn-db'), 'submit', 'form', async (e, form) => {
    e.preventDefault();
    const t = dbTenant, btn = form.querySelector('[data-save]');
    const own = form.querySelector('input[name=db]:checked')?.value === 'own';
    const text = k => field(form, k).trim() || null;
    btn.disabled = true; btn.textContent = L('AbpAdmin::Tenants:Db:SettingUp'); setError($('tn-db'), '');
    try {
      await api.put(`${API}/${t.id}/connection-string`, {
        connectionString: own ? text('connectionString') : null,
        adminEmailAddress: own ? text('adminEmailAddress') : null,
        adminPassword: own ? (field(form, 'adminPassword') || null) : null,
      });
      toast.ok(L(own ? 'AbpAdmin::Tenants:Db:UsesOwn' : 'AbpAdmin::Tenants:Db:UsesShared', t.name));
      dbSheet.close(); loadList();
    } catch (err) {
      btn.disabled = false; btn.textContent = L('AbpAdmin::Common:Save'); setError($('tn-db'), errorText(err));
    }
  });

  // ---------- features of one tenant (the Features page's editor, mounted for the tenant) ----------
  const featSheet = sheet($('tn-feat'));
  function openFeatures(t) {
    render($('tn-feat'), html`<header class="sh-head">
        <h2 id="tft-title">${L('AbpAdmin::Tenants:Features')} <small>${t.name}</small></h2>
        <button type="button" class="icon-btn" data-close aria-label="${L('AbpAdmin::Common:Close')}">${icon(CLOSE)}</button></header>
      <div class="sh-body"><div id="abp-features"></div></div>`);
    $('tn-feat').querySelector('[data-close]').addEventListener('click', () => featSheet.close());
    AbpAdmin.features.mount($('tn-feat').querySelector('#abp-features'), t.id);
    featSheet.open();
  }

  // ---------- administrators: set a password, invite by email ----------
  const adminSheet = sheet($('tn-admin'));
  let adminTenant = null;
  function openAdmins(t) {
    adminTenant = t;
    render($('tn-admin'), html`<header class="sh-head">
        <h2 id="ta-title">${L('AbpAdmin::Tenants:Admins')} <small>${t.name}</small></h2>
        <button type="button" class="icon-btn" data-close aria-label="${L('AbpAdmin::Common:Close')}">${icon(CLOSE)}</button></header>
      <div class="sh-body form">
        <form class="ta-block" data-form="password" autocomplete="off">
          <h3>${L('AbpAdmin::Tenants:SetPassword')}</h3>
          <label class="field"><span>${L('AbpAdmin::Tenants:UserName')}</span><input class="input" name="userName" required maxlength="256" value="admin" /></label>
          <label class="field"><span>${L('AbpAdmin::Users:Form:Password')} <i>*</i></span><input class="input" name="password" type="password" required maxlength="128" autocomplete="new-password" /></label>
          <button class="btn" type="submit">${L('AbpAdmin::Tenants:SetPassword')}</button>
        </form>
        <form class="ta-block" data-form="invite" autocomplete="off">
          <h3>${L('AbpAdmin::Tenants:Invite')}</h3>
          <p class="muted">${L('AbpAdmin::Tenants:InviteIntro')}</p>
          <label class="field"><span>${L('AbpAdmin::Users:Email')} <i>*</i></span><input class="input" name="email" type="email" required maxlength="256" placeholder="owner@example.com" /></label>
          <button class="btn" type="submit">${L('AbpAdmin::Tenants:InviteSend')}</button>
          <div id="ta-result"></div>
        </form>
        <span id="ta-error" class="alert tone-err" hidden></span>
      </div>`);
    $('tn-admin').querySelector('[data-close]').addEventListener('click', () => adminSheet.close());
    adminSheet.open();
  }
  $('tn-admin').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target, fd = new FormData(form), t = adminTenant, err = $('ta-error'), btn = form.querySelector('[type=submit]');
    btn.disabled = true; err.hidden = true;
    try {
      if (form.dataset.form === 'password') {
        const userName = String(fd.get('userName') ?? '').trim();
        await api.post(`/api/abp-admin/tenant-admin/${t.id}/set-password`, { userName, password: String(fd.get('password') ?? '') });
        form.reset();
        toast.ok(L('AbpAdmin::Tenants:PasswordSet', userName, t.name));
      } else {
        const i = await api.post(`/api/abp-admin/tenant-admin/${t.id}/invite-admin`, { email: String(fd.get('email') ?? '').trim() });
        render($('ta-result'), html`<div class="alert ${i.emailSent ? 'tone-ok' : 'tone-warn'}" role="status">
          ${L(i.emailSent ? 'AbpAdmin::Tenants:InviteSent' : 'AbpAdmin::Tenants:InviteNotSent', i.userName ?? '')}
          <span class="ta-link"><input class="input mono" readonly value="${i.link}" /><button type="button" class="btn sm" data-copy>${L('AbpAdmin::Common:Copy')}</button></span>
          <small class="muted">${L('AbpAdmin::Tenants:InviteExpires', fmt.stamp ? fmt.stamp(i.expiresAt) : new Date(i.expiresAt).toLocaleString())}</small></div>`);
        $('ta-result').querySelector('[data-copy]').addEventListener('click', () =>
          navigator.clipboard?.writeText(i.link).then(() => toast.ok(L('AbpAdmin::Common:Copied'))));
      }
    } catch (ex) { err.textContent = errorText(ex); err.hidden = false; }
    btn.disabled = false;
  });

  // ---------- page events ----------
  const byId = id => state.items.find(t => t.id === id);
  on(root, 'click', '[data-act]', (e, el) => {
    const { act, id } = el.dataset;
    if (act === 'new') openForm(null);
    else if (act === 'edit') openForm(byId(id));
    else if (act === 'db') openDb(byId(id));
    else if (act === 'features') openFeatures(byId(id));
    else if (act === 'admins') openAdmins(byId(id));
    else if (act === 'reload') loadList();
    else if (act === 'confirm') { state.confirming = id; drawList(); }
    else if (act === 'cancel') { state.confirming = null; drawList(); }
    else if (act === 'delete') remove(byId(id));
  });
  on(root, 'change', '[data-act=active]', async (e, box) => {
    const t = byId(box.dataset.id), active = box.checked;
    state.busy = t.id; box.disabled = true;
    try {
      await api.post(`${API}/${t.id}/${active ? 'activate' : 'deactivate'}`);
      state.busy = null; toast.ok(L(active ? 'AbpAdmin::Tenants:Enabled' : 'AbpAdmin::Tenants:Disabled', t.name)); loadList();
    } catch (err) { state.busy = null; box.checked = !active; box.disabled = false; toast.error(errorText(err)); }
  });
  on(root, 'change', '[data-act=multi]', async (e, box) => {
    const isEnabled = box.checked;
    state.switching = true; box.disabled = true;
    try {
      await api.put(`${API}/multi-tenancy`, { isEnabled });
      state.switching = false; state.enabled = isEnabled; toast.ok(L(isEnabled ? 'AbpAdmin::Tenants:MultiOnToast' : 'AbpAdmin::Tenants:MultiOffToast'));
    } catch (err) { state.switching = false; toast.error(errorText(err)); }
    drawMode(); // also restores the box after a failed switch
  });
  async function remove(t) {
    try { await api.delete(`${API}/${t.id}`); state.confirming = null; toast.ok(L('AbpAdmin::Tenants:Deleted', t.name)); loadList(); }
    catch (err) { state.confirming = null; toast.error(errorText(err)); drawList(); }
  }
  const setFilter = e => { const v = e.target.value.trim(); if (v !== state.filter) { state.filter = v; loadList(); } };
  on(root, 'change', '#tn-filter', setFilter);
  root.addEventListener('search', e => { if (e.target.id === 'tn-filter') setFilter(e); }, true);

  drawMode(); loadMode(); loadList();
  if (params().get('new') === '1' && can('AbpAdmin.Tenants.Create')) openForm(null); // ?new=1 deep link
})();
