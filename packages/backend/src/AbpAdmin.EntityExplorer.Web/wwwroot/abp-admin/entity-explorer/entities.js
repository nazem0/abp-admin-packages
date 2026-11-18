// Entity explorer (port of entities.page.ts): pick an exposed entity, find rows by key or text, and edit them as
// database rows. Columns and the form come from the entity's schema at runtime.
(function () {
  const { html, render, icon, on, api, L, toast, errorText, sheet, params, setParams } = AbpAdmin;
  const root = document.getElementById('abp-entities');
  const API = '/api/abp-admin/entity-explorer';
  const IC = { plus: 'M12 5v14M5 12h14', close: 'M6 6l12 12M18 6 6 18', search: 'M20 20l-3.5-3.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z' };

  const state = {
    entities: null, selected: '', schema: null, schemaError: false, refs: {},
    filter: '', sorting: undefined, page: 0, size: AbpAdmin.pageSize(20),
    rows: [], total: 0, loading: false, error: false,
  };
  let listSeq = 0, schemaSeq = 0;
  let editing = null; // { x: row | null }

  /** Row value by schema field name; tolerates camelCased keys from the JSON serializer. */
  const cell = (row, name) => (name in row ? row[name] : row[name[0].toLowerCase() + name.slice(1)]);
  const info = () => state.entities?.find(e => e.name === state.selected);

  render(root, html`
    <header class="top">
      <div><h1>${L('AbpAdmin::Entities:Title')}</h1><p class="muted">${L('AbpAdmin::Entities:Subtitle')}</p></div>
      <span id="en-actions"></span>
    </header>
    <section class="card stream">
      <div class="filters">
        <select class="input" data-act="entity" aria-label="${L('AbpAdmin::Entities:Entity')}"></select>
        <label class="search">${icon(IC.search)}
          <input class="input" type="search" data-act="search" placeholder="${L('AbpAdmin::Entities:SearchPlaceholder')}" aria-label="${L('AbpAdmin::Common:Search')}" /></label>
      </div>
      <div id="en-list"></div>
    </section>
    <dialog id="en-form" aria-labelledby="ef-title"></dialog>`);
  const actionsEl = root.querySelector('#en-actions');
  const pickerEl = root.querySelector('[data-act=entity]');
  const searchEl = root.querySelector('[data-act=search]');
  const listEl = root.querySelector('#en-list');
  const formEl = root.querySelector('#en-form');
  const formSheet = sheet(formEl, { onClose: () => { editing = null; } });

  // ---------- list ----------
  /** Keys, the display field, then the first other scalar fields: at most 6 columns. */
  function columns() {
    const s = state.schema;
    if (!s) return [];
    const fields = s.fields.filter(f => f.type !== 'json');
    const first = fields.filter(f => f.isKey || f.name === s.displayField);
    return [...first, ...fields.filter(f => !first.includes(f) && !f.readOnly)].slice(0, 6);
  }

  function show(row, f) {
    const v = cell(row, f.name);
    if (v == null || v === '') return '—';
    if (f.type === 'boolean') return v ? '✓' : '✗';
    if (f.reference) return state.refs[f.name]?.find(o => o.id === String(v))?.label || String(v);
    if (f.type === 'enum') return f.enumValues?.find(o => '' + o.value === '' + v)?.name ?? String(v);
    if (f.type === 'datetime') return String(v).slice(0, 19).replace('T', ' ');
    return String(v);
  }

  const sortMark = name => state.sorting === name ? '↑' : state.sorting === `${name} desc` ? '↓' : '';

  function drawTop() {
    render(pickerEl, (state.entities ?? []).map(e => html`<option value="${e.name}" ${e.name === state.selected ? 'selected' : ''}>${e.name}</option>`));
    render(actionsEl, info()?.canCreate ? html`<button class="btn primary" type="button" data-act="new">${icon(IC.plus)} ${L('AbpAdmin::Entities:New')}</button>` : '');
  }

  function drawList() {
    const cols = columns();
    render(listEl,
      state.entities?.length === 0 ? html`<div class="state empty"><b>${L('AbpAdmin::Entities:NoEntities')}</b><span class="muted mono">Configure&lt;EntityExplorerOptions&gt;(o =&gt; o.Add&lt;Book&gt;())</span></div>`
      : state.error || state.schemaError ? html`<div class="state err">${L('AbpAdmin::Entities:LoadError')} <button class="btn" type="button" data-act="reload">${L('AbpAdmin::Common:Retry')}</button></div>`
      : (state.loading || !state.schema) && !state.rows.length ? html`<div class="skeleton rows"><i></i><i></i><i></i></div>`
      : !state.rows.length ? html`<div class="state empty"><b>${L('AbpAdmin::Entities:Empty')}</b></div>`
      : html`<div class="scroll"><table class="table">
          <thead><tr>${cols.map(c => html`<th><button class="sort" type="button" data-act="sort" data-name="${c.name}">${c.name} ${sortMark(c.name)}</button></th>`)}</tr></thead>
          <tbody>${state.rows.map((r, i) => html`<tr class="clickable" tabindex="0" data-act="open" data-i="${i}">
            ${cols.map(c => html`<td class="${(c.type === 'guid' && !c.reference) || c.isKey ? 'mono' : ''}">${c.type === 'datetime' ? html`<span dir="ltr">${show(r, c)}</span>` : show(r, c)}</td>`)}</tr>`)}</tbody>
        </table></div>
        ${AbpAdmin.pager(state.total, state.page, state.size)}`);
  }

  async function loadList() {
    if (!state.selected) return;
    const id = ++listSeq;
    state.loading = true; state.error = false; drawList();
    try {
      const r = await api.get(API, { entity: state.selected, filter: state.filter || undefined, sorting: state.sorting, skipCount: state.page * state.size, maxResultCount: state.size });
      if (id !== listSeq) return;
      state.rows = r.items ?? []; state.total = r.totalCount ?? 0;
      if (AbpAdmin.pastEnd(state)) return loadList();
    } catch { if (id !== listSeq) return; state.error = true; }
    state.loading = false; drawList();
  }

  /** Schema, then lookup options for foreign keys to other exposed entities (first 200 rows; any key can still be typed). */
  async function loadSchema() {
    const id = ++schemaSeq, entity = state.selected;
    state.schema = null; state.schemaError = false; state.refs = {}; drawList();
    try {
      const s = await api.get(`${API}/schema`, { entity });
      if (id !== schemaSeq) return;
      state.schema = s; drawList();
      const refFields = s.fields.filter(f => f.reference);
      const lists = await Promise.all(refFields.map(f => api.get(API, { entity: f.reference.entity, maxResultCount: 200 }).catch(() => ({ items: [] }))));
      if (id !== schemaSeq) return;
      state.refs = Object.fromEntries(refFields.map((f, i) => [f.name,
        (lists[i].items ?? []).map(r => ({ id: String(cell(r, f.reference.keyField)), label: String(cell(r, f.reference.displayField) ?? '') }))]));
      drawList();
    } catch { if (id !== schemaSeq) return; state.schemaError = true; drawList(); }
  }

  function choose(name) {
    state.selected = name; state.filter = ''; state.sorting = undefined; state.page = 0; state.rows = []; state.total = 0;
    searchEl.value = '';
    setParams({ entity: name });
    formSheet.close();
    drawTop(); loadSchema(); loadList();
  }

  // ---------- form ----------
  const key = row => state.schema.keyFields.map(k => cell(row, k)).join(', ');
  const writable = x => (x ? info()?.canUpdate : info()?.canCreate) ?? false;
  const value = (x, f) => (x ? cell(x, f.name) : undefined);
  const locked = (x, f) => !writable(x) || !!f.readOnly || (!!f.isKey && !!x);

  function control(f) {
    if (f.type === 'boolean') return 'tristate'; // bool?: required ones are check rows.
    if (f.type === 'enum') return 'select';
    if (f.type === 'json' || (f.type === 'string' && (f.maxLength == null || f.maxLength > 512))) return 'textarea';
    return 'input';
  }
  const inputType = f => f.type === 'integer' || f.type === 'number' ? 'number' : f.type === 'datetime' ? 'datetime-local' : 'text';

  function text(x, f) {
    const v = value(x, f);
    if (v == null) return '';
    if (f.type === 'json') return JSON.stringify(v, null, 2);
    if (f.type === 'datetime') return String(v).slice(0, 19); // Stored UTC (AbpClockOptions.Kind = Utc).
    return String(v);
  }

  function fieldView(x, f) {
    const off = locked(x, f) ? 'disabled' : '';
    const readOnlyHint = f.readOnly ? html`<small>${L('AbpAdmin::Entities:ReadOnlyHint')}</small>` : '';
    if (f.type === 'boolean' && f.required) {
      return html`<label class="check">
        <input type="checkbox" name="${f.name}" ${value(x, f) ? 'checked' : ''} ${off} />
        <span><b>${f.name}</b><small class="mono">${f.type}</small>${readOnlyHint}</span></label>`;
    }
    const v = value(x, f);
    let input;
    switch (control(f)) {
      case 'tristate':
        input = html`<select class="input" name="${f.name}" ${off}>
          <option value="" ${v == null ? 'selected' : ''}>${L('AbpAdmin::Entities:NotSet')}</option>
          <option value="true" ${v === true ? 'selected' : ''}>${L('AbpAdmin::Entities:Yes')}</option>
          <option value="false" ${v === false ? 'selected' : ''}>${L('AbpAdmin::Entities:No')}</option></select>`;
        break;
      case 'select':
        input = html`<select class="input" name="${f.name}" ${off}>
          ${!f.required || !x ? html`<option value="">—</option>` : ''}
          ${(f.enumValues ?? []).map(o => html`<option value="${o.value}" ${x && '' + v === '' + o.value ? 'selected' : ''}>${o.name}</option>`)}</select>`;
        break;
      case 'textarea':
        input = html`<textarea class="input ${f.type === 'json' ? 'mono' : ''}" rows="4" name="${f.name}" ${off}>${text(x, f)}</textarea>`;
        break;
      default:
        input = html`<input class="input ${f.type === 'guid' ? 'mono' : ''}" type="${inputType(f)}" name="${f.name}" value="${text(x, f)}" ${off}
            ${f.maxLength ? html`maxlength="${f.maxLength}"` : ''} ${f.type === 'number' ? html`step="any"` : f.type === 'datetime' ? html`step="1"` : ''}
            ${f.reference ? html`list="ef-ref-${f.name}"` : ''} ${f.required && f.type === 'string' && !locked(x, f) ? 'required' : ''}
            placeholder="${f.isKey && !x ? L('AbpAdmin::Entities:AutoKey') : ''}" autocomplete="off" />
          ${f.reference ? html`<datalist id="ef-ref-${f.name}">${(state.refs[f.name] ?? []).map(o => html`<option value="${o.id}">${o.label}</option>`)}</datalist>` : ''}`;
    }
    const meta = `${f.type}${f.maxLength ? ' · ' + f.maxLength : ''}${f.reference ? ' → ' + f.reference.entity : ''}`;
    return html`<label class="field">
      <span>${f.name} ${f.required && !locked(x, f) && f.type === 'string' ? html`<i>*</i>` : ''} <small class="muted mono">${meta}</small></span>
      ${input}${readOnlyHint}</label>`;
  }

  function drawFooter() {
    const x = editing?.x, foot = formEl.querySelector('#ef-foot-actions');
    if (!foot) return;
    render(foot, html`
      ${x && info()?.canDelete ? (editing.confirming
        ? html`<span class="confirm">${L('AbpAdmin::Entities:DeleteConfirm')}
            <button type="button" class="btn sm danger" data-act="remove">${L('AbpAdmin::Common:Delete')}</button>
            <button type="button" class="btn sm" data-act="cancel-remove">${L('AbpAdmin::Common:Cancel')}</button></span>`
        : html`<button type="button" class="btn danger" data-act="confirm-remove">${L('AbpAdmin::Common:Delete')}</button>`) : ''}
      <button type="button" class="btn" data-act="form-close">${L('AbpAdmin::Common:Cancel')}</button>
      ${writable(x) ? html`<button class="btn primary" type="submit" id="ef-save">${L(x ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Common:Create')}</button>` : ''}`);
  }

  function showError(message) {
    const err = formEl.querySelector('#ef-error');
    err.textContent = message ?? ''; err.hidden = !message;
  }

  function openForm(x) {
    const s = state.schema;
    if (!s) return;
    editing = { x, confirming: false };
    render(formEl, html`<form autocomplete="off" novalidate>
      <header class="sh-head">
        <h2 id="ef-title">${x ? s.name : L('AbpAdmin::Entities:Form:New', s.name)} ${x ? html`<small class="mono">${key(x)}</small>` : ''}</h2>
        <button type="button" class="icon-btn" data-act="form-close" aria-label="${L('AbpAdmin::Common:Close')}">${icon(IC.close)}</button>
      </header>
      <div class="sh-body form">${s.fields.filter(f => x || !f.readOnly).map(f => fieldView(x, f))}</div>
      <footer class="sh-foot">
        <span id="ef-error" class="alert tone-err" hidden></span>
        <span class="spacer"></span>
        <span id="ef-foot-actions" class="foot-actions"></span>
      </footer>
    </form>`);
    drawFooter();
    formSheet.open();
  }

  function parseJson(raw, field) {
    try { return JSON.parse(raw); } catch { throw new Error(field); }
  }

  formEl.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    if (!form.reportValidity()) return;
    const x = editing.x, isNew = !x, fd = new FormData(form), values = {};
    try {
      for (const f of state.schema.fields) {
        if (locked(x, f)) continue;
        if (f.type === 'boolean') {
          const v = f.required ? fd.has(f.name) : ({ true: true, false: false })[String(fd.get(f.name))] ?? null;
          if (isNew ? v != null : v !== (f.required ? !!value(x, f) : value(x, f) ?? null)) values[f.name] = v;
          continue;
        }
        const raw = String(fd.get(f.name) ?? '');
        if (!isNew && raw === text(x, f)) continue; // Untouched: don't round-trip (dates would lose sub-seconds).
        if (raw === '') {
          if (!isNew) values[f.name] = f.type === 'string' && f.required ? '' : null; // New rows keep constructor defaults.
          continue;
        }
        values[f.name] =
          f.type === 'integer' || f.type === 'number' || f.type === 'enum' ? Number(raw)
          : f.type === 'datetime' ? new Date(raw + 'Z').toISOString()
          : f.type === 'json' ? parseJson(raw, f.name)
          : raw;
      }
    } catch (ex) {
      showError(L('AbpAdmin::Entities:InvalidJson', ex.message));
      return;
    }

    if (x) values.ConcurrencyStamp = cell(x, 'ConcurrencyStamp');
    const btn = formEl.querySelector('#ef-save');
    btn.disabled = true; btn.textContent = L('AbpAdmin::Common:Saving'); showError(null);
    try {
      if (x) await api.request('PUT', `${API}/${encodeURIComponent(key(x))}`, { params: { entity: state.schema.name }, body: { values } });
      else await api.request('POST', API, { params: { entity: state.schema.name }, body: { values } });
      toast.ok(L(x ? 'AbpAdmin::Entities:Form:Saved' : 'AbpAdmin::Entities:Form:Created'));
      formSheet.close(); loadList();
    } catch (ex) {
      btn.disabled = false; btn.textContent = L(x ? 'AbpAdmin::Common:Save' : 'AbpAdmin::Common:Create'); showError(errorText(ex));
    }
  });

  on(formEl, 'click', '[data-act=form-close]', () => formSheet.close());
  on(formEl, 'click', '[data-act=confirm-remove]', () => { editing.confirming = true; drawFooter(); });
  on(formEl, 'click', '[data-act=cancel-remove]', () => { editing.confirming = false; drawFooter(); });
  on(formEl, 'click', '[data-act=remove]', async () => {
    try {
      await api.delete(`${API}/${encodeURIComponent(key(editing.x))}`, { entity: state.schema.name });
      toast.ok(L('AbpAdmin::Entities:Deleted'));
      formSheet.close(); loadList();
    } catch (ex) { editing.confirming = false; drawFooter(); showError(errorText(ex)); }
  });

  // ---------- page events ----------
  on(root, 'click', '[data-act=new]', () => openForm(null));
  on(root, 'click', '[data-act=reload]', () => { if (!state.entities) start(); else { loadSchema(); loadList(); } });
  on(root, 'change', '[data-act=entity]', (e, el) => choose(el.value));
  on(root, 'click', '[data-act=sort]', (e, b) => {
    const name = b.dataset.name;
    state.sorting = state.sorting === name ? `${name} desc` : name; state.page = 0; loadList();
  });
  on(listEl, 'click', '[data-act=open]', (e, tr) => openForm(state.rows[+tr.dataset.i]));
  on(listEl, 'keydown', '[data-act=open]', (e, tr) => { if (e.key === 'Enter') openForm(state.rows[+tr.dataset.i]); });
  const search = el => { const v = el.value.trim(); if (v !== state.filter) { state.filter = v; state.page = 0; loadList(); } };
  on(root, 'change', '[data-act=search]', (e, el) => search(el));
  root.addEventListener('search', e => { if (e.target.matches('[data-act=search]')) search(e.target); });
  AbpAdmin.onPager(listEl, (page, size) => { state.page = page; state.size = size; loadList(); });

  // ---------- start: ?entity=Name deep link, else the first entity ----------
  async function start() {
    state.error = false; drawList();
    try { state.entities = await api.get(`${API}/entities`) ?? []; }
    catch { state.entities = null; state.error = true; drawList(); return; }
    const wanted = params().get('entity');
    const first = state.entities.find(e => e.name === wanted)?.name ?? state.entities[0]?.name;
    if (first) choose(first); else drawList();
  }
  start();
})();
