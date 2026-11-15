/*
 * Audit logging, shared by the Audit logs and Entity changes pages (port of audit-log-detail, change-diff, entity-timeline and
 * entity-history). Exposes AbpAdmin.auditLogging = { openRequest(idOrDto), openEntityHistory({ type, id, focus }) }.
 */
(function () {
  const { html, raw, render, on, api, L, fmt, toast, errorText, sheet } = AbpAdmin;
  const { toMs, duration, shortType, actionLabel, changeLabelKey, changeTone, statusTone, methodTone, splitUrl, stamp, clock, relative, pretty, flatParams, plainValue, browserName } = fmt;

  const OPEN = raw('open');
  const CREATED = 0, UPDATED = 1, DELETED = 2;
  const initial = (s, fallback) => (s || fallback)[0].toUpperCase();
  const svg = (d, cls = '') => html`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" /></svg>`;
  const SHORT = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const FULL = { dateStyle: 'full', timeStyle: 'long' };
  const WHEN = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const DAY = { year: 'numeric', month: 'short', day: 'numeric' };
  const CLOSE = 'M6 6l12 12M18 6L6 18';

  // ---------- change diff: old → new per property ----------
  function diff(c) {
    if (!c.propertyChanges.length) return html`<p class="muted none">${L('AbpAdmin::EntityChanges:NoPropertyLevelChanges')}</p>`;
    return html`<table class="diff"><tbody>${c.propertyChanges.map(p => {
      const before = plainValue(p.originalValue), after = plainValue(p.newValue);
      return html`<tr>
        <th scope="row" title="${p.propertyTypeFullName ?? ''}">${p.propertyName}</th>
        <td>
          ${c.changeType !== CREATED ? html`<span class="old ${before === null ? 'nil' : ''}">${before ?? 'null'}</span>` : ''}
          ${c.changeType === UPDATED ? html`<span class="arrow" aria-label="${L('AbpAdmin::EntityChanges:ChangedTo')}">→</span>` : ''}
          ${c.changeType !== DELETED ? html`<span class="new ${after === null ? 'nil' : ''}">${after ?? 'null'}</span>` : ''}
        </td></tr>`;
    })}</tbody></table>`;
  }

  // ---------- entity timeline: an entity's changes, oldest first, each expandable ----------
  /** opts: { current (request id), focus (change id), canOpen, openState (id → bool, remembered across re-renders) } */
  function timeline(changes, { current = null, focus = null, canOpen = false, openState = {} } = {}) {
    return html`<ol class="timeline">${changes.map(e => {
      const highlighted = e.auditLogId === current || e.id === focus;
      const isOpen = openState[e.id] ?? (highlighted || changes.length === 1);
      const system = e.userName ?? L('AbpAdmin::EntityChanges:System');
      return html`<li class="tone-${changeTone[e.changeType]} ${highlighted ? 'current' : ''}" data-change="${e.id}">
        <details data-d="${e.id}" ${isOpen ? OPEN : ''}>
          <summary class="tl-head">
            <b>${L(changeLabelKey[e.changeType])}</b>
            <span class="muted">${L('AbpAdmin::EntityChanges:ByUser', system)} · ${stamp(e.changeTime, WHEN)}</span>
            <span class="muted props">${L(e.propertyChanges.length === 1 ? 'AbpAdmin::EntityChanges:PropertyOne' : 'AbpAdmin::EntityChanges:PropertyMany', String(e.propertyChanges.length))}</span>
            ${e.auditLogId === current ? html`<span class="pill xs tone-info">${L('AbpAdmin::EntityChanges:ThisRequest')}</span>` : ''}
          </summary>
          ${e.url && canOpen ? html`<button class="req" type="button" data-act="open-request" data-id="${e.auditLogId}" title="${L('AbpAdmin::EntityChanges:OpenRequest')}">
            <span class="method tone-${methodTone(e.httpMethod)}">${e.httpMethod}</span><span class="mono">${e.url}</span>${svg('M7 17 17 7M9 7h8v8')}</button>` : ''}
          ${diff(e)}
        </details></li>`;
    })}</ol>`;
  }

  /** Remember which timeline <details> the user opened/closed, so re-rendering the sheet keeps them. */
  const rememberOpen = (dialog, openState) =>
    dialog.addEventListener('toggle', e => { const d = e.target; if (d.dataset?.d) openState[d.dataset.d] = d.open; }, true);

  function makeDialog(id, labelledBy) {
    const dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = 'al-sheet';
    dialog.setAttribute('aria-labelledby', labelledBy);
    document.body.append(dialog);
    return dialog;
  }

  /** Flash "copied" on every copy label of a sheet for a moment. */
  function copyText(dialog, text) {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      const labels = dialog.querySelectorAll('[data-lbl]');
      labels.forEach(el => { el.textContent = L('AbpAdmin::AuditLogs:Detail:CopiedCheck'); });
      setTimeout(() => labels.forEach(el => { el.textContent = el.dataset.lbl; }), 1400);
    });
  }

  // ---------- request detail sheet ----------
  const detail = (() => {
    let dialog, ui;
    const state = { log: null, tab: 'trace', history: {}, tlOpen: {} };

    const total = l => {
      // The request's own duration, stretched if a nested event lands after it (clock skew, deferred saves).
      const start = toMs(l.executionTime);
      return Math.max(1, l.executionDuration, ...l.actions.map(a => toMs(a.executionTime) - start + a.executionDuration), ...l.entityChanges.map(c => toMs(c.changeTime) - start));
    };

    /**
     * Request → actions → entity changes as a tree, flattened for the waterfall.
     * An action is the child of the action whose time window contains it; a change belongs to the deepest action containing
     * its timestamp, else the last action that started before it (EF saves at the end of the unit of work).
     */
    function rows(l) {
      const origin = toMs(l.executionTime), tot = total(l);
      const pct = ms => Math.min(100, Math.max(0, (ms / tot) * 100));
      const SLACK = 2;
      const roots = [], rootChanges = [], all = [], stack = [];
      const sorted = [...l.actions].sort((a, b) => toMs(a.executionTime) - toMs(b.executionTime) || b.executionDuration - a.executionDuration);
      for (const action of sorted) {
        const start = toMs(action.executionTime);
        const node = { action, start, end: start + action.executionDuration, children: [], changes: [] };
        while (stack.length && !(start >= stack.at(-1).start && node.end <= stack.at(-1).end + SLACK)) stack.pop();
        (stack.at(-1)?.children ?? roots).push(node);
        stack.push(node); all.push(node);
      }
      for (const c of [...l.entityChanges].sort((a, b) => toMs(a.changeTime) - toMs(b.changeTime))) {
        const t = toMs(c.changeTime);
        const containing = all.filter(n => t >= n.start - SLACK && t <= n.end + SLACK);
        const owner = containing.at(-1) ?? all.filter(n => n.start <= t).at(-1);
        (owner?.changes ?? rootChanges).push(c);
      }
      const out = [];
      let step = 0;
      const guidesOf = trail => trail.flatMap((open, k) => (open ? [k + 1] : []));
      const changeRow = (c, depth, last, trail) => ({
        kind: 'change', id: c.id, depth, last, guides: guidesOf(trail), label: shortType(c.entityTypeFullName),
        sub: `${L(changeLabelKey[c.changeType])} · ${L(c.propertyChanges.length === 1 ? 'AbpAdmin::AuditLogs:Detail:PropertyCountOne' : 'AbpAdmin::AuditLogs:Detail:PropertyCountMany', String(c.propertyChanges.length))}`,
        left: pct(toMs(c.changeTime) - origin), tone: changeTone[c.changeType], change: c,
      });
      const walk = (nodes, changes, depth, trail) => {
        const count = nodes.length + changes.length;
        nodes.forEach((n, i) => {
          const isApi = /Controller$/.test(n.action.serviceName ?? '');
          const last = i === count - 1;
          out.push({
            kind: 'action', id: n.action.id, depth, last, guides: guidesOf(trail),
            label: actionLabel(n.action.serviceName, n.action.methodName), sub: duration(n.action.executionDuration), badge: isApi ? 'API' : 'Service',
            left: pct(n.start - origin), width: Math.max(0.8, pct(n.action.executionDuration)), tone: isApi ? 'info' : 'accent',
            params: pretty(n.action.parameters), service: n.action.serviceName ?? '', args: flatParams(n.action.parameters), step: ++step, offset: n.start - origin,
            share: Math.round((n.action.executionDuration / Math.max(1, l.executionDuration)) * 100),
          });
          walk(n.children, n.changes, depth + 1, [...trail, !last]);
        });
        changes.forEach((c, i) => out.push(changeRow(c, depth, nodes.length + i === count - 1, trail)));
      };
      walk(roots, rootChanges, 1, []);
      return out;
    }

    const tone = l => statusTone(l.httpStatusCode, !!l.exceptions);
    const firstExceptionLine = l => {
      const ex = l.exceptions ?? '';
      return ex.match(/"message"\s*:\s*"([^"]+)"/i)?.[1] ?? ex.split('\n')[0].slice(0, 220);
    };
    const copyLabel = (key, label) => html`<span class="muted" data-lbl="${L(key)}">${label}</span>`;

    function traceTab(l) {
      const tot = total(l);
      const rootWidth = (l.executionDuration / tot) * 100;
      const list = rows(l);
      const guides = r => r.guides.map(g => html`<span class="guide" style="--g:${g}" aria-hidden="true"></span>`);
      return html`
        ${l.exceptions ? html`<button class="callout tone-err" type="button" data-act="tab" data-tab="exception">
          ${svg('M12 8v5M12 16.5v.5M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z')}
          <span>${firstExceptionLine(l)}</span><b>${L('AbpAdmin::AuditLogs:Detail:ViewException')}</b></button>` : ''}
        <div class="waterfall" role="tree" aria-label="${L('AbpAdmin::AuditLogs:Detail:RequestTrace')}">
          <div class="axis" aria-hidden="true"><span class="axis-label"></span>
            <div class="track">${[0, 0.25, 0.5, 0.75, 1].map(p => html`<span class="tick" style="left:${p * 100}%">${duration(tot * p)}</span>`)}</div></div>
          <div class="row root" role="treeitem" aria-level="1" aria-expanded="true">
            <span class="row-label"><span class="dot tone-${tone(l)}"></span><b>${L('AbpAdmin::AuditLogs:Detail:Request')}</b><span class="muted">${duration(l.executionDuration)}</span></span>
            <div class="track"><span class="bar tone-${tone(l)}" style="left:0;width:${rootWidth}%"></span></div>
          </div>
          <div class="tree">
            ${list.length ? list.map((r, i) => r.kind === 'action' ? html`
              <div class="node">
                <button class="row ${r.last ? 'last' : ''}" type="button" data-act="toggle" aria-expanded="false" aria-controls="al-p-${i}" role="treeitem" aria-level="${r.depth + 1}" style="--depth:${r.depth}">
                  <span class="row-label">${guides(r)}<span class="elbow" aria-hidden="true"></span>${svg('M9 6l6 6-6 6', 'chev')}
                    <span class="kind tone-${r.tone}">${r.badge === 'Service' ? L('AbpAdmin::AuditLogs:Detail:Service') : r.badge}</span>
                    <span class="name" title="${r.service}">${r.label}</span><span class="muted">${r.sub}</span></span>
                  <div class="track"><span class="bar tone-${r.tone}" style="left:${r.left}%;width:${r.width}%"></span></div>
                </button>
                <div class="params" id="al-p-${i}" style="--depth:${r.depth}" hidden>
                  <div class="step-meta">
                    <span class="step-no">${L('AbpAdmin::AuditLogs:Detail:Step', String(r.step))}</span>
                    <span>${L('AbpAdmin::AuditLogs:Detail:Starts')} <b>+${duration(r.offset)}</b></span>
                    <span>${L('AbpAdmin::AuditLogs:Detail:Takes')} <b>${r.sub}</b><span class="muted">&nbsp;${L('AbpAdmin::AuditLogs:Detail:ShareOfRequest', String(r.share))}</span></span>
                  </div>
                  <p class="mono svc">${r.service}</p>
                  ${r.args.length ? html`
                    <div class="params-head"><span>${L('AbpAdmin::AuditLogs:Detail:Parameters')} <span class="count">${r.args.length}</span></span>
                      <button class="copy" type="button" data-act="copy" data-text="${r.params}" data-lbl="${L('AbpAdmin::AuditLogs:Detail:CopyJson')}">${L('AbpAdmin::AuditLogs:Detail:CopyJson')}</button></div>
                    <table class="kv"><tbody>${r.args.map(a => html`<tr><th scope="row" class="mono">${a.path}</th><td class="mono ${a.value === null ? 'nil' : ''}">${a.value ?? 'null'}</td></tr>`)}</tbody></table>
                    <details class="raw-json"><summary>${L('AbpAdmin::AuditLogs:Detail:RawJson')}</summary><pre>${r.params}</pre></details>`
                    : html`<p class="muted none">${L('AbpAdmin::AuditLogs:Detail:NoParameters')}</p>`}
                </div>
              </div>` : html`
              <div class="node">
                <button class="row change ${r.last ? 'last' : ''}" type="button" data-act="toggle" aria-expanded="false" aria-controls="al-p-${i}" role="treeitem" aria-level="${r.depth + 1}" style="--depth:${r.depth}"
                        title="${r.change.entityTypeFullName} #${r.change.entityId}">
                  <span class="row-label">${guides(r)}<span class="elbow" aria-hidden="true"></span><span class="diamond tone-${r.tone}" aria-hidden="true"></span>
                    <span class="name">${r.label}</span><span class="pill xs tone-${r.tone}">${r.sub}</span></span>
                  <div class="track"><span class="marker tone-${r.tone}" style="left:${r.left}%"></span></div>
                </button>
                <div class="params" id="al-p-${i}" style="--depth:${r.depth}" hidden>
                  <div class="step-meta">
                    <span class="mono muted">${r.change.entityTypeFullName} #${r.change.entityId}</span>
                    <button class="copy link-btn" type="button" data-act="show-change" data-id="${r.change.id}">${L('AbpAdmin::AuditLogs:Detail:OpenInChanges')}</button>
                  </div>
                  ${diff(r.change)}
                </div>
              </div>`) : html`<p class="muted none">${L('AbpAdmin::AuditLogs:Detail:NoActions')}</p>`}
          </div>
        </div>`;
    }

    const entityKey = c => `${c.entityTypeFullName}|${c.entityId}`;

    function changesTab(l) {
      const groups = new Map();
      for (const c of l.entityChanges) groups.set(entityKey(c), [...(groups.get(entityKey(c)) ?? []), c]);
      return html`<div class="entities">${[...groups.entries()].map(([key, changes]) => {
        const first = changes[0], h = state.history[key];
        return html`<article class="entity card">
          <header>
            <span class="avatar sq">${shortType(first.entityTypeFullName)[0]}</span>
            <div class="ent-title"><b>${shortType(first.entityTypeFullName)}</b><span class="mono muted" title="${first.entityTypeFullName}">#${first.entityId}</span></div>
            <button class="btn sm" type="button" data-act="history" data-key="${key}" aria-expanded="${String(!!h)}">
              ${svg('M3 12a9 9 0 103-6.7L3 8M3 3v5h5M12 7v5l3 2')}
              ${L(h ? 'AbpAdmin::AuditLogs:Detail:HideHistory' : 'AbpAdmin::AuditLogs:Detail:History')}</button>
          </header>
          ${changes.map(c => html`<section class="change-block" id="al-chg-${c.id}">
            <div class="change-meta"><span class="pill tone-${changeTone[c.changeType]}">${L(changeLabelKey[c.changeType])}</span><span class="muted">${clock(c.changeTime)}</span></div>
            ${diff(c)}</section>`)}
          ${h ? html`<div class="history">${h === 'loading' ? html`<p class="muted">${L('AbpAdmin::AuditLogs:Detail:LoadingHistory')}</p>` : html`
            <h4>${L('AbpAdmin::AuditLogs:Detail:Timeline')} <span class="muted">${L(h.length === 1 ? 'AbpAdmin::AuditLogs:Detail:ChangeCountOne' : 'AbpAdmin::AuditLogs:Detail:ChangeCountMany', String(h.length))}</span></h4>
            ${timeline(h, { current: l.id, openState: state.tlOpen })}`}</div>` : ''}
        </article>`;
      })}</div>`;
    }

    function rawTab(l) {
      const row = (key, value, cls = '') => html`<dt>${L(key)}</dt><dd class="${cls}">${value}</dd>`;
      return html`<dl class="raw">
        ${row('AbpAdmin::AuditLogs:Detail:Id', l.id, 'mono')}${row('AbpAdmin::AuditLogs:Detail:Application', l.applicationName ?? '—')}
        ${row('AbpAdmin::AuditLogs:Detail:Url', l.url, 'mono')}${row('AbpAdmin::AuditLogs:Detail:CorrelationId', l.correlationId, 'mono')}
        ${row('AbpAdmin::AuditLogs:Detail:ClientId', l.clientId ?? '—', 'mono')}${row('AbpAdmin::AuditLogs:Detail:ClientName', l.clientName ?? '—')}
        ${row('AbpAdmin::AuditLogs:Detail:Browser', l.browserInfo ?? '—', 'mono small')}${row('AbpAdmin::AuditLogs:Detail:Comments', l.comments || '—')}
      </dl>`;
    }

    function drawTabs() {
      const l = state.log;
      const tab = (value, label, count, extra = {}) => html`<li role="tab" data-tab="${value}" tabindex="${state.tab === value ? 0 : -1}" aria-selected="${String(state.tab === value)}"
        aria-disabled="${String(!!extra.disabled)}" class="${extra.cls ?? ''}">${label}${count != null ? html` <span class="count">${count}</span>` : ''}</li>`;
      render(dialog.querySelector('.tablist'), html`
        ${tab('trace', L('AbpAdmin::AuditLogs:Detail:Trace'), l.actions.length)}
        ${tab('changes', L('AbpAdmin::AuditLogs:Detail:Changes'), l.entityChanges.length, { disabled: !l.entityChanges.length })}
        ${l.exceptions ? tab('exception', L('AbpAdmin::AuditLogs:Detail:Exception'), null, { cls: 'ex-tab' }) : ''}
        ${tab('raw', L('AbpAdmin::AuditLogs:Detail:Raw'), null)}`);
    }

    function drawPanel() {
      const l = state.log;
      const view = state.tab === 'trace' ? traceTab(l) : state.tab === 'changes' ? changesTab(l)
        : state.tab === 'exception' ? html`<pre class="exception">${pretty(l.exceptions)}</pre>` : rawTab(l);
      const panel = dialog.querySelector('.panel');
      panel.id = `al-tab-${state.tab}`;
      render(panel, view);
    }

    function setTab(tab) {
      if (state.tab === tab) return;
      state.tab = tab; drawTabs(); drawPanel();
    }

    function draw() {
      const l = state.log;
      const url = splitUrl(l.url);
      render(dialog, html`
        <header class="head tone-${tone(l)}">
          <div class="title-row">
            <span class="pill">${l.httpStatusCode ?? '—'}</span>
            <span class="method tone-${methodTone(l.httpMethod)}">${l.httpMethod}</span>
            <h2 id="al-detail-title" class="url mono" title="${l.url}">${url.path}<span class="muted">${url.query}</span></h2>
            <button class="icon-btn" type="button" data-act="close" aria-label="${L('AbpAdmin::AuditLogs:Detail:CloseDetails')}" autofocus>${svg(CLOSE)}</button>
          </div>
          <dl class="meta">
            <div><dt>${L('AbpAdmin::AuditLogs:Detail:User')}</dt><dd><span class="avatar sm">${initial(l.userName, '?')}</span>${l.userName ?? L('AbpAdmin::AuditLogs:Anonymous')}
              ${l.impersonatorUserName ? html`<span class="muted">${L('AbpAdmin::AuditLogs:Detail:Via', l.impersonatorUserName)}</span>` : ''}</dd></div>
            <div><dt>${L('AbpAdmin::AuditLogs:Detail:When')}</dt><dd title="${stamp(l.executionTime, FULL)}">${relative(l.executionTime)} <span class="muted">${stamp(l.executionTime, SHORT)}</span></dd></div>
            <div><dt>${L('AbpAdmin::AuditLogs:Detail:Duration')}</dt><dd>${duration(l.executionDuration)}</dd></div>
            <div><dt>${L('AbpAdmin::AuditLogs:Detail:Client')}</dt><dd>${l.clientIpAddress ?? '—'} <span class="muted">· ${browserName(l.browserInfo)}</span></dd></div>
            ${l.clientId ? html`<div><dt>${L('AbpAdmin::AuditLogs:Detail:App')}</dt><dd class="mono">${l.clientId}</dd></div>` : ''}
            <div><dt>${L('AbpAdmin::AuditLogs:Detail:Correlation')}</dt>
              <dd><button class="copy mono" type="button" data-act="copy" data-text="${l.correlationId ?? ''}" title="${L('AbpAdmin::AuditLogs:Detail:CopyValue', l.correlationId ?? '')}">
                ${(l.correlationId ?? '').slice(0, 12)}… ${copyLabel('AbpAdmin::AuditLogs:Detail:CopyLower', L('AbpAdmin::AuditLogs:Detail:CopyLower'))}</button></dd></div>
          </dl>
        </header>
        <div class="tabs">
          <ul class="tablist" role="tablist" aria-label="${L('AbpAdmin::AuditLogs:Detail:Sections')}"></ul>
          <div class="panel" role="tabpanel"></div>
        </div>`);
      drawTabs(); drawPanel();
    }

    function toggleHistory(key) {
      const l = state.log;
      if (state.history[key]) { delete state.history[key]; drawPanel(); return; }
      const c = l.entityChanges.find(x => entityKey(x) === key);
      state.history[key] = 'loading'; drawPanel();
      api.get(`/api/abp-admin/audit-log/entity-history/${encodeURIComponent(c.entityId)}`, { entityTypeFullName: c.entityTypeFullName })
        .then(list => { if (state.log === l && state.history[key]) state.history[key] = list; })
        .catch(() => { if (state.log === l && state.history[key]) state.history[key] = []; })
        .finally(() => { if (state.log === l && state.tab === 'changes') drawPanel(); });
    }

    function init() {
      dialog = makeDialog('al-detail', 'al-detail-title');
      ui = sheet(dialog, { onClose: () => { state.log = null; } });
      rememberOpen(dialog, state.tlOpen);
      on(dialog, 'click', '[data-act=close]', () => ui.close());
      on(dialog, 'click', '[data-act=tab]', (e, el) => setTab(el.dataset.tab));
      on(dialog, 'click', '[role=tab]', (e, el) => { if (el.getAttribute('aria-disabled') !== 'true') setTab(el.dataset.tab); });
      dialog.addEventListener('keydown', e => {
        const li = e.target instanceof Element ? e.target.closest('[role=tab]') : null;
        if (!li) return;
        const tabs = [...dialog.querySelectorAll('[role=tab]')].filter(t => t.getAttribute('aria-disabled') !== 'true');
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(li.dataset.tab); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const next = tabs[(tabs.indexOf(li) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
          setTab(next.dataset.tab);
          dialog.querySelector(`[role=tab][data-tab=${next.dataset.tab}]`)?.focus();
        }
      });
      on(dialog, 'click', '[data-act=toggle]', (e, btn) => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(open));
        document.getElementById(btn.getAttribute('aria-controls')).hidden = !open;
      });
      on(dialog, 'click', '[data-act=copy]', (e, btn) => copyText(dialog, btn.dataset.text));
      on(dialog, 'click', '[data-act=history]', (e, btn) => toggleHistory(btn.dataset.key));
      on(dialog, 'click', '[data-act=show-change]', (e, btn) => {
        state.tab = 'changes'; drawTabs(); drawPanel();
        setTimeout(() => document.getElementById('al-chg-' + btn.dataset.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      });
    }

    return {
      open(log) {
        if (!dialog) init();
        Object.assign(state, { log, tab: 'trace', history: {} });
        for (const k of Object.keys(state.tlOpen)) delete state.tlOpen[k];
        draw();
        ui.open();
        dialog.scrollTop = 0;
      },
    };
  })();

  // ---------- entity history sheet ----------
  const history = (() => {
    let dialog, ui;
    const state = { entity: null, list: [], loading: false, error: false, tlOpen: {} };

    function summary() {
      const list = state.list;
      if (!list.length) return null;
      const last = list.at(-1);
      return { created: list.find(c => c.changeType === CREATED), updates: list.filter(c => c.changeType === UPDATED).length, deleted: last.changeType === DELETED, last };
    }
    const by = u => L('AbpAdmin::EntityChanges:ByUser', u ?? L('AbpAdmin::EntityChanges:System'));

    function draw() {
      const e = state.entity, s = summary();
      render(dialog, html`
        <header class="head">
          <div class="title-row">
            <span class="avatar sq" aria-hidden="true">${shortType(e.type)[0]}</span>
            <div class="title"><h2 id="al-history-title">${shortType(e.type)}</h2><span class="muted small" title="${e.type}">${e.type}</span></div>
            <button class="icon-btn" type="button" data-act="close" aria-label="${L('AbpAdmin::Common:Close')}">${svg(CLOSE)}</button>
          </div>
          <button class="id mono" type="button" data-act="copy" data-text="${e.id}" title="${L('AbpAdmin::EntityChanges:CopyId')}">#${e.id}
            <span class="muted" data-lbl="${L('AbpAdmin::EntityChanges:CopyLower')}">${L('AbpAdmin::EntityChanges:CopyLower')}</span></button>
          ${s ? html`<dl class="facts">
            <div><dt>${L('AbpAdmin::EntityChanges:Created')}</dt><dd>${s.created ? stamp(s.created.changeTime, DAY) : L('AbpAdmin::EntityChanges:BeforeAuditing')}
              ${s.created ? html`<span class="muted">${by(s.created.userName)}</span>` : ''}</dd></div>
            <div><dt>${L('AbpAdmin::EntityChanges:Updates')}</dt><dd>${s.updates}</dd></div>
            <div><dt>${L(s.deleted ? 'AbpAdmin::EntityChanges:Deleted' : 'AbpAdmin::EntityChanges:LastChange')}</dt>
              <dd>${relative(s.last.changeTime)} <span class="muted">${by(s.last.userName)}</span></dd></div>
            <div><dt>${L('AbpAdmin::Common:Status')}</dt><dd><span class="pill tone-${s.deleted ? 'err' : 'ok'}">${L(s.deleted ? 'AbpAdmin::EntityChanges:Deleted' : 'AbpAdmin::EntityChanges:Exists')}</span></dd></div>
          </dl>` : ''}
        </header>
        <div class="body">${state.loading ? html`<div class="skeleton rows"><i></i><i></i><i></i></div>`
          : state.error ? html`<div class="state err">${L('AbpAdmin::EntityChanges:HistoryLoadFailed')} <button class="btn" type="button" data-act="retry">${L('AbpAdmin::Common:Retry')}</button></div>`
          : timeline(state.list, { focus: e.focus ?? null, canOpen: true, openState: state.tlOpen })}</div>`);
      if (!state.loading && !state.error && e.focus) dialog.querySelector(`[data-change="${CSS.escape(e.focus)}"]`)?.scrollIntoView({ block: 'center' });
    }

    function load() {
      const e = state.entity;
      Object.assign(state, { list: [], loading: true, error: false });
      draw();
      api.get(`/api/abp-admin/audit-log/entity-history/${encodeURIComponent(e.id)}`, { entityTypeFullName: e.type })
        .then(list => { if (state.entity === e) Object.assign(state, { list, loading: false }); })
        .catch(() => { if (state.entity === e) Object.assign(state, { loading: false, error: true }); })
        .finally(() => { if (state.entity === e) draw(); });
    }

    function init() {
      dialog = makeDialog('al-history', 'al-history-title');
      ui = sheet(dialog, { onClose: () => { state.entity = null; } });
      rememberOpen(dialog, state.tlOpen);
      on(dialog, 'click', '[data-act=close]', () => ui.close());
      on(dialog, 'click', '[data-act=retry]', load);
      on(dialog, 'click', '[data-act=copy]', (e, btn) => copyText(dialog, btn.dataset.text));
      on(dialog, 'click', '[data-act=open-request]', (e, btn) => { ui.close(); openRequest(btn.dataset.id); });
    }

    return {
      open(entity) {
        if (!dialog) init();
        state.entity = entity;
        for (const k of Object.keys(state.tlOpen)) delete state.tlOpen[k];
        load();
        ui.open();
        dialog.scrollTop = 0;
      },
    };
  })();

  /** Open the request detail sheet for an audit log DTO, or fetch it first when given an id. */
  async function openRequest(idOrDto) {
    try {
      detail.open(typeof idOrDto === 'string' ? await api.get(`/api/abp-admin/audit-log/${encodeURIComponent(idOrDto)}`) : idOrDto);
    } catch (e) { toast.error(errorText(e)); }
  }

  AbpAdmin.auditLogging = { openRequest, openEntityHistory: entity => history.open(entity) };
})();
