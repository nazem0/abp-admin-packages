// Entity changes page: change-type totals, filters (range, entity-type multi-select picker, entity id), change feed, entity history sheet.
(function () {
  const { html, raw, render, on, api, L, fmt } = AbpAdmin;
  const root = document.getElementById('abp-entity-changes');
  const PAGE_SIZE_DEFAULT = 30;
  const HIDE_SYSTEM_KEY = 'abp-admin.entity-changes.hide-system';
  /** Bookkeeping columns ABP touches on every update; listed last so the meaningful property names show first. */
  const NOISE = new Set(['EntityVersion', 'ConcurrencyStamp', 'LastModificationTime', 'LastModifierId', 'ExtraProperties']);
  /** Framework bookkeeping that floods the feed on every sign-in; hidden unless asked for. */
  const SYSTEM_ENTITY_TYPES = [
    'Volo.Abp.OpenIddict.Tokens.OpenIddictToken',
    'Volo.Abp.OpenIddict.Authorizations.OpenIddictAuthorization',
    'Volo.Abp.Identity.IdentitySecurityLog',
    'Volo.Abp.Identity.IdentityUserToken',
    'Volo.Abp.Identity.IdentitySession',
  ];
  const KINDS = [
    { type: 0, label: 'AbpAdmin::EntityChanges:Kind:Created', hint: 'AbpAdmin::EntityChanges:Kind:CreatedHint', icon: 'M12 5v14M5 12h14' },
    { type: 1, label: 'AbpAdmin::EntityChanges:Kind:Updated', hint: 'AbpAdmin::EntityChanges:Kind:UpdatedHint', icon: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4' },
    { type: 2, label: 'AbpAdmin::EntityChanges:Kind:Deleted', hint: 'AbpAdmin::EntityChanges:Kind:DeletedHint', icon: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' },
  ];
  const ENTITY_ICON = 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5';
  const svg = d => html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" /></svg>`;

  const readHideSystem = () => { try { return localStorage.getItem(HIDE_SYSTEM_KEY) !== 'false'; } catch { return true; } };
  const writeHideSystem = v => { try { localStorage.setItem(HIDE_SYSTEM_KEY, String(v)); } catch { /* storage blocked */ } };

  const state = {
    range: '7d', win: fmt.rangeWindow('7d'),
    entityTypes: [], hideSystem: readHideSystem(), changeType: null, entityId: '', page: 0, size: AbpAdmin.pageSize(PAGE_SIZE_DEFAULT),
    typeCounts: [], counts: null, changes: null, loading: false, error: false,
  };

  // ---------- entity type picker (port of entity-type-picker.component) ----------
  const moduleOf = type => {
    const parts = type.split('.');
    return parts[0] === 'Volo' && parts[1] === 'Abp' && parts.length > 3 ? parts[2] : parts.length > 1 ? parts[0] : 'Other';
  };
  const sum = types => types.reduce((n, t) => n + (t.count ?? 0), 0);
  const picker = { query: '', open: false };
  const pk = name => root.querySelector(`[data-pp=${name}]`);

  const shown = () => state.typeCounts.filter(t => !state.hideSystem || !SYSTEM_ENTITY_TYPES.includes(t.entityTypeFullName));
  /** Grouped by module, biggest first. */
  function groups() {
    const words = picker.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const map = new Map();
    for (const t of shown()) {
      const name = t.entityTypeFullName;
      if (words.length && !words.every(w => name.toLowerCase().includes(w))) continue;
      const mod = moduleOf(name);
      map.set(mod, [...(map.get(mod) ?? []), t]);
    }
    return [...map].map(([name, types]) => ({ name, types })).sort((a, b) => sum(b.types) - sum(a.types));
  }
  const isOn = t => state.entityTypes.includes(t.entityTypeFullName);
  const allIn = types => types.every(isOn);

  function drawPickerTrigger() {
    const s = state.entityTypes;
    const label = !s.length ? L('AbpAdmin::EntityChanges:AllEntityTypes') : s.length === 1 ? fmt.shortType(s[0]) : `${fmt.shortType(s[0])} +${s.length - 1}`;
    const trigger = pk('trigger');
    trigger.classList.toggle('on', s.length > 0);
    render(trigger, html`${svg(ENTITY_ICON)}<span class="lbl">${label}</span>${s.length > 1 ? html`<span class="n">${s.length}</span>` : ''}
      <svg class="caret" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>`);
  }

  function drawPickerBody() {
    const body = pk('body');
    const focused = document.activeElement?.closest?.('.opt input') ? document.activeElement.dataset.type : null;
    const scroll = body.scrollTop;
    const list = shown();
    const total = sum(list);
    const max = Math.max(1, ...list.map(t => t.count ?? 0));
    const gs = groups();
    render(body, html`
      ${!picker.query ? html`<button type="button" class="all ${state.entityTypes.length ? '' : 'on'}" data-act="all">
        <span class="box" aria-hidden="true">${!state.entityTypes.length ? '✓' : ''}</span><b>${L('AbpAdmin::EntityChanges:AllEntityTypes')}</b><span class="count">${total}</span></button>` : ''}
      ${gs.length ? gs.map(g => html`<section>
        <header><span>${g.name}</span><button type="button" class="link" data-group="${g.name}">${L(allIn(g.types) ? 'AbpAdmin::Common:Clear' : 'AbpAdmin::EntityChanges:SelectAll')}</button></header>
        ${g.types.map(t => html`<label class="opt ${isOn(t) ? 'on' : ''}">
          <input type="checkbox" data-type="${t.entityTypeFullName}" ${isOn(t) ? raw('checked') : ''} />
          <span class="txt"><b>${fmt.shortType(t.entityTypeFullName)}</b><small>${t.entityTypeFullName}</small></span>
          <span class="bar" aria-hidden="true"><i style="width:${(t.count / max) * 100}%"></i></span>
          <span class="count">${t.count}</span></label>`)}
      </section>`) : html`<p class="none">${L(picker.query ? 'AbpAdmin::EntityChanges:NoTypeMatches' : 'AbpAdmin::EntityChanges:NoChangesInRange', picker.query)}</p>`}`);
    body.scrollTop = scroll;
    if (focused) [...body.querySelectorAll('.opt input')].find(i => i.dataset.type === focused)?.focus();
  }

  function drawPickerFooter() {
    const n = state.entityTypes.length;
    render(pk('footer'), html`
      <span class="muted">${L(n ? 'AbpAdmin::EntityChanges:SelectedCount' : 'AbpAdmin::EntityChanges:ShowingAllTypes', String(n))}</span>
      ${n ? html`<button type="button" class="btn sm" data-act="clear">${L('AbpAdmin::Common:Clear')}</button>` : ''}
      <button type="button" class="btn sm primary" data-act="done">${L('AbpAdmin::EntityChanges:Done')}</button>`);
  }

  function drawPickerHint() {
    const hidden = state.typeCounts.length - shown().length;
    render(pk('hint'), html`${L(hidden ? 'AbpAdmin::EntityChanges:HideSystemHintCount' : 'AbpAdmin::EntityChanges:HideSystemHint', String(hidden))}`);
    pk('switch').checked = state.hideSystem;
  }

  const drawPicker = () => { drawPickerTrigger(); drawPickerBody(); drawPickerFooter(); drawPickerHint(); };

  /** Anchor the top-layer panel under the trigger, flipping/clamping to stay on screen. */
  function place() {
    if (!picker.open || innerWidth <= 560) return;
    const r = pk('trigger').getBoundingClientRect();
    const el = pk('panel');
    const w = el.offsetWidth;
    el.style.left = `${Math.min(Math.max(12, r.left), innerWidth - w - 12)}px`;
    const below = innerHeight - r.bottom;
    if (below >= 320 || below >= r.top) { el.style.top = `${r.bottom + 6}px`; el.style.bottom = 'auto'; }
    else { el.style.bottom = `${innerHeight - r.top + 6}px`; el.style.top = 'auto'; }
  }

  function selectTypes(list) {
    state.entityTypes = list; state.page = 0;
    drawPicker(); drawChips(); drawClear(); reload({ counts: true, changes: true });
  }

  function setHideSystem(v) {
    state.hideSystem = v; state.page = 0; writeHideSystem(v);
    drawPicker(); drawChips(); reload({ counts: true, changes: true });
  }

  function wirePicker() {
    const panel = pk('panel'), trigger = pk('trigger'), q = pk('query');
    trigger.addEventListener('click', () => panel.togglePopover());
    panel.addEventListener('toggle', e => {
      picker.open = e.newState === 'open';
      if (picker.open) { picker.query = ''; q.value = ''; drawPickerBody(); place(); q.focus(); }
      else trigger.focus();
    });
    addEventListener('resize', place);
    addEventListener('scroll', place);
    q.addEventListener('input', () => { picker.query = q.value; drawPickerBody(); });
    pk('switch').addEventListener('change', e => setHideSystem(e.target.checked));
    on(panel, 'change', '.opt input', (e, el) => {
      const t = el.dataset.type;
      selectTypes(state.entityTypes.includes(t) ? state.entityTypes.filter(x => x !== t) : [...state.entityTypes, t]);
    });
    on(panel, 'click', '[data-act=all]', () => selectTypes([]));
    on(panel, 'click', '[data-act=clear]', () => selectTypes([]));
    on(panel, 'click', '[data-act=done]', () => panel.hidePopover());
    on(panel, 'click', '[data-group]', (e, el) => {
      const types = groups().find(g => g.name === el.dataset.group)?.types ?? [];
      const names = types.map(t => t.entityTypeFullName);
      selectTypes(allIn(types) ? state.entityTypes.filter(x => !names.includes(x)) : [...new Set([...state.entityTypes, ...names])]);
    });
    // Arrow keys move between the search box and the options.
    panel.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [q, ...panel.querySelectorAll('.all, .opt input')];
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    });
  }

  // ---------- page ----------
  const slot = name => root.querySelector(`[data-slot=${name}]`);
  const filtered = () => !!(state.entityTypes.length || state.changeType !== null || state.entityId);

  function drawActions() {
    render(slot('actions'), html`
      <div class="seg" role="radiogroup" aria-label="${L('AbpAdmin::EntityChanges:TimeRange')}">
        ${fmt.RANGES.map(r => html`<button role="radio" type="button" aria-checked="${String(state.range === r.key)}" data-range="${r.key}">${L(r.labelKey)}</button>`)}
      </div>
      ${AbpAdmin.exportButton()}
      <button class="icon-btn ${state.loading ? 'spin' : ''}" type="button" data-act="refresh" aria-label="${L('AbpAdmin::Common:Refresh')}" title="${L('AbpAdmin::Common:Refresh')}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg></button>`);
  }

  function drawKinds() {
    render(slot('kinds'), KINDS.map(k => html`
      <button class="kind card tone-${fmt.changeTone[k.type]} ${state.changeType !== null && state.changeType !== k.type ? 'dim' : ''}" type="button"
              aria-pressed="${String(state.changeType === k.type)}" data-kind="${k.type}">
        <span class="kind-icon" aria-hidden="true">${svg(k.icon)}</span>
        <span class="kind-text"><span class="muted">${L(k.label)}</span><strong>${state.counts?.[k.type] ?? '–'}</strong><small class="muted">${L(k.hint)}</small></span>
      </button>`));
  }

  const drawClear = () => render(slot('clear'), filtered() ? html`<button class="link" type="button" data-act="clear-all">${L('AbpAdmin::EntityChanges:ClearFilters')}</button>` : '');

  function drawChips() {
    render(slot('chips'), state.entityTypes.length || state.hideSystem ? html`<div class="chips" aria-label="${L('AbpAdmin::EntityChanges:ActiveTypeFilters')}">
      ${state.entityTypes.map(t => html`<button class="chip" type="button" data-remove-type="${t}" title="${L('AbpAdmin::EntityChanges:RemoveFilter', t)}">${fmt.shortType(t)} <span aria-hidden="true">×</span></button>`)}
      ${state.hideSystem ? html`<button class="chip ghost" type="button" data-show-system title="${L('AbpAdmin::EntityChanges:ShowSystemHint')}">${L('AbpAdmin::EntityChanges:SystemHidden')} <span aria-hidden="true">×</span></button>` : ''}
    </div>` : '');
  }

  /** "Email, PhoneNumber +2" for updates; a short phrase otherwise. */
  function summary(c) {
    const names = c.propertyChanges.map(p => p.propertyName ?? '?').sort((a, b) => Number(NOISE.has(a)) - Number(NOISE.has(b)));
    if (c.changeType === 1) {
      return names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') : L('AbpAdmin::EntityChanges:Summary:NoPropertyChanges');
    }
    return c.changeType === 0 ? L(names.length === 1 ? 'AbpAdmin::EntityChanges:Summary:WithPropertyOne' : 'AbpAdmin::EntityChanges:Summary:WithPropertyMany', String(names.length))
      : L('AbpAdmin::EntityChanges:Summary:Removed');
  }

  function drawList() {
    const items = state.changes?.items ?? [];
    const el = slot('list');
    el.classList.toggle('loading', state.loading);
    const groupsByDay = [];
    items.forEach((c, i) => {
      const day = fmt.dayLabel(c.changeTime);
      if (groupsByDay.at(-1)?.day !== day) groupsByDay.push({ day, items: [] });
      groupsByDay.at(-1).items.push({ c, i });
    });
    render(el, html`
      ${state.error ? html`<div class="state err">${L('AbpAdmin::EntityChanges:LoadFailed')} <button class="btn" type="button" data-act="refresh">${L('AbpAdmin::Common:Retry')}</button></div>` : ''}
      ${groupsByDay.length ? groupsByDay.map(g => html`<h2 class="day-head"><span>${g.day}</span></h2><ul>${g.items.map(({ c, i }) => html`<li>
        <button class="row tone-${fmt.changeTone[c.changeType]}" type="button" data-i="${i}"
                aria-label="${L(fmt.changeLabelKey[c.changeType])} ${fmt.shortType(c.entityTypeFullName)} ${c.entityId}">
          <span class="dot" aria-hidden="true"></span>
          <span class="ent"><b>${fmt.shortType(c.entityTypeFullName)}</b><span class="mono muted">#${c.entityId}</span></span>
          <span class="what"><span class="verb">${L(fmt.changeLabelKey[c.changeType])}</span><span class="muted">${summary(c)}</span></span>
          <span class="who"><span class="avatar xs" aria-hidden="true">${(c.userName || '·')[0].toUpperCase()}</span><span>${c.userName ?? L('AbpAdmin::EntityChanges:System')}</span></span>
          <span class="time">${fmt.clock(c.changeTime)}</span>
        </button></li>`)}</ul>`)
        : state.loading ? html`<div class="skeleton rows">${[1, 2, 3, 4, 5, 6].map(() => html`<i></i>`)}</div>`
        : !state.error ? html`<div class="state empty">
            ${svg(ENTITY_ICON)}
            <b>${L('AbpAdmin::EntityChanges:Empty:Title')}</b>
            <span class="muted">${L('AbpAdmin::EntityChanges:Empty:Text')}</span>
            ${filtered() ? html`<button class="btn" type="button" data-act="clear-all">${L('AbpAdmin::EntityChanges:ClearFilters')}</button>` : ''}
          </div>` : ''}`);
  }

  function drawPager() {
    const total = state.changes?.totalCount ?? 0;
    render(slot('pager'), total > 0 ? AbpAdmin.pager(total, state.page, state.size) : '');
  }

  function drawSkeleton() {
    render(root, html`
      <header class="top">
        <div><h1>${L('AbpAdmin::EntityChanges:Title')}</h1><p class="muted">${L('AbpAdmin::EntityChanges:Subtitle')}</p></div>
        <div class="top-actions" data-slot="actions"></div>
      </header>

      <div class="kinds" role="group" aria-label="${L('AbpAdmin::EntityChanges:FilterByChangeType')}" data-slot="kinds"></div>

      <section class="card stream">
        <div class="filters">
          <div class="etp" data-slot="picker">
            <button type="button" class="trigger" data-pp="trigger" aria-haspopup="dialog" aria-controls="etp-panel"></button>
            <div id="etp-panel" popover="auto" class="panel" role="dialog" data-pp="panel" aria-label="${L('AbpAdmin::EntityChanges:FilterByEntityType')}">
              <div class="head">
                <label class="search">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                  <input class="input" type="search" data-pp="query" placeholder="${L('AbpAdmin::EntityChanges:SearchEntityTypes')}" aria-label="${L('AbpAdmin::EntityChanges:SearchEntityTypesLabel')}" autocomplete="off" />
                </label>
                <label class="sys">
                  <input type="checkbox" class="switch" data-pp="switch" />
                  <span>${L('AbpAdmin::EntityChanges:HideSystemEntities')} <small data-pp="hint"></small></span>
                </label>
              </div>
              <div class="body" data-pp="body"></div>
              <footer data-pp="footer"></footer>
            </div>
          </div>
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <span class="sr-only">${L('AbpAdmin::EntityChanges:EntityId')}</span>
            <input class="input" data-f="entityId" placeholder="${L('AbpAdmin::EntityChanges:SearchById')}" value="${state.entityId}" />
          </label>
          <div data-slot="clear"></div>
        </div>
        <div data-slot="chips"></div>
        <div class="list" data-slot="list" aria-live="polite"></div>
        <div data-slot="pager"></div>
      </section>`);
    drawActions(); drawKinds(); drawClear(); drawChips(); drawList(); drawPager();
    wirePicker(); drawPicker();
  }

  // ---------- data ----------
  const tokens = { facets: 0, counts: 0, changes: 0 };
  const base = () => ({
    ...state.win,
    entityTypeFullNames: state.entityTypes.length ? state.entityTypes : undefined,
    excludedEntityTypeFullNames: state.hideSystem ? SYSTEM_ENTITY_TYPES : undefined,
    entityId: state.entityId || undefined,
  });

  /** Range / change type / id feed the per-type counts; types / system switch feed the totals; everything feeds the list. */
  function reload({ facets, counts, changes }) {
    if (facets) {
      const token = ++tokens.facets;
      api.get('/api/abp-admin/audit-log/entity-type-counts', { ...state.win, changeType: state.changeType ?? undefined, entityId: state.entityId || undefined })
        .then(r => { if (token === tokens.facets) { state.typeCounts = r ?? []; drawPicker(); } })
        .catch(() => { if (token === tokens.facets) { state.typeCounts = []; drawPicker(); } });
    }
    if (counts) {
      const token = ++tokens.counts;
      Promise.all(KINDS.map(k => api.get('/api/abp-admin/audit-log/entity-changes', { ...base(), changeType: k.type, maxResultCount: 1 }).then(r => r.totalCount)))
        .then(totals => { if (token === tokens.counts) { state.counts = Object.fromEntries(KINDS.map((k, i) => [k.type, totals[i]])); drawKinds(); } })
        .catch(() => { if (token === tokens.counts) { state.counts = null; drawKinds(); } });
    }
    if (changes) {
      const token = ++tokens.changes;
      state.loading = true; state.error = false; drawActions(); drawList();
      api.get('/api/abp-admin/audit-log/entity-changes', { ...base(), changeType: state.changeType ?? undefined, skipCount: state.page * state.size, maxResultCount: state.size })
        .then(r => { if (token !== tokens.changes) return; state.changes = r; if (AbpAdmin.pastEnd(state, r.totalCount)) reload({ changes: true }); })
        .catch(() => { if (token === tokens.changes) { state.changes = null; state.error = true; } })
        .finally(() => { if (token === tokens.changes) { state.loading = false; drawActions(); drawList(); drawPager(); } });
    }
  }

  const reloadAll = () => reload({ facets: true, counts: true, changes: true });

  // ---------- events ----------
  on(root, 'click', '[data-range]', (e, el) => {
    state.range = el.dataset.range; state.page = 0; state.win = fmt.rangeWindow(state.range);
    drawActions(); reloadAll();
  });
  on(root, 'click', '[data-act=refresh]', () => { state.win = fmt.rangeWindow(state.range); reloadAll(); });
  on(root, 'click', '[data-act=export]', () => AbpAdmin.download('/api/abp-admin/audit-log/export-entity-changes',
    { ...base(), changeType: state.changeType ?? undefined }, 'entity-changes.csv'));
  on(root, 'click', '[data-kind]', (e, el) => {
    const type = +el.dataset.kind;
    state.changeType = state.changeType === type ? null : type; state.page = 0;
    drawKinds(); drawClear(); reload({ facets: true, changes: true });
  });
  on(root, 'change', '[data-f=entityId]', (e, el) => {
    state.entityId = el.value.trim(); state.page = 0;
    drawClear(); reloadAll();
  });
  on(root, 'click', '[data-act=clear-all]', () => {
    Object.assign(state, { entityTypes: [], changeType: null, entityId: '', page: 0 });
    root.querySelector('[data-f=entityId]').value = '';
    drawPicker(); drawKinds(); drawClear(); drawChips(); reloadAll();
  });
  on(root, 'click', '[data-remove-type]', (e, el) => selectTypes(state.entityTypes.filter(t => t !== el.dataset.removeType)));
  on(root, 'click', '[data-show-system]', () => setHideSystem(false));
  AbpAdmin.onPager(root, (page, size) => { state.page = page; state.size = size; reload({ changes: true }); });
  on(root, 'click', '.row[data-i]', (e, el) => {
    const c = state.changes.items[+el.dataset.i];
    AbpAdmin.auditLogging.openEntityHistory({ type: c.entityTypeFullName, id: c.entityId, focus: c.id });
  });

  drawSkeleton();
  reloadAll();
  // ?type=&id=: open that entity's history (links from the Users, Roles and Tenants pages).
  const deep = AbpAdmin.params();
  if (deep.get('type') && deep.get('id')) AbpAdmin.auditLogging.openEntityHistory({ type: deep.get('type'), id: deep.get('id') });
})();
