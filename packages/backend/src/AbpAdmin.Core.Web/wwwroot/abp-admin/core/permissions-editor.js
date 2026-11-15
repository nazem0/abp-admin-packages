/*
 * Shared permissions editor (port of permissions-editor.component.ts), a side sheet.
 *   AbpAdmin.permissionsEditor.open({ providerName: 'R' | 'U' | 'C', providerKey, title, tenant }) → Promise<boolean> (true when saved), resolved on close.
 * ABP rules: granting a child grants its parents; revoking a parent revokes its children.
 */
(function () {
  const { html, render, icon, on, api, L, errorText, sheet, toast } = AbpAdmin;
  const URL = '/api/permission-management/permissions';
  const PROVIDER = { R: 'role', U: 'user', C: 'client' };
  const SEARCH = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5';

  function open({ providerName, providerKey, title, tenant }) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'pm';
      dialog.setAttribute('aria-labelledby', 'pm-title');
      (document.querySelector('.abp-admin') ?? document.body).append(dialog);
      let saved = false;
      const sh = sheet(dialog, { onClose: () => { dialog.remove(); resolve(saved); } });

      const st = { loading: true, error: false, groups: [], original: new Set(), own: new Set(), active: '', q: '', saving: false, saveError: null };
      const perms = () => st.groups.flatMap(g => g.perms);
      const byName = () => new Map(perms().map(p => [p.name, p]));
      const isOn = p => st.own.has(p.name) || p.inherited.length > 0;
      const locked = p => !p.editable || p.inherited.length > 0;
      const changed = p => st.original.has(p.name) !== st.own.has(p.name);
      const changes = () => perms().filter(changed).map(p => ({ name: p.name, isGranted: st.own.has(p.name) }));
      const grantedIn = list => list.filter(isOn).length;
      const stateOf = (n, total) => (n === 0 ? 'none' : n === total ? 'all' : 'some');

      function toggle(p, on) {
        if (on) {
          // Granting a child grants its parents.
          const map = byName();
          for (let x = p; x; x = x.parent ? map.get(x.parent) : undefined) if (!locked(x)) st.own.add(x.name);
        } else {
          // Revoking a parent revokes its children.
          const drop = name => { st.own.delete(name); perms().filter(c => c.parent === name).forEach(c => drop(c.name)); };
          drop(p.name);
        }
      }
      function setMany(list, on) {
        for (const p of list) { if (locked(p)) continue; if (on) st.own.add(p.name); else st.own.delete(p.name); }
      }

      function shown() {
        const q = st.q.trim().toLowerCase();
        if (!q) return st.groups.filter(g => g.name === st.active);
        return st.groups.map(g => ({ ...g, perms: g.perms.filter(p => `${p.label} ${p.name}`.toLowerCase().includes(q)) })).filter(g => g.perms.length);
      }

      const head = html`<header class="sh-head">
        <span class="avatar sq" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg></span>
        <h2 id="pm-title">${L('AbpAdmin::Permissions:Title')} <small>${title}</small></h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="${L('AbpAdmin::Common:Close')}">${icon('M6 6l12 12M18 6 6 18')}</button>
      </header>`;

      function drawShell() {
        let main;
        if (st.loading) main = html`<div class="sh-body"><div class="skeleton rows">${[1, 2, 3, 4, 5].map(() => html`<i></i>`)}</div></div>`;
        else if (st.error) main = html`<div class="sh-body"><div class="state err">${L('AbpAdmin::Permissions:LoadFailed')} <button type="button" class="btn" data-act="retry">${L('AbpAdmin::Common:Retry')}</button></div></div>`;
        else main = html`<div class="tools">
            <label class="search">${icon(SEARCH)}
              <input class="input" type="search" data-part="q" placeholder="${L('AbpAdmin::Permissions:SearchPlaceholder')}" aria-label="${L('AbpAdmin::Permissions:Search')}" value="${st.q}" />
            </label>
            <label class="check"><input type="checkbox" data-part="all" /> ${L('AbpAdmin::Permissions:GrantAll')}</label>
            <span class="muted count" data-part="count"></span>
          </div>
          <div class="cols" data-part="cols"><nav class="groups" data-part="groups" aria-label="${L('AbpAdmin::Permissions:Groups')}"></nav><div class="perms" data-part="perms"></div></div>`;
        render(dialog, html`<form>${head}${main}
          <footer class="sh-foot" data-part="foot"></footer></form>`);
        paint();
      }

      const q = name => dialog.querySelector(`[data-part=${name}]`);
      function paint() {
        paintFoot();
        if (st.loading || st.error) return;
        const all = perms(), n = grantedIn(all), s = stateOf(n, all.length);
        const allBox = q('all');
        allBox.checked = s === 'all'; allBox.indeterminate = s === 'some';
        q('count').textContent = L('AbpAdmin::Permissions:GrantedCount', String(n), String(all.length));
        q('cols').classList.toggle('single', !!st.q);
        const groupsEl = q('groups');
        groupsEl.hidden = !!st.q;
        render(groupsEl, st.groups.map(g => {
          const granted = grantedIn(g.perms);
          return html`<button type="button" data-group="${g.name}" aria-current="${st.active === g.name}"><span>${g.label}</span>
            <span class="n ${granted === g.perms.length && granted > 0 ? 'full' : ''}">${granted}/${g.perms.length}</span></button>`;
        }));
        const list = shown();
        render(q('perms'), list.length ? list.map(g => {
          const granted = grantedIn(g.perms);
          return html`<div class="g-head"><h3>${g.label}</h3>
              <label class="check small"><input type="checkbox" data-sel="${g.name}" ${granted === g.perms.length ? 'checked' : ''} /> ${L('AbpAdmin::Permissions:SelectAll')}</label></div>
            <ul>${g.perms.map(p => html`<li style="--d: ${st.q ? 0 : p.depth}">
              <label class="perm ${locked(p) ? 'locked' : ''}">
                <input type="checkbox" data-perm="${p.name}" ${isOn(p) ? 'checked' : ''} ${locked(p) ? 'disabled' : ''} />
                <span class="txt"><span>${p.label}
                  ${p.inherited.map(via => html`<span class="pill tone-info">${L('AbpAdmin::Permissions:Via', via)}</span>`)}
                  ${changed(p) ? html`<span class="pill tone-warn">${L(st.own.has(p.name) ? 'AbpAdmin::Permissions:Granting' : 'AbpAdmin::Permissions:Revoking')}</span>` : ''}
                </span><small class="mono">${p.name}</small></span>
              </label></li>`)}</ul>`;
        }) : html`<p class="muted none">${L('AbpAdmin::Permissions:NoMatch', st.q)}</p>`);
        // indeterminate state of each group's select-all
        for (const g of list) {
          const box = [...dialog.querySelectorAll('[data-sel]')].find(x => x.dataset.sel === g.name);
          const granted = grantedIn(g.perms);
          if (box) box.indeterminate = granted > 0 && granted < g.perms.length;
        }
      }
      function paintFoot() {
        const n = changes().length;
        render(q('foot'), html`${st.saveError ? html`<span class="alert tone-err">${st.saveError}</span>`
          : html`<span class="muted">${L(n ? (n === 1 ? 'AbpAdmin::Permissions:UnsavedOne' : 'AbpAdmin::Permissions:UnsavedMany') : 'AbpAdmin::Permissions:NoChanges', String(n))}</span>`}
          <span class="spacer"></span>
          <button type="button" class="btn" data-act="close">${L('AbpAdmin::Common:Cancel')}</button>
          <button class="btn primary" type="submit" ${!n || st.saving ? 'disabled' : ''}>${L(st.saving ? 'AbpAdmin::Common:Saving' : 'AbpAdmin::Common:Save')}</button>`);
      }
      async function load() {
        st.loading = true; st.error = false; drawShell();
        try {
          const res = await api.get(URL, { providerName, providerKey }, { tenant });
          st.groups = (res.groups ?? []).map(g => {
            const list = g.permissions ?? [];
            const depthOf = name => { const parent = list.find(p => p.name === name)?.parentName; return parent ? 1 + depthOf(parent) : 0; };
            return {
              name: g.name, label: g.displayName ?? g.name,
              perms: list.map(p => ({
                name: p.name, label: p.displayName ?? p.name, parent: p.parentName ?? undefined, depth: depthOf(p.name), group: g.name,
                editable: p.isEditable !== false,
                inherited: (p.grantedProviders ?? []).filter(x => x.providerName !== providerName)
                  .map(x => `${PROVIDER[x.providerName] ?? x.providerName} ${x.providerKey}`.trim()),
                own: (p.grantedProviders ?? []).some(x => x.providerName === providerName),
              })),
            };
          });
          st.original = new Set(perms().filter(p => p.own).map(p => p.name));
          st.own = new Set(st.original);
          st.active = st.groups[0]?.name ?? '';
        } catch { st.error = true; }
        st.loading = false; drawShell();
      }

      on(dialog, 'click', '[data-act=close]', () => sh.close());
      on(dialog, 'click', '[data-act=retry]', load);
      on(dialog, 'click', '[data-group]', (e, el) => { st.active = el.dataset.group; paint(); });
      on(dialog, 'keydown', '[data-part=q]', e => { if (e.key === 'Enter') e.preventDefault(); });
      on(dialog, 'input', '[data-part=q]', (e, el) => { st.q = el.value; paint(); });
      on(dialog, 'change', '[data-part=all]', (e, el) => { setMany(perms(), el.checked); paint(); });
      on(dialog, 'change', '[data-sel]', (e, el) => {
        const g = st.groups.find(x => x.name === el.dataset.sel);
        const visible = st.q ? shown().find(x => x.name === g.name) : g;
        setMany(visible.perms, el.checked); paint();
      });
      on(dialog, 'change', '[data-perm]', (e, el) => {
        const p = byName().get(el.dataset.perm);
        toggle(p, el.checked); paint();
        [...dialog.querySelectorAll('[data-perm]')].find(x => x.dataset.perm === p.name)?.focus();
      });
      dialog.addEventListener('submit', async e => {
        e.preventDefault();
        const list = changes();
        if (!list.length || st.saving) return;
        st.saving = true; st.saveError = null; paintFoot();
        try {
          await api.request('PUT', URL, { params: { providerName, providerKey }, body: { permissions: list }, tenant });
          saved = true;
          toast.ok(L('AbpAdmin::Permissions:Saved', title));
          sh.close();
        } catch (err) { st.saving = false; st.saveError = errorText(err); paintFoot(); }
      });

      sh.open();
      load();
    });
  }

  window.AbpAdmin.permissionsEditor = { open };
})();
