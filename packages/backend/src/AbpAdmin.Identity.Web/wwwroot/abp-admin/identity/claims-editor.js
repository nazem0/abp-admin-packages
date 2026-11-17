// Claims of a user or role (port of claims-editor.component.ts):
//   AbpAdmin.claimsEditor.open({ kind: 'user' | 'role', id, title, editable, tenant })
(function () {
  const { html, render, icon, on, api, L, toast, errorText, sheet } = AbpAdmin;
  const API = '/api/abp-admin/identity-claims';
  const dialog = document.createElement('dialog');
  dialog.className = 'narrow claims-editor';
  dialog.setAttribute('aria-labelledby', 'ce-title');
  document.addEventListener('DOMContentLoaded', () => document.body.append(dialog));
  const s = sheet(dialog);
  let ctx = null; // { target, types, rows, saving, error }

  const type = name => ctx.types.find(t => t.name === name);
  const inputType = name => ({ 1: 'number', 3: 'datetime-local' })[type(name)?.valueType] ?? 'text';
  const hint = name => { const t = type(name); return t?.regexDescription || (t?.valueType === 2 ? 'true / false' : t?.description) || ''; };

  function draw() {
    const t = ctx.target;
    render(dialog, html`<form autocomplete="off">
      <header class="sh-head">
        <h2 id="ce-title">${L('AbpAdmin::Claims:Title')} <small>${t.title}</small></h2>
        <button type="button" class="icon-btn" data-ce="close" aria-label="${L('AbpAdmin::Common:Close')}">${icon('M6 6l12 12M18 6 6 18')}</button>
      </header>
      <div class="sh-body form">
        ${ctx.loading ? html`<div class="skeleton rows"><i></i><i></i></div>`
        : !ctx.types.length ? html`<p class="muted">${L('AbpAdmin::Claims:NoTypes')}</p>`
        : html`${ctx.rows.length ? ctx.rows.map((c, i) => html`<div class="ce-row">
            <select class="input" data-ce-type="${i}" aria-label="${L('AbpAdmin::Claims:Type')}" ${t.editable ? '' : 'disabled'}>
              ${ctx.types.map(ty => html`<option value="${ty.name}" ${ty.name === c.type ? 'selected' : ''}>${ty.name}</option>`)}</select>
            <input class="input" data-ce-value="${i}" type="${inputType(c.type)}" value="${c.value ?? ''}" placeholder="${hint(c.type)}" aria-label="${L('AbpAdmin::Claims:Value')}" ${t.editable ? '' : 'readonly'} />
            ${t.editable ? html`<button type="button" class="icon-btn" data-ce-remove="${i}" title="${L('AbpAdmin::Common:Delete')}">${icon('M6 6l12 12M18 6 6 18')}</button>` : ''}
          </div>`) : html`<p class="muted">${L('AbpAdmin::Claims:None')}</p>`}
          ${t.editable ? html`<button type="button" class="btn" data-ce="add">+ ${L('AbpAdmin::Claims:Add')}</button>` : ''}`}
      </div>
      <footer class="sh-foot">
        ${ctx.error ? html`<span class="alert tone-err">${ctx.error}</span>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-ce="close">${L('AbpAdmin::Common:Cancel')}</button>
        ${t.editable ? html`<button class="btn primary" type="submit" ${ctx.saving || ctx.loading ? 'disabled' : ''}>${L(ctx.saving ? 'AbpAdmin::Common:Saving' : 'AbpAdmin::Common:Save')}</button>` : ''}
      </footer>
    </form>`);
  }

  async function open(target) {
    ctx = { target, types: [], rows: [], loading: true, saving: false, error: null };
    draw();
    s.open();
    try {
      const opts = { tenant: target.tenant };
      const [types, claims] = await Promise.all([
        api.get(`${API}/types`, undefined, opts),
        api.get(`${API}/${target.id}/${target.kind}-claims`, undefined, opts),
      ]);
      ctx.types = types ?? []; ctx.rows = (claims ?? []).map(c => ({ ...c }));
    } catch (e) { ctx.error = errorText(e); }
    ctx.loading = false; draw();
  }

  on(dialog, 'click', '[data-ce=close]', () => s.close());
  on(dialog, 'click', '[data-ce=add]', () => { ctx.rows.push({ type: ctx.types[0]?.name ?? '', value: '' }); draw(); });
  on(dialog, 'click', '[data-ce-remove]', (e, b) => { ctx.rows.splice(+b.dataset.ceRemove, 1); draw(); });
  on(dialog, 'change', '[data-ce-type]', (e, el) => { ctx.rows[+el.dataset.ceType].type = el.value; draw(); });
  on(dialog, 'input', '[data-ce-value]', (e, el) => { ctx.rows[+el.dataset.ceValue].value = el.value; });
  dialog.addEventListener('submit', async e => {
    e.preventDefault();
    const t = ctx.target;
    ctx.saving = true; ctx.error = null; draw();
    try {
      await api.put(`${API}/${t.id}/${t.kind}-claims`, { claims: ctx.rows.filter(c => c.type) }, { tenant: t.tenant });
      toast.ok(L('AbpAdmin::Claims:Saved', t.title)); s.close();
    } catch (err) { ctx.saving = false; ctx.error = errorText(err); draw(); }
  });

  AbpAdmin.claimsEditor = { open };
})();
