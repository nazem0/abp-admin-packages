// Identity & sign-in settings tab (port of identity-settings.component.ts): password policy, lockout, sign-in, self-registration.
(function () {
  const { html, render, on, api, L, toast, errorText } = AbpAdmin;
  const root = document.getElementById('abp-identity-settings');
  if (!root) return;

  /** The API groups settings under English names; their headings are translated here. */
  const TITLE = { Password: 'Group:Password', Lockout: 'Group:Lockout', 'Sign-in': 'Group:SignIn', User: 'Group:User' };
  const INTRO = { Password: 'Intro:Password', Lockout: 'Intro:Lockout', 'Sign-in': 'Intro:SignIn', User: 'Intro:User' };
  const K = k => `AbpAdmin::Settings:Identity:${k}`;

  const state = { groups: [], saved: new Map(), values: new Map(), loading: true, error: false, saving: false };

  const changes = () => [...state.values].filter(([k, v]) => state.saved.get(k) !== v).map(([name, value]) => ({ name, value }));
  const value = s => state.values.get(s.name) ?? '';
  const isTrue = v => v === 'true' || v === 'True';

  render(root, html`<section class="card ids" aria-labelledby="ids-h">
    <header>
      <div><h2 id="ids-h">${L(K('Title'))}</h2><p class="muted">${L(K('Intro'), 'appsettings.json')}</p></div>
      <div class="acts" id="ids-acts"></div>
    </header>
    <div id="ids-body"></div>
  </section>`);
  const actsEl = root.querySelector('#ids-acts');
  const bodyEl = root.querySelector('#ids-body');

  function drawActs() {
    const n = changes().length;
    render(actsEl, html`${n ? html`<span class="muted small">${L('AbpAdmin::Settings:Unsaved', String(n))}</span>` : ''}
      <button class="btn" type="button" data-act="reset" ${!n || state.saving ? 'disabled' : ''}>${L('AbpAdmin::Common:Reset')}</button>
      <button class="btn primary" type="button" data-act="save" ${!n || state.saving ? 'disabled' : ''}>${L(state.saving ? 'AbpAdmin::Common:Saving' : 'AbpAdmin::Common:Save')}</button>`);
  }

  function drawBody() {
    render(bodyEl, state.loading ? html`<div class="skeleton rows">${[1, 2, 3, 4].map(() => html`<i></i>`)}</div>`
      : state.error ? html`<div class="state err">${L(K('LoadFailed'))} <button class="btn" type="button" data-act="reload">${L('AbpAdmin::Common:Retry')}</button></div>`
      : html`<div class="groups">${state.groups.map(g => html`<fieldset>
          <legend>${TITLE[g.name] ? L(K(TITLE[g.name])) : g.name}</legend>
          <p class="muted small intro">${INTRO[g.name] ? L(K(INTRO[g.name])) : ''}</p>
          ${(g.settings ?? []).map(s => html`<div class="row" data-name="${s.name}">
            <label for="ids-${s.name}"><b>${s.displayName}</b>${s.description && s.description !== s.displayName ? html`<small>${s.description}</small>` : ''}</label>
            ${s.type === 'bool'
              ? html`<input type="checkbox" class="switch" id="ids-${s.name}" data-name="${s.name}" data-type="bool" ${isTrue(value(s)) ? 'checked' : ''} />`
              : html`<input class="input" id="ids-${s.name}" data-name="${s.name}" type="${s.type === 'number' ? 'number' : 'text'}" min="0" value="${value(s)}" />`}
          </div>`)}
        </fieldset>`)}</div>`);
  }

  async function load() {
    state.loading = true; state.error = false; drawBody(); drawActs();
    try {
      state.groups = await api.get('/api/abp-admin/identity-settings') ?? [];
      // Effective value: the stored one, else the definition default.
      state.saved = new Map(state.groups.flatMap(g => g.settings ?? []).map(s => [s.name, s.value ?? s.defaultValue ?? '']));
      state.values = new Map(state.saved);
    } catch { state.error = true; }
    state.loading = false; drawBody(); drawActs();
  }

  /** Update one row's value without re-rendering (keeps focus in the input being typed in). */
  function set(el) {
    const v = el.dataset.type === 'bool' ? (el.checked ? 'true' : 'false') : el.value;
    state.values.set(el.dataset.name, v);
    el.closest('.row').classList.toggle('changed', state.saved.get(el.dataset.name) !== v);
    drawActs();
  }
  on(root, 'input', '.row .input', (e, el) => set(el));
  on(root, 'change', '.row .switch', (e, el) => set(el));
  on(root, 'click', '[data-act=reload]', load);
  on(root, 'click', '[data-act=reset]', () => { state.values = new Map(state.saved); drawBody(); drawActs(); });
  on(root, 'click', '[data-act=save]', async () => {
    state.saving = true; drawActs();
    try {
      await api.put('/api/abp-admin/identity-settings', changes());
      state.saving = false; toast.ok(L(K('Saved'))); load();
    } catch (e) { state.saving = false; drawActs(); toast.error(errorText(e)); }
  });

  load();
})();
