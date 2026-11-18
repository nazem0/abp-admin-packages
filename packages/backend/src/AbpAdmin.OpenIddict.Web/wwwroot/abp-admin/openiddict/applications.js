/* OpenIddict client applications (port of applications.page.ts + application-form.component.ts). */
(function () {
  'use strict';
  const { html, render, icon, on, api, L, can, fmt, toast, errorText, params, sheet } = AbpAdmin;
  const root = document.getElementById('abp-applications');
  const URL_ = '/api/abp-admin/application';
  const A = 'AbpAdmin::Applications:';
  const F = A + 'Form:';

  const GRANTS = [
    ['authorization_code', 'AuthorizationCode'], ['refresh_token', 'RefreshToken'], ['client_credentials', 'ClientCredentials'],
    ['password', 'Password'], ['urn:ietf:params:oauth:grant-type:device_code', 'DeviceCode'], ['implicit', 'Implicit'],
  ].map(([value, k]) => ({ value, labelKey: `${A}Grant:${k}`, hintKey: `${A}Grant:${k}Hint` }));
  const STANDARD_SCOPES = ['address', 'email', 'phone', 'profile', 'roles'];
  const INTERACTIVE = ['authorization_code', 'implicit'];
  const CONSENTS = ['Implicit', 'Explicit', 'Systematic', 'External'].map(c => ({ value: c.toLowerCase(), labelKey: `${F}Consent${c}` }));
  const ICON = {
    plus: 'M12 5v14M5 12h14', edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', shield: 'M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6zM9 12l2 2 4-4',
    del: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', close: 'M6 6l12 12M18 6 6 18', box: 'M4 5h16v14H4zM4 9h16',
  };

  const state = { filter: '', page: 0, size: AbpAdmin.pageSize(20), rows: [], total: 0, loading: true, error: false, confirming: null };

  render(root, html`
    <header class="top">
      <div><h1>${L(A + 'Title')}</h1><p class="muted">${L(A + 'Subtitle')}</p></div>
      ${can('AbpAdmin.Applications.Create') ? html`<button class="btn primary" data-act="new">${icon(ICON.plus)} ${L(A + 'New')}</button>` : ''}
    </header>
    <section class="card stream">
      <div class="filters">
        <label class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input class="input" type="search" id="ap-search" placeholder="${L(A + 'SearchPlaceholder')}" aria-label="${L(A + 'Search')}" />
        </label>
      </div>
      <div id="ap-list"></div>
    </section>
    <div id="ap-sheet"></div>`);
  const listEl = root.querySelector('#ap-list');
  const sheetHost = root.querySelector('#ap-sheet');

  const grantLabel = g => { const k = GRANTS.find(x => x.value === g); return k ? L(k.labelKey) : g; };
  const summary = a => {
    const n = a.scopes?.length ?? 0, r = a.redirectUris?.length ?? 0;
    return [L(A + (n === 1 ? 'ScopeOne' : 'ScopeMany'), n), L(A + (r === 1 ? 'RedirectOne' : 'RedirectMany'), r), L(A + 'CreatedAgo', fmt.relative(a.creationTime))].join(' · ');
  };

  function draw() {
    const s = state;
    render(listEl, s.error ? html`<div class="state err">${L(A + 'LoadError')} <button class="btn" data-act="retry">${L('AbpAdmin::Common:Retry')}</button></div>`
      : s.loading && !s.rows.length ? html`<div class="skeleton rows"><i></i><i></i><i></i></div>`
      : !s.rows.length ? html`<div class="state empty">${icon(ICON.box)}<b>${L(A + 'Empty')}</b>
          <span class="muted">${s.filter ? L(A + 'NoMatch', s.filter) : L(A + 'RegisterFirst')}</span></div>`
      : html`<ul class="apps">${s.rows.map(row)}</ul>
          ${AbpAdmin.pager(s.total, s.page, s.size)}`);
  }

  function row(a) {
    const name = a.displayName || a.clientId;
    return html`<li class="app">
      <span class="logo" aria-hidden="true">${a.logoUri ? html`<img src="${a.logoUri}" alt="" />` : (name || '?')[0].toUpperCase()}</span>
      <span class="main">
        <span class="name"><b>${name}</b>
          <span class="pill tone-${a.clientType === 'confidential' ? 'accent' : 'info'}">${L(A + (a.clientType === 'confidential' ? 'Confidential' : 'Public'))}</span></span>
        <span class="mono muted">${a.clientId}</span>
        <span class="grants">${(a.grantTypes ?? []).map(g => html`<span class="tag">${grantLabel(g)}</span>`)}
          ${a.requirePkce ? html`<span class="tag ok">PKCE</span>` : ''}<span class="muted small">${summary(a)}</span></span>
      </span>
      <span class="actions">${state.confirming === a.id ? html`
        <span class="confirm">${L(A + 'DeleteConfirm', a.clientId)}
          <button class="btn sm danger" data-act="remove" data-id="${a.id}">${L('AbpAdmin::Common:Delete')}</button>
          <button class="btn sm" data-act="cancel-delete">${L('AbpAdmin::Common:Cancel')}</button></span>` : html`
        ${can('AbpAdmin.Applications.Update') ? html`<button class="icon-btn" data-act="edit" data-id="${a.id}" title="${L('AbpAdmin::Common:Edit')}" aria-label="${L(A + 'EditAria', a.clientId)}">${icon(ICON.edit)}</button>` : ''}
        ${can('AbpAdmin.Applications.ManagePermissions') ? html`<button class="icon-btn" data-act="perms" data-id="${a.id}" title="${L(A + 'PermissionsTitle')}" aria-label="${L(A + 'PermissionsAria', a.clientId)}">${icon(ICON.shield)}</button>` : ''}
        ${can('AbpAdmin.Applications.Delete') ? html`<button class="icon-btn" data-act="ask-delete" data-id="${a.id}" title="${L('AbpAdmin::Common:Delete')}" aria-label="${L(A + 'DeleteAria', a.clientId)}">${icon(ICON.del)}</button>` : ''}`}
      </span></li>`;
  }

  async function load() {
    if (state.filter !== state.pagedFilter) { state.page = 0; state.pagedFilter = state.filter; }
    state.loading = true; state.error = false; draw();
    try {
      const page = await api.get(URL_, { filter: state.filter || undefined, skipCount: state.page * state.size, maxResultCount: state.size });
      state.rows = page.items ?? []; state.total = page.totalCount ?? 0;
      if (AbpAdmin.pastEnd(state)) return load();
    } catch { state.error = true; }
    state.loading = false; draw();
  }

  const byId = id => state.rows.find(a => a.id === id);
  const search = root.querySelector('#ap-search');
  const applyFilter = () => { const v = search.value.trim(); if (v !== state.filter) { state.filter = v; load(); } };
  search.addEventListener('change', applyFilter);
  search.addEventListener('search', applyFilter);

  on(root, 'click', '[data-act=new]', () => openForm(null));
  on(root, 'click', '[data-act=retry]', load);
  on(root, 'click', '[data-act=edit]', (e, el) => openForm(byId(el.dataset.id)));
  on(root, 'click', '[data-act=ask-delete]', (e, el) => { state.confirming = el.dataset.id; draw(); });
  on(root, 'click', '[data-act=cancel-delete]', () => { state.confirming = null; draw(); });
  on(root, 'click', '[data-act=remove]', async (e, el) => {
    const a = byId(el.dataset.id);
    try { await api.delete(`${URL_}/${a.id}`); state.confirming = null; toast.ok(L(A + 'Deleted', a.clientId)); load(); }
    catch (err) { state.confirming = null; draw(); toast.error(errorText(err)); }
  });
  // Client permissions apply to tokens the client gets for itself (client_credentials), not to signed-in users.
  on(root, 'click', '[data-act=perms]', (e, el) => {
    const a = byId(el.dataset.id);
    AbpAdmin.permissionsEditor.open({ providerName: 'C', providerKey: a.clientId, title: L(A + 'ClientTitle', a.displayName || a.clientId) });
  });

  // ---------- create / edit form ----------
  async function openForm(x) {
    const st = {
      selected: new Set(x?.grantTypes ?? ['authorization_code', 'refresh_token']),
      custom: (x?.grantTypes ?? []).filter(g => !GRANTS.some(k => k.value === g)),
      type: x?.clientType ?? 'public',
    };
    let scopeApi = [];
    try { scopeApi = (await api.get('/api/abp-admin/scope', { maxResultCount: 1000 })).items ?? []; } catch { /* standard scopes still work */ }
    const scopes = [...STANDARD_SCOPES.map(name => ({ name, hint: L(F + 'StandardScope') })), ...scopeApi.map(s => ({ name: s.name, hint: s.displayName ?? s.name }))];
    // Keep scopes the client already has, even if their definition was removed.
    for (const s of x?.scopes ?? []) if (!scopes.some(a => a.name === s)) scopes.push({ name: s, hint: L(F + 'NotDefined') });
    const interactive = () => INTERACTIVE.some(g => st.selected.has(g));
    const confidentialExisting = x?.clientType === 'confidential';

    const dialog = document.createElement('dialog');
    dialog.className = 'af';
    dialog.setAttribute('aria-labelledby', 'af-title');
    const sh = sheet(dialog, { onClose: () => dialog.remove() });
    const sel = (v, cur) => (v === cur ? 'selected' : '');

    render(dialog, html`<form>
      <header class="sh-head">
        <span class="avatar sq" aria-hidden="true">${(x?.displayName || x?.clientId || '+')[0].toUpperCase()}</span>
        <h2 id="af-title">${L(x ? F + 'Edit' : F + 'New')} ${x ? html`<small class="mono">${x.clientId}</small>` : ''}</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="${L('AbpAdmin::Common:Close')}">${icon(ICON.close)}</button>
      </header>
      <div class="sh-body form">
        <div class="grid-2">
          <label class="field"><span>${L(F + 'ClientId')} <i>*</i></span>
            <input class="input mono" name="clientId" required maxlength="100" autocomplete="off" pattern="[^\\s]+" title="${L(F + 'NoSpaces')}" value="${x?.clientId ?? ''}" placeholder="MyApp_Web" /></label>
          <label class="field"><span>${L('AbpAdmin::Common:DisplayName')}</span>
            <input class="input" name="displayName" maxlength="200" value="${x?.displayName ?? ''}" placeholder="My web app" /></label>
        </div>

        <fieldset>
          <legend>${L(F + 'ClientType')}</legend>
          <div class="choice">
            <label data-choice="public"><input type="radio" name="clientType" value="public" ${st.type === 'public' ? 'checked' : ''} />
              <b>${L(F + 'Public')}</b><small>${L(F + 'PublicHint')}</small></label>
            <label data-choice="confidential"><input type="radio" name="clientType" value="confidential" ${st.type === 'confidential' ? 'checked' : ''} />
              <b>${L(F + 'Confidential')}</b><small>${L(F + 'ConfidentialHint')}</small></label>
          </div>
          <label class="field" id="af-secret-field"><span>${L(F + 'ClientSecret')} ${confidentialExisting ? '' : html`<i>*</i>`}</span>
            <span class="secret">
              <input class="input mono" id="af-secret" name="clientSecret" type="password" autocomplete="new-password" placeholder="${confidentialExisting ? L(F + 'KeepSecret') : ''}" />
              <button type="button" class="btn sm" data-act="generate">${L(F + 'Generate')}</button>
              <button type="button" class="btn sm" data-act="copy" hidden>${L('AbpAdmin::Common:Copy')}</button>
            </span>
            <small>${L(F + 'SecretHint')}</small></label>
        </fieldset>

        <fieldset>
          <legend>${L(F + 'GrantTypes')}</legend>
          <div class="checks" id="af-grants"></div>
          <span class="add">
            <input class="input mono" id="af-custom" placeholder="${L(F + 'CustomPlaceholder')}" aria-label="${L(F + 'CustomAria')}" />
            <button type="button" class="btn sm" data-act="add-custom">${L(F + 'Add')}</button>
          </span>
          <label class="check" id="af-pkce"><input type="checkbox" class="switch" name="requirePkce" ${!x || x.requirePkce ? 'checked' : ''} />
            <span>${L(F + 'RequirePkce')} <small>${L(F + 'PkceHint')}</small></span></label>
        </fieldset>

        <fieldset id="af-redirects">
          <legend>${L(F + 'Redirects')}</legend>
          <label class="field"><span>${L(F + 'RedirectUris')}</span>
            <textarea class="input mono" name="redirectUris" rows="3" placeholder="https://app.example.com/signin-callback">${(x?.redirectUris ?? []).join('\n')}</textarea>
            <small>${L(F + 'RedirectHint')}</small></label>
          <label class="field"><span>${L(F + 'PostLogoutUris')}</span>
            <textarea class="input mono" name="postLogoutRedirectUris" rows="2" placeholder="https://app.example.com">${(x?.postLogoutRedirectUris ?? []).join('\n')}</textarea></label>
        </fieldset>

        <fieldset>
          <legend>${L(F + 'Scopes')}</legend>
          <div class="scopes">${scopes.map(s => html`<label class="chip-check" title="${s.hint}">
            <input type="checkbox" name="scopes" value="${s.name}" ${(x ? x.scopes?.includes(s.name) : true) ? 'checked' : ''} /><span>${s.name}</span></label>`)}</div>
          <small class="muted">${L(F + 'ScopesHint')}</small>
        </fieldset>

        <details class="more" ${x?.clientUri || x?.logoUri || x?.consentType === 'explicit' ? 'open' : ''}>
          <summary>${L(F + 'MoreOptions')}</summary>
          <div class="grid-2">
            <label class="field"><span>${L(F + 'ApplicationType')}</span>
              <select class="input" name="applicationType">
                <option value="web" ${sel('web', x?.applicationType ?? 'web')}>${L(F + 'Web')}</option>
                <option value="native" ${sel('native', x?.applicationType)}>${L(F + 'Native')}</option>
              </select></label>
            <label class="field"><span>${L(F + 'Consent')}</span>
              <select class="input" name="consentType">${CONSENTS.map(c => html`<option value="${c.value}" ${sel(c.value, x?.consentType ?? 'implicit')}>${L(c.labelKey)}</option>`)}</select></label>
            <label class="field"><span>${L(F + 'ClientUri')}</span>
              <input class="input" name="clientUri" type="url" value="${x?.clientUri ?? ''}" placeholder="https://app.example.com" /></label>
            <label class="field"><span>${L(F + 'LogoUri')}</span>
              <input class="input" name="logoUri" type="url" value="${x?.logoUri ?? ''}" placeholder="https://app.example.com/logo.png" /></label>
          </div>
        </details>
      </div>
      <footer class="sh-foot">
        <span class="alert tone-err" id="af-error" hidden></span>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="close">${L('AbpAdmin::Common:Cancel')}</button>
        <button class="btn primary" id="af-save">${L(x ? 'AbpAdmin::Common:Save' : F + 'CreateApplication')}</button>
      </footer>
    </form>`);
    sheetHost.append(dialog);

    const form = dialog.querySelector('form');
    const $ = s => dialog.querySelector(s);
    const secretInput = $('#af-secret'), copyBtn = $('[data-act=copy]');

    // Sections that depend on the client type / grants are toggled, not re-rendered, so typing is never interrupted.
    const syncType = () => {
      $('#af-secret-field').hidden = st.type !== 'confidential';
      secretInput.required = st.type === 'confidential' && !confidentialExisting;
      dialog.querySelectorAll('[data-choice]').forEach(l => l.classList.toggle('on', l.dataset.choice === st.type));
    };
    const syncGrants = () => { $('#af-pkce').hidden = !interactive(); $('#af-redirects').hidden = !interactive(); };
    const drawGrants = () => {
      const check = (value, body) => html`<label class="check"><input type="checkbox" name="grantTypes" value="${value}" ${st.selected.has(value) ? 'checked' : ''} />${body}</label>`;
      render($('#af-grants'), [
        GRANTS.map(g => check(g.value, html`<span>${L(g.labelKey)}<small>${L(g.hintKey)}</small></span>`)),
        st.custom.map(c => check(c, html`<span class="mono">${c}<small>${L(F + 'CustomGrant')}</small></span>`)),
      ]);
      syncGrants();
    };
    const showSecret = () => {
      secretInput.type = secretInput.value ? 'text' : 'password';
      copyBtn.hidden = !secretInput.value;
      copyBtn.textContent = L('AbpAdmin::Common:Copy');
    };
    drawGrants(); syncType();

    on(dialog, 'change', 'input[name=clientType]', (e, el) => { st.type = el.value; syncType(); });
    on(dialog, 'change', 'input[name=grantTypes]', (e, el) => { if (el.checked) st.selected.add(el.value); else st.selected.delete(el.value); syncGrants(); });
    secretInput.addEventListener('input', showSecret);
    on(dialog, 'click', '[data-act=generate]', () => {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      secretInput.value = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' })[c]);
      showSecret();
    });
    on(dialog, 'click', '[data-act=copy]', () => navigator.clipboard?.writeText(secretInput.value).then(() => { copyBtn.textContent = L('AbpAdmin::Common:Copied'); }));
    const custom = $('#af-custom');
    const addCustom = () => {
      const v = custom.value.trim();
      if (!v || st.selected.has(v)) return;
      st.custom.push(v); st.selected.add(v); custom.value = ''; drawGrants();
    };
    on(dialog, 'click', '[data-act=add-custom]', addCustom);
    custom.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });
    on(dialog, 'click', '[data-act=close]', () => sh.close());

    const showError = msg => { const el = $('#af-error'); el.hidden = !msg; el.textContent = msg ?? ''; };
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const text = k => String(fd.get(k) ?? '').trim();
      const lines = k => text(k).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const wide = interactive();
      const dto = {
        clientId: text('clientId'), displayName: text('displayName') || null, clientType: text('clientType') || 'public',
        consentType: text('consentType') || 'implicit', applicationType: text('applicationType') || 'web',
        clientSecret: st.type === 'confidential' ? (secretInput.value || null) : null,
        grantTypes: fd.getAll('grantTypes').map(String), scopes: fd.getAll('scopes').map(String),
        redirectUris: wide ? lines('redirectUris') : [], postLogoutRedirectUris: wide ? lines('postLogoutRedirectUris') : [],
        requirePkce: wide && fd.has('requirePkce'), clientUri: text('clientUri') || null, logoUri: text('logoUri') || null,
      };
      if (!dto.grantTypes.length) { showError(L(F + 'PickGrant')); return; }
      $('#af-save').disabled = true; showError(null);
      try {
        await (x ? api.put(`${URL_}/${x.id}`, dto) : api.post(URL_, dto));
        toast.ok(L(x ? F + 'Saved' : F + 'Created', dto.clientId));
        sh.close(); load();
      } catch (err) { $('#af-save').disabled = false; showError(errorText(err)); }
    });
    sh.open();
  }

  load().then(() => { if (params().get('new') === '1' && can('AbpAdmin.Applications.Create')) openForm(null); });
  AbpAdmin.onPager(root, (page, size) => { state.page = page; state.size = size; state.pagedFilter = state.filter; load(); });
})();
