/* OpenIddict scopes (port of scopes.page.ts incl. its scope form). */
(function () {
  'use strict';
  const { html, render, icon, on, api, L, can, fmt, toast, errorText, params, sheet } = AbpAdmin;
  const root = document.getElementById('abp-scopes');
  const URL_ = '/api/abp-admin/scope';
  const S = 'AbpAdmin::Scopes:';
  const F = S + 'Form:';
  const ICON = {
    plus: 'M12 5v14M5 12h14', edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', close: 'M6 6l12 12M18 6 6 18',
    del: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  };

  const state = { filter: '', rows: [], total: 0, loading: true, error: false, confirming: null };

  render(root, html`
    <header class="top">
      <div><h1>${L(S + 'Title')}</h1><p class="muted">${L(S + 'Subtitle')}</p></div>
      ${can('AbpAdmin.Scopes.Create') ? html`<button class="btn primary" data-act="new">${icon(ICON.plus)} ${L(S + 'New')}</button>` : ''}
    </header>
    <section class="card stream">
      <div class="filters">
        <label class="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input class="input" type="search" id="sc-search" placeholder="${L(S + 'SearchPlaceholder')}" aria-label="${L(S + 'Search')}" />
        </label>
      </div>
      <div id="sc-list"></div>
    </section>
    <div id="sc-sheet"></div>`);
  const listEl = root.querySelector('#sc-list');
  const sheetHost = root.querySelector('#sc-sheet');

  function draw() {
    const s = state;
    render(listEl, s.error ? html`<div class="state err">${L(S + 'LoadError')} <button class="btn" data-act="retry">${L('AbpAdmin::Common:Retry')}</button></div>`
      : s.loading && !s.rows.length ? html`<div class="skeleton rows"><i></i><i></i></div>`
      : !s.rows.length ? html`<div class="state empty"><b>${L(S + 'Empty')}</b><span class="muted">${s.filter ? L(S + 'NoMatch', s.filter) : L(S + 'DefineFirst')}</span></div>`
      : html`<table class="table">
          <thead><tr><th>${L(S + 'Scope')}</th><th>${L(S + 'Resources')}</th><th class="hide-sm">${L('AbpAdmin::Common:Created')}</th><th><span class="sr-only">${L('AbpAdmin::Common:Actions')}</span></th></tr></thead>
          <tbody>${s.rows.map(row)}</tbody></table>
          <footer class="pager"><span class="muted">${L(S + (s.total === 1 ? 'CountOne' : 'CountMany'), s.total)}</span></footer>`);
  }

  const row = r => html`<tr>
    <td><span class="who-cell"><span class="avatar sq" aria-hidden="true">${(r.name || '?')[0].toUpperCase()}</span>
      <span><b class="mono">${r.name}</b><small>${r.displayName ?? ''}${r.description ? ' — ' + r.description : ''}</small></span></span></td>
    <td><span class="pills">${(r.resources ?? []).length ? r.resources.map(x => html`<span class="pill tone-accent mono">${x}</span>`) : html`<span class="muted">—</span>`}</span></td>
    <td class="hide-sm muted">${fmt.relative(r.creationTime)}</td>
    <td class="actions">${state.confirming === r.id ? html`
      <span class="confirm">${L(S + 'DeleteConfirm', r.name)}
        <button class="btn sm danger" data-act="remove" data-id="${r.id}">${L('AbpAdmin::Common:Delete')}</button>
        <button class="btn sm" data-act="cancel-delete">${L('AbpAdmin::Common:Cancel')}</button></span>` : html`
      ${can('AbpAdmin.Scopes.Update') ? html`<button class="icon-btn" data-act="edit" data-id="${r.id}" title="${L('AbpAdmin::Common:Edit')}" aria-label="${L(S + 'EditAria', r.name)}">${icon(ICON.edit)}</button>` : ''}
      ${can('AbpAdmin.Scopes.Delete') ? html`<button class="icon-btn" data-act="ask-delete" data-id="${r.id}" title="${L('AbpAdmin::Common:Delete')}" aria-label="${L(S + 'DeleteAria', r.name)}">${icon(ICON.del)}</button>` : ''}`}
    </td></tr>`;

  async function load() {
    state.loading = true; state.error = false; draw();
    try {
      const page = await api.get(URL_, { filter: state.filter || undefined, maxResultCount: 200 });
      state.rows = page.items ?? []; state.total = page.totalCount ?? 0;
    } catch { state.error = true; }
    state.loading = false; draw();
  }

  const byId = id => state.rows.find(s => s.id === id);
  const search = root.querySelector('#sc-search');
  const applyFilter = () => { const v = search.value.trim(); if (v !== state.filter) { state.filter = v; load(); } };
  search.addEventListener('change', applyFilter);
  search.addEventListener('search', applyFilter);

  on(root, 'click', '[data-act=new]', () => openForm(null));
  on(root, 'click', '[data-act=retry]', load);
  on(root, 'click', '[data-act=edit]', (e, el) => openForm(byId(el.dataset.id)));
  on(root, 'click', '[data-act=ask-delete]', (e, el) => { state.confirming = el.dataset.id; draw(); });
  on(root, 'click', '[data-act=cancel-delete]', () => { state.confirming = null; draw(); });
  on(root, 'click', '[data-act=remove]', async (e, el) => {
    const s = byId(el.dataset.id);
    try { await api.delete(`${URL_}/${s.id}`); state.confirming = null; toast.ok(L(S + 'Deleted', s.name)); load(); }
    catch (err) { state.confirming = null; draw(); toast.error(errorText(err)); }
  });

  function openForm(x) {
    const dialog = document.createElement('dialog');
    dialog.className = 'narrow';
    dialog.setAttribute('aria-labelledby', 'sf-title');
    const sh = sheet(dialog, { onClose: () => dialog.remove() });
    render(dialog, html`<form>
      <header class="sh-head">
        <h2 id="sf-title">${L(x ? F + 'Edit' : F + 'New')} ${x ? html`<small class="mono">${x.name}</small>` : ''}</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="${L('AbpAdmin::Common:Close')}">${icon(ICON.close)}</button>
      </header>
      <div class="sh-body form">
        <label class="field"><span>${L('AbpAdmin::Common:Name')} <i>*</i></span>
          <input class="input mono" name="name" required maxlength="200" pattern="[^\\s]+" title="${L(F + 'NoSpaces')}" autocomplete="off" value="${x?.name ?? ''}" placeholder="Orders" />
          <small>${L(F + 'NameHint', 'scope')}</small></label>
        <label class="field"><span>${L('AbpAdmin::Common:DisplayName')}</span>
          <input class="input" name="displayName" maxlength="200" value="${x?.displayName ?? ''}" placeholder="Orders API" /></label>
        <label class="field"><span>${L('AbpAdmin::Common:Description')}</span>
          <textarea class="input" name="description" rows="2">${x?.description ?? ''}</textarea></label>
        <label class="field"><span>${L(F + 'Resources')}</span>
          <textarea class="input mono" name="resources" rows="3" placeholder="Orders">${(x?.resources ?? []).join('\n')}</textarea>
          <small>${L(F + 'ResourcesHint', 'aud')}</small></label>
      </div>
      <footer class="sh-foot">
        <span class="alert tone-err" id="sf-error" hidden></span>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="close">${L('AbpAdmin::Common:Cancel')}</button>
        <button class="btn primary" id="sf-save">${L(x ? 'AbpAdmin::Common:Save' : F + 'CreateScope')}</button>
      </footer>
    </form>`);
    sheetHost.append(dialog);
    const $ = s => dialog.querySelector(s);
    on(dialog, 'click', '[data-act=close]', () => sh.close());
    const showError = msg => { const el = $('#sf-error'); el.hidden = !msg; el.textContent = msg ?? ''; };
    $('form').addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const text = k => String(fd.get(k) ?? '').trim();
      const dto = {
        name: text('name'), displayName: text('displayName') || null, description: text('description') || null,
        resources: text('resources').split(/\r?\n/).map(l => l.trim()).filter(Boolean),
      };
      $('#sf-save').disabled = true; showError(null);
      try {
        await (x ? api.put(`${URL_}/${x.id}`, dto) : api.post(URL_, dto));
        toast.ok(L(x ? F + 'Saved' : F + 'Created', dto.name));
        sh.close(); load();
      } catch (err) { $('#sf-save').disabled = false; showError(errorText(err)); }
    });
    sh.open();
  }

  load().then(() => { if (params().get('new') === '1' && can('AbpAdmin.Scopes.Create')) openForm(null); });
})();
