// Claim types page (port of claim-types.page.ts): the claims users and roles may carry.
(function () {
  const { html, render, icon, on, api, L, can, toast, errorText, sheet } = AbpAdmin;
  const root = document.getElementById('abp-claim-types');
  const API = '/api/abp-admin/claim-type';
  const IC = { plus: 'M12 5v14M5 12h14', edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', del: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', close: 'M6 6l12 12M18 6 6 18' };
  const TYPES = [0, 1, 2, 3];
  const state = { filter: '', page: 0, size: AbpAdmin.pageSize(20), rows: [], total: 0, loading: false, error: false, confirming: null };
  let seq = 0, editing = null;

  render(root, html`
    <header class="top">
      <div><h1>${L('AbpAdmin::ClaimTypes:Title')}</h1><p class="muted">${L('AbpAdmin::ClaimTypes:Subtitle')}</p></div>
      ${can('AbpAdmin.ClaimTypes.Create') ? html`<button class="btn primary" type="button" data-act="new">${icon(IC.plus)} ${L('AbpAdmin::ClaimTypes:New')}</button>` : ''}
    </header>
    <section class="card stream">
      <div class="filters">
        <label class="search">${icon('M20 20l-3.5-3.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z')}
          <input class="input" type="search" data-act="search" placeholder="${L('AbpAdmin::ClaimTypes:Search')}" aria-label="${L('AbpAdmin::Common:Search')}" /></label>
      </div>
      <div id="ct-list"></div>
    </section>
    <dialog id="ct-form" class="narrow" aria-labelledby="ctf-title"></dialog>`);
  const listEl = root.querySelector('#ct-list');
  const formEl = root.querySelector('#ct-form');
  const formSheet = sheet(formEl, { onClose: () => { editing = null; } });

  function row(t) {
    return html`<tr>
      <td><b class="mono">${t.name}</b>${t.description ? html`<small class="muted" style="display:block">${t.description}</small>` : ''}</td>
      <td>${L('AbpAdmin::ClaimTypes:Type:' + (t.valueType ?? 0))}</td>
      <td class="hide-sm mono muted">${t.regex || '—'}</td>
      <td><span class="pills">
        ${t.isStatic ? html`<span class="pill tone-accent" title="${L('AbpAdmin::ClaimTypes:StaticHint')}">${L('AbpAdmin::Roles:Static')}</span>` : ''}
        ${t.required ? html`<span class="pill tone-warn">${L('AbpAdmin::Common:Required')}</span>` : ''}</span></td>
      <td class="actions">${state.confirming === t.id ? html`<span class="confirm">${L('AbpAdmin::ClaimTypes:DeleteConfirm', t.name)}
          <button class="btn sm danger" type="button" data-act="remove" data-id="${t.id}">${L('AbpAdmin::Common:Delete')}</button>
          <button class="btn sm" type="button" data-act="cancel">${L('AbpAdmin::Common:Cancel')}</button></span>`
        : t.isStatic ? '' : html`
          ${can('AbpAdmin.ClaimTypes.Update') ? html`<button class="icon-btn" type="button" data-act="edit" data-id="${t.id}" title="${L('AbpAdmin::Common:Edit')}">${icon(IC.edit)}</button>` : ''}
          ${can('AbpAdmin.ClaimTypes.Delete') ? html`<button class="icon-btn" type="button" data-act="confirm" data-id="${t.id}" title="${L('AbpAdmin::Common:Delete')}">${icon(IC.del)}</button>` : ''}`}
      </td></tr>`;
  }

  function drawList() {
    render(listEl, state.error ? html`<div class="state err">${L('AbpAdmin::ClaimTypes:LoadError')} <button class="btn" type="button" data-act="reload">${L('AbpAdmin::Common:Retry')}</button></div>`
      : state.loading && !state.rows.length ? html`<div class="skeleton rows"><i></i><i></i><i></i></div>`
      : !state.rows.length ? html`<div class="state empty"><b>${L('AbpAdmin::ClaimTypes:Empty')}</b></div>`
      : html`<table class="table">
          <thead><tr><th>${L('AbpAdmin::Common:Name')}</th><th>${L('AbpAdmin::ClaimTypes:ValueType')}</th><th class="hide-sm">${L('AbpAdmin::ClaimTypes:Regex')}</th><th>${L('AbpAdmin::Roles:Col:Flags')}</th><th><span class="sr-only">${L('AbpAdmin::Common:Actions')}</span></th></tr></thead>
          <tbody>${state.rows.map(row)}</tbody></table>
        ${AbpAdmin.pager(state.total, state.page, state.size)}`);
  }

  async function load() {
    if (state.filter !== state.pagedFilter) { state.page = 0; state.pagedFilter = state.filter; }
    const id = ++seq;
    state.loading = true; state.error = false; drawList();
    try {
      const r = await api.get(API, { filter: state.filter || undefined, skipCount: state.page * state.size, maxResultCount: state.size });
      if (id !== seq) return;
      state.rows = r.items ?? []; state.total = r.totalCount ?? 0;
      if (AbpAdmin.pastEnd(state)) return load();
    } catch { if (id !== seq) return; state.error = true; }
    state.loading = false; drawList();
  }

  function openForm(x) {
    editing = { x };
    render(formEl, html`<form autocomplete="off">
      <header class="sh-head">
        <h2 id="ctf-title">${L(x ? 'AbpAdmin::ClaimTypes:Edit' : 'AbpAdmin::ClaimTypes:New')} ${x ? html`<small class="mono">${x.name}</small>` : ''}</h2>
        <button type="button" class="icon-btn" data-act="form-close" aria-label="${L('AbpAdmin::Common:Close')}">${icon(IC.close)}</button>
      </header>
      <div class="sh-body form">
        <label class="field"><span>${L('AbpAdmin::Common:Name')} <i>*</i></span>
          <input class="input mono" name="name" required maxlength="256" value="${x?.name ?? ''}" placeholder="employee_number" /></label>
        <label class="field"><span>${L('AbpAdmin::ClaimTypes:ValueType')}</span>
          <select class="input" name="valueType">${TYPES.map(v => html`<option value="${v}" ${(x?.valueType ?? 0) === v ? 'selected' : ''}>${L('AbpAdmin::ClaimTypes:Type:' + v)}</option>`)}</select></label>
        <label class="field"><span>${L('AbpAdmin::ClaimTypes:Regex')}</span>
          <input class="input mono" name="regex" maxlength="512" value="${x?.regex ?? ''}" placeholder="^E\\d+$" />
          <small>${L('AbpAdmin::ClaimTypes:RegexHint')}</small></label>
        <label class="field"><span>${L('AbpAdmin::ClaimTypes:RegexDescription')}</span>
          <input class="input" name="regexDescription" maxlength="128" value="${x?.regexDescription ?? ''}" /></label>
        <label class="field"><span>${L('AbpAdmin::Common:Description')}</span>
          <input class="input" name="description" maxlength="256" value="${x?.description ?? ''}" /></label>
        <label class="check"><input type="checkbox" name="required" ${x?.required ? 'checked' : ''} />
          <span><b>${L('AbpAdmin::Common:Required')}</b><small>${L('AbpAdmin::ClaimTypes:RequiredHint')}</small></span></label>
      </div>
      <footer class="sh-foot">
        <span id="ctf-error" class="alert tone-err" hidden></span>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="form-close">${L('AbpAdmin::Common:Cancel')}</button>
        <button class="btn primary" type="submit" id="ctf-save">${L(x ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Common:Create')}</button>
      </footer>
    </form>`);
    formSheet.open();
  }

  formEl.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target), text = k => String(fd.get(k) ?? '').trim() || null;
    const dto = { name: text('name') ?? '', valueType: +fd.get('valueType'), regex: text('regex'), regexDescription: text('regexDescription'), description: text('description'), required: fd.has('required') };
    const x = editing.x, btn = formEl.querySelector('#ctf-save'), err = formEl.querySelector('#ctf-error');
    btn.disabled = true; err.hidden = true;
    try {
      if (x) await api.put(`${API}/${x.id}`, dto); else await api.post(API, dto);
      toast.ok(L('AbpAdmin::ClaimTypes:Saved', dto.name)); formSheet.close(); load();
    } catch (ex) { btn.disabled = false; err.textContent = errorText(ex); err.hidden = false; }
  });

  const byId = id => state.rows.find(t => t.id === id);
  on(formEl, 'click', '[data-act=form-close]', () => formSheet.close());
  on(root, 'click', '[data-act=new]', () => openForm(null));
  on(root, 'click', '[data-act=edit]', (e, b) => openForm(byId(b.dataset.id)));
  on(root, 'click', '[data-act=reload]', load);
  on(root, 'click', '[data-act=confirm]', (e, b) => { state.confirming = b.dataset.id; drawList(); });
  on(root, 'click', '[data-act=cancel]', () => { state.confirming = null; drawList(); });
  on(root, 'click', '[data-act=remove]', async (e, b) => {
    const t = byId(b.dataset.id);
    try { await api.delete(`${API}/${t.id}`); toast.ok(L('AbpAdmin::ClaimTypes:Deleted', t.name)); }
    catch (ex) { toast.error(errorText(ex)); }
    state.confirming = null; load();
  });
  const search = el => { if (state.filter !== el.value.trim()) { state.filter = el.value.trim(); load(); } };
  on(root, 'change', '[data-act=search]', (e, el) => search(el));
  root.addEventListener('search', e => { if (e.target.matches('[data-act=search]')) search(e.target); });

  load();
  AbpAdmin.onPager(root, (page, size) => { state.page = page; state.size = size; state.pagedFilter = state.filter; load(); });
})();
