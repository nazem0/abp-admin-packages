// Settings → Audit logs (port of audit-log-settings.component.ts): retention in days, and "clean up now".
(function () {
  const { html, render, on, api, L, toast, errorText } = AbpAdmin;
  const root = document.getElementById('abp-audit-log-settings');
  const API = '/api/abp-admin/audit-log-retention';
  const state = { loading: true, saved: 0, days: 0, busy: false };

  function draw() {
    render(root, html`<section class="card" style="padding:18px 20px;display:grid;gap:12px" aria-labelledby="al-h">
      <h2 id="al-h" style="font-size:15px;font-weight:650">${L('AbpAdmin::Settings:AuditLogs:Title')}</h2>
      <p class="muted">${L('AbpAdmin::Settings:AuditLogs:Intro')}</p>
      ${state.loading ? html`<div class="skeleton rows"><i></i></div>` : html`<form>
        <label class="field"><span>${L('AbpAdmin::Settings:AuditLogs:Days')}</span>
          <span style="display:flex;align-items:center;gap:12px">
            <input class="input" style="width:120px" type="number" min="0" max="36500" required name="days" value="${state.days}" />
            <span class="muted" id="al-hint">${hint()}</span></span></label>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn primary" type="submit" ${state.busy ? 'disabled' : ''}>${L(state.busy ? 'AbpAdmin::Common:Saving' : 'AbpAdmin::Common:Save')}</button>
          <button class="btn" type="button" data-act="cleanup" ${state.busy || !state.saved ? 'disabled' : ''} title="${L('AbpAdmin::Settings:AuditLogs:CleanupHint')}">${L('AbpAdmin::Settings:AuditLogs:Cleanup')}</button>
        </div></form>`}
    </section>`);
  }
  const hint = () => L(state.days > 0 ? 'AbpAdmin::Settings:AuditLogs:DaysHint' : 'AbpAdmin::Settings:AuditLogs:Forever', String(state.days));

  async function load() {
    try { const r = await api.get(API); state.days = state.saved = r.days ?? 0; } catch (e) { toast.error(errorText(e)); }
    state.loading = false; draw();
  }

  on(root, 'input', 'input[name=days]', (e, el) => { state.days = +el.value || 0; root.querySelector('#al-hint').textContent = hint(); });
  root.addEventListener('submit', async e => {
    e.preventDefault();
    state.busy = true; draw();
    try { await api.put(API, { days: state.days }); state.saved = state.days; toast.ok(L('AbpAdmin::Settings:AuditLogs:Saved')); }
    catch (ex) { toast.error(errorText(ex)); }
    state.busy = false; draw();
  });
  on(root, 'click', '[data-act=cleanup]', async () => {
    state.busy = true; draw();
    try { const r = await api.post(`${API}/cleanup`); toast.ok(L('AbpAdmin::Settings:AuditLogs:Cleaned', String(r.deleted ?? 0))); }
    catch (ex) { toast.error(errorText(ex)); }
    state.busy = false; draw();
  });

  draw(); load();
})();
