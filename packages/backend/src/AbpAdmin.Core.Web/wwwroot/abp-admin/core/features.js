// Features (port of features.page.ts): ABP feature management for provider "T". The Features page edits the host's
// (no key); AbpAdmin.features.mount(el, tenantId) edits one tenant's, e.g. in the Tenants page's sheet.
(function () {
  const { html, render, icon, on, api, L, errorText } = AbpAdmin;
  const URL = '/api/feature-management/features';

  function mount(root, providerKey) {
  const PARAMS = { providerName: 'T', providerKey: providerKey ?? '' };

  const state = { loading: true, error: false, groups: [], original: new Map(), values: new Map(), saving: false, status: null };

  const kind = f => {
    const n = f.valueType?.name ?? '';
    return n.startsWith('Toggle') ? 'toggle' : n.startsWith('Selection') ? 'select' : 'text';
  };
  const all = () => state.groups.flatMap(g => g.features ?? []);
  const value = f => state.values.get(f.name) ?? '';
  const changes = () => [...state.values].filter(([name, v]) => state.original.get(name) !== v).map(([name, v]) => ({ name, value: v }));
  /** A child of a switched-off toggle can't take effect, so it's locked. */
  function disabled(f) {
    const parent = f.parentName ? all().find(p => p.name === f.parentName) : undefined;
    return !!parent && ((kind(parent) === 'toggle' && value(parent) !== 'true') || disabled(parent));
  }

  function control(f, off) {
    const k = kind(f);
    if (k === 'toggle')
      return html`<input type="checkbox" class="switch" data-f="${f.name}" aria-label="${f.displayName}" ${off ? 'disabled' : ''} ${value(f) === 'true' ? 'checked' : ''} />`;
    if (k === 'select')
      return html`<select class="input" data-f="${f.name}" aria-label="${f.displayName}" ${off ? 'disabled' : ''}>
        ${(f.valueType?.itemSource?.items ?? []).map(o => html`<option value="${o.value}" ${o.value === value(f) ? 'selected' : ''}>${o.displayText?.name ?? o.value}</option>`)}</select>`;
    const v = f.valueType?.validator ?? {};
    return html`<input class="input" data-f="${f.name}" aria-label="${f.displayName}" ${off ? 'disabled' : ''} type="${v.name === 'NUMERIC' ? 'number' : 'text'}"
      min="${v.properties?.MinValue ?? ''}" max="${v.properties?.MaxValue ?? ''}" value="${value(f)}" />`;
  }

  function bar() {
    const n = changes().length;
    const s = state.status;
    return html`${s ? html`<span class="alert tone-${s.error ? 'err' : 'ok'}" role="status">${s.text}</span>`
      : html`<span class="muted">${L(n ? (n === 1 ? 'AbpAdmin::Features:UnsavedOne' : 'AbpAdmin::Features:UnsavedMany') : 'AbpAdmin::Features:NoChanges', String(n))}</span>`}
      <span class="spacer"></span>
      <button class="btn" type="button" data-act="reset" ${state.saving ? 'disabled' : ''} title="${L('AbpAdmin::Features:ResetTitle')}">${L('AbpAdmin::Features:ResetToDefaults')}</button>
      <button class="btn primary" type="button" data-act="save" ${!n || state.saving ? 'disabled' : ''}>${L(state.saving ? 'AbpAdmin::Common:Saving' : 'AbpAdmin::Common:Save')}</button>`;
  }
  const paintBar = () => { const el = root.querySelector('#abp-features-bar'); if (el) render(el, bar()); };

  function body() {
    if (state.loading) return html`<div class="skeleton rows card">${[1, 2, 3].map(() => html`<i></i>`)}</div>`;
    if (state.error) return html`<div class="card state err">${L('AbpAdmin::Features:LoadFailed')} <button class="btn" type="button" data-act="retry">${L('AbpAdmin::Common:Retry')}</button></div>`;
    if (!state.groups.length) return html`<div class="card state empty">
      ${icon('M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0')}
      <b>${L('AbpAdmin::Features:EmptyTitle')}</b>
      <span class="muted center">${L('AbpAdmin::Features:EmptyHint', 'FeatureDefinitionProvider')}</span></div>`;
    return html`${state.groups.map(g => html`<section class="card group" aria-labelledby="fg-${g.name}">
        <h2 id="fg-${g.name}">${g.displayName}</h2>
        ${g.features.map(f => {
          const off = disabled(f);
          return html`<div class="feat ${off ? 'off' : ''}" style="--d: ${f.depth ?? 0}">
            <div class="txt"><b>${f.displayName}</b>${f.description ? html`<small>${f.description}</small>` : ''}<small class="mono">${f.name}</small></div>
            ${control(f, off)}</div>`;
        })}
      </section>`)}
      <footer class="card bar" id="abp-features-bar">${bar()}</footer>`;
  }

  function draw() {
    render(root, html`${PARAMS.providerKey ? '' : html`
      <header class="top">
        <div><h1>${L('AbpAdmin::Features:Title')}</h1><p class="muted">${L('AbpAdmin::Features:Subtitle')}</p></div>
      </header>`}${body()}`);
  }

  async function load() {
    state.loading = true; state.error = false; draw();
    try {
      const res = await api.get(URL, PARAMS);
      state.groups = (res.groups ?? []).filter(g => g.features?.length);
      state.original = new Map(all().map(f => [f.name, f.value ?? '']));
      state.values = new Map(state.original);
    } catch { state.error = true; }
    state.loading = false; draw();
  }

  function set(f, v) {
    state.status = null;
    state.values.set(f.name, v);
  }
  const find = el => all().find(f => f.name === el.dataset.f);

  // Text inputs only repaint the footer (keeps focus); toggles/selects can lock children, so they redraw.
  on(root, 'input', 'input.input[data-f]', (e, el) => { set(find(el), el.value); paintBar(); });
  on(root, 'change', 'input.switch[data-f], select[data-f]', (e, el) => {
    set(find(el), el.type === 'checkbox' ? (el.checked ? 'true' : 'false') : el.value);
    const name = el.dataset.f;
    draw();
    [...root.querySelectorAll('[data-f]')].find(x => x.dataset.f === name)?.focus();
  });
  on(root, 'click', '[data-act=retry]', load);

  async function run(req, done) {
    state.saving = true; state.status = null; paintBar();
    try { await req(); state.saving = false; await load(); state.status = { text: done }; paintBar(); }
    catch (err) { state.saving = false; state.status = { text: errorText(err), error: true }; paintBar(); }
  }
  on(root, 'click', '[data-act=save]', () => run(() => api.request('PUT', URL, { params: PARAMS, body: { features: changes() } }), L('AbpAdmin::Features:Saved')));
  on(root, 'click', '[data-act=reset]', () => run(() => api.delete(URL, PARAMS), L('AbpAdmin::Features:ResetDone')));

  load();
  }

  AbpAdmin.features = { mount };
  const page = document.getElementById('abp-features');
  if (page) mount(page, '');
})();
