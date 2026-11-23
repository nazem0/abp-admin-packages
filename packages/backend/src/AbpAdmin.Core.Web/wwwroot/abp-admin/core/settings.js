// Settings page: the core tabs (time zone, email). Feature tabs (e.g. identity) render from their own partial + script.
(function () {
  const { html, render, icon, on, api, L, can, errorText } = AbpAdmin;
  const page = document.getElementById('abp-settings');
  const host = document.getElementById('abp-settings-body');
  if (!page || !host) return; // a partial tab is active
  const part = (root, name) => root.querySelector(`[data-part=${name}]`);
  const status = s => (s ? html`<span class="status ${s.error ? 'err' : ''}" role="status">${s.text}</span>` : '');
  const SEARCH = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5';
  const skeleton = html`<div class="skel" aria-hidden="true">${[1, 2, 3, 4, 5, 6].map(() => html`<i></i>`)}</div>`;

  // ---------- time zone ----------
  function timeZone() {
    const DEFAULT = 'Unspecified', OTHER = 'Other';
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = AbpAdmin.locale();
    const st = { zones: [], saved: DEFAULT, choice: DEFAULT, q: '', saving: false, status: null, loading: true, error: false };

    function toZone(name, value) {
      const offset = /\(([+-]\d\d:\d\d)\)/.exec(name)?.[1] ?? '+00:00';
      const [h, m] = offset.slice(1).split(':').map(Number);
      const parts = value.split('/');
      return {
        value, city: parts.at(-1).replaceAll('_', ' '),
        region: parts.length > 1 ? parts.slice(0, -1).join(' / ').replaceAll('_', ' ') : OTHER,
        offset: `UTC${offset}`, minutes: (offset[0] === '-' ? -1 : 1) * (h * 60 + m),
      };
    }
    const dirty = () => st.choice !== st.saved;
    const savedLabel = () => (st.saved === DEFAULT ? L('AbpAdmin::Settings:TimeZone:BrowserDefault') : st.saved);
    function groups() {
      const q = st.q.trim().toLowerCase();
      const hits = q ? st.zones.filter(z => `${z.value} ${z.city} ${z.offset}`.toLowerCase().includes(q)) : st.zones;
      const map = new Map();
      for (const z of hits) map.set(z.region, [...(map.get(z.region) ?? []), z]);
      return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([region, zones]) => ({ region, zones }));
    }
    function preview() {
      const zone = st.choice === DEFAULT ? browserZone : st.choice;
      const at = new Date();
      const offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(at).find(p => p.type === 'timeZoneName')?.value ?? '';
      return {
        label: st.choice === DEFAULT ? L('AbpAdmin::Settings:TimeZone:YourBrowser', zone) : zone.replaceAll('_', ' '),
        time: at.toLocaleTimeString(locale, { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        date: at.toLocaleDateString(locale, { timeZone: zone, weekday: 'long', month: 'long', day: 'numeric' }),
        offset: offset.replace('GMT', 'UTC') || 'UTC',
        local: zone === browserZone ? null : at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) + ` (${browserZone.replaceAll('_', ' ')})`,
      };
    }

    render(host, html`<section class="card tz" aria-labelledby="tz-h">
      <div class="intro">
        <h2 id="tz-h">${L('AbpAdmin::Settings:TimeZone:Title')}</h2>
        <p class="muted">${L('AbpAdmin::Settings:TimeZone:Intro', L('AbpAdmin::Settings:TimeZone:BrowserDefault'))}</p>
        <div class="clock" aria-live="polite" data-part="clock"></div>
        <p class="muted small saved" data-part="saved"></p>
        <div class="actions" data-part="actions"></div>
      </div>
      <div class="picker">
        <label class="search">${icon(SEARCH)}
          <input class="input" type="search" data-part="q" placeholder="${L('AbpAdmin::Settings:TimeZone:SearchPlaceholder')}" aria-label="${L('AbpAdmin::Settings:TimeZone:SearchLabel')}" />
        </label>
        <div data-part="list"></div>
      </div>
    </section>`);

    function paintClock() {
      const p = preview();
      render(part(host, 'clock'), html`<span class="muted small">${L('AbpAdmin::Settings:TimeZone:NowIn', p.label)}</span>
        <strong>${p.time}</strong><span class="muted small">${p.date} · ${p.offset}</span>
        ${p.local ? html`<span class="local small">${L('AbpAdmin::Settings:TimeZone:YourLocalTime', p.local)}</span>` : ''}`);
    }
    function paintActions() {
      render(part(host, 'saved'), html`${L('AbpAdmin::Settings:TimeZone:Saved', savedLabel())}`);
      const off = !dirty() || st.saving;
      render(part(host, 'actions'), html`
        <button class="btn primary" type="button" data-act="save" ${off ? 'disabled' : ''}>${L(st.saving ? 'AbpAdmin::Common:Saving' : 'AbpAdmin::Common:Save')}</button>
        <button class="btn" type="button" data-act="reset" ${off ? 'disabled' : ''}>${L('AbpAdmin::Common:Reset')}</button>
        ${status(st.status)}`);
    }
    function paintList() {
      const el = part(host, 'list');
      if (st.loading) return render(el, skeleton);
      if (st.error) return render(el, html`<p class="err">${L('AbpAdmin::Settings:TimeZone:LoadFailed')} <button class="link" type="button" data-act="retry">${L('AbpAdmin::Common:Retry')}</button></p>`);
      const gs = groups();
      const scroll = el.firstElementChild?.scrollTop ?? 0;
      render(el, html`<div class="list" role="radiogroup" aria-label="${L('AbpAdmin::Settings:TimeZone:Title')}">
        ${st.q ? '' : html`<label class="opt ${st.choice === DEFAULT ? 'on' : ''}">
          <input type="radio" name="tz" value="${DEFAULT}" ${st.choice === DEFAULT ? 'checked' : ''} />
          <span class="name"><b>${L('AbpAdmin::Settings:TimeZone:BrowserDefault')}</b><small>${browserZone}</small></span>
          <span class="off">${L('AbpAdmin::Settings:TimeZone:Auto')}</span></label>`}
        ${gs.map(g => html`<div class="region">${g.region === OTHER ? L('AbpAdmin::Settings:TimeZone:RegionOther') : g.region}</div>
          ${g.zones.map(z => html`<label class="opt ${st.choice === z.value ? 'on' : ''}">
            <input type="radio" name="tz" value="${z.value}" ${st.choice === z.value ? 'checked' : ''} />
            <span class="name"><b>${z.city}</b><small>${z.value}</small></span><span class="off">${z.offset}</span></label>`)}`)}
        ${gs.length ? '' : html`<p class="muted empty">${L('AbpAdmin::Settings:TimeZone:NoMatch', st.q)}</p>`}
      </div>`);
      if (el.firstElementChild) el.firstElementChild.scrollTop = scroll;
    }
    function scrollToSaved() {
      const list = host.querySelector('.list');
      const sel = list?.querySelector('.opt.on');
      if (sel && st.saved !== DEFAULT) list.scrollTop = sel.offsetTop - list.offsetTop - list.clientHeight / 2;
    }

    async function load() {
      st.loading = true; st.error = false; paintList();
      try {
        const [zones, current] = await Promise.all([api.get('/api/setting-management/timezone/timezones'), api.get('/api/setting-management/timezone')]);
        st.zones = zones.filter(z => z.value && z.value !== DEFAULT).map(z => toZone(z.name ?? '', z.value))
          .sort((a, b) => a.minutes - b.minutes || a.city.localeCompare(b.city));
        st.saved = (typeof current === 'string' ? current.trim() : '') || DEFAULT;
        st.choice = st.saved;
      } catch { st.error = true; }
      st.loading = false;
      paintList(); paintClock(); paintActions(); scrollToSaved();
    }

    on(host, 'change', 'input[name=tz]', (e, el) => { st.choice = el.value; paintList(); paintClock(); paintActions(); });
    on(host, 'input', '[data-part=q]', (e, el) => { st.q = el.value; paintList(); });
    on(host, 'click', '[data-act=reset]', () => { st.choice = st.saved; paintList(); paintClock(); paintActions(); });
    on(host, 'click', '[data-act=retry]', load);
    on(host, 'click', '[data-act=save]', async () => {
      st.saving = true; st.status = null; paintActions();
      const value = st.choice;
      try {
        await api.post('/api/setting-management/timezone' + AbpAdmin.query({ timezone: value }));
        st.saved = value; st.status = { text: L('AbpAdmin::Settings:TimeZone:SavedOk') };
      } catch { st.status = { text: L('AbpAdmin::Settings:SaveFailed'), error: true }; }
      st.saving = false; paintActions();
    });
    paintClock(); paintActions();
    setInterval(paintClock, 1000);
    load();
  }

  // ---------- email ----------
  function email() {
    const canTest = can('SettingManagement.Emailing.Test');
    let data = null;
    const setStatus = (name, s) => render(part(host, name), status(s));

    function form(s) {
      return html`<form class="body form" data-form="settings">
        <fieldset>
          <legend>${L('AbpAdmin::Settings:Email:Sender')}</legend>
          <div class="grid-2">
            <label class="field"><span>${L('AbpAdmin::Settings:Email:FromAddress')} <i>*</i></span>
              <input class="input" name="defaultFromAddress" type="email" required value="${s.defaultFromAddress ?? ''}" /></label>
            <label class="field"><span>${L('AbpAdmin::Settings:Email:FromName')} <i>*</i></span>
              <input class="input" name="defaultFromDisplayName" required value="${s.defaultFromDisplayName ?? ''}" /></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>${L('AbpAdmin::Settings:Email:SmtpServer')}</legend>
          <div class="grid-host">
            <label class="field"><span>${L('AbpAdmin::Settings:Email:Host')}</span>
              <input class="input" name="smtpHost" value="${s.smtpHost ?? ''}" placeholder="smtp.example.com" /></label>
            <label class="field"><span>${L('AbpAdmin::Settings:Email:Port')}</span>
              <input class="input" name="smtpPort" type="number" min="1" max="65535" value="${s.smtpPort ?? 25}" /></label>
          </div>
          <label class="check"><input type="checkbox" class="switch" name="smtpEnableSsl" ${s.smtpEnableSsl ? 'checked' : ''} />
            <span>${L('AbpAdmin::Settings:Email:UseSsl')} <small>${L('AbpAdmin::Settings:Email:UseSslHint')}</small></span></label>
        </fieldset>
        <fieldset>
          <legend>${L('AbpAdmin::Settings:Email:Authentication')}</legend>
          <label class="check"><input type="checkbox" class="switch" name="smtpUseDefaultCredentials" ${s.smtpUseDefaultCredentials ? 'checked' : ''} />
            <span>${L('AbpAdmin::Settings:Email:UseDefaultCredentials')} <small>${L('AbpAdmin::Settings:Email:UseDefaultCredentialsHint')}</small></span></label>
          <div class="grid-2" data-part="creds" ${s.smtpUseDefaultCredentials ? 'hidden' : ''}>
            <label class="field"><span>${L('AbpAdmin::Settings:Email:UserName')}</span>
              <input class="input" name="smtpUserName" autocomplete="off" value="${s.smtpUserName ?? ''}" /></label>
            <label class="field"><span>${L('AbpAdmin::Settings:Email:Password')}</span>
              <input class="input" name="smtpPassword" type="password" autocomplete="new-password" value="${s.smtpPassword ?? ''}" /></label>
            <label class="field"><span>${L('AbpAdmin::Settings:Email:Domain')}</span>
              <input class="input" name="smtpDomain" value="${s.smtpDomain ?? ''}" /></label>
          </div>
        </fieldset>
        <div class="actions">
          <button class="btn primary" type="submit">${L('AbpAdmin::Common:Save')}</button>
          <span data-part="status"></span>
        </div>
      </form>`;
    }

    function draw(body) {
      render(host, html`<section class="card email" aria-labelledby="em-h">
        <div class="intro">
          <h2 id="em-h">${L('AbpAdmin::Settings:Email:Title')}</h2>
          <p class="muted">${L('AbpAdmin::Settings:Email:Intro')}</p>
          ${canTest ? html`<form class="test form" data-form="test">
            <h3>${L('AbpAdmin::Settings:Email:SendTest')}</h3>
            <label class="field"><span>${L('AbpAdmin::Settings:Email:To')}</span>
              <input class="input" name="to" type="email" required placeholder="you@example.com" autocomplete="email" /></label>
            <label class="field"><span>${L('AbpAdmin::Settings:Email:Subject')}</span>
              <input class="input" name="subject" required value="${L('AbpAdmin::Settings:Email:TestSubject')}" /></label>
            <div class="actions">
              <button class="btn" type="submit">${L('AbpAdmin::Settings:Email:SendTestButton')}</button>
              <span data-part="test-status"></span>
            </div>
            <small class="muted">${L('AbpAdmin::Settings:Email:TestHint')}</small>
          </form>` : ''}
        </div>
        <div data-part="body">${body}</div>
      </section>`);
    }

    async function load() {
      draw(html`<div class="body"><div class="skeleton rows">${[1, 2, 3, 4].map(() => html`<i></i>`)}</div></div>`);
      try { data = await api.get('/api/setting-management/emailing'); draw(form(data)); }
      catch { draw(html`<div class="body state err">${L('AbpAdmin::Settings:Email:LoadFailed')} <button class="btn" type="button" data-act="retry">${L('AbpAdmin::Common:Retry')}</button></div>`); }
    }

    on(host, 'click', '[data-act=retry]', load);
    on(host, 'change', 'input[name=smtpUseDefaultCredentials]', (e, el) => { part(host, 'creds').hidden = el.checked; });
    host.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, fd = new FormData(f);
      const text = k => String(fd.get(k) ?? '').trim();
      const btn = f.querySelector('button[type=submit]');
      if (f.dataset.form === 'settings') {
        const custom = !fd.has('smtpUseDefaultCredentials');
        const dto = {
          defaultFromAddress: text('defaultFromAddress'),
          defaultFromDisplayName: text('defaultFromDisplayName'),
          smtpHost: text('smtpHost') || undefined,
          smtpPort: Number(text('smtpPort')) || undefined,
          smtpEnableSsl: fd.has('smtpEnableSsl'),
          smtpUseDefaultCredentials: !custom,
          // Hidden fields keep their stored values.
          smtpUserName: custom ? text('smtpUserName') || undefined : data?.smtpUserName,
          smtpPassword: custom ? String(fd.get('smtpPassword') ?? '') || undefined : data?.smtpPassword,
          smtpDomain: custom ? text('smtpDomain') || undefined : data?.smtpDomain,
        };
        btn.disabled = true; btn.textContent = L('AbpAdmin::Common:Saving'); setStatus('status', null);
        try { await api.post('/api/setting-management/emailing', dto); data = { ...data, ...dto }; setStatus('status', { text: L('AbpAdmin::Settings:Saved') }); }
        catch (err) { setStatus('status', { text: errorText(err), error: true }); }
        btn.disabled = false; btn.textContent = L('AbpAdmin::Common:Save');
      } else if (f.dataset.form === 'test') {
        btn.disabled = true; btn.textContent = L('AbpAdmin::Settings:Email:Sending'); setStatus('test-status', null);
        try {
          await api.post('/api/setting-management/emailing/send-test-email', {
            senderEmailAddress: data?.defaultFromAddress ?? '', targetEmailAddress: String(fd.get('to')),
            subject: String(fd.get('subject')), body: L('AbpAdmin::Settings:Email:TestBody'),
          });
          setStatus('test-status', { text: L('AbpAdmin::Settings:Email:TestSent') });
        } catch (err) { setStatus('test-status', { text: errorText(err), error: true }); }
        btn.disabled = false; btn.textContent = L('AbpAdmin::Settings:Email:SendTestButton');
      }
    });
    load();
  }

  // ---------- all settings (port of all-settings.component.ts) ----------
  function allSettings() {
    const canEdit = can('AbpAdmin.Settings.Update');
    const tenant = !!AbpAdmin.config.currentTenant?.id;
    const st = { data: [], q: '', group: '', changed: false, edits: new Map(), saving: false };
    const own = s => (tenant ? s.tenantValue : s.globalValue) ?? '';
    const show = v => (v == null || v === '' ? L('AbpAdmin::Settings:All:Empty') : v);
    const inherited = s => show((tenant ? s.globalValue : null) ?? s.configurationValue ?? s.defaultValue);
    const source = s => (s.tenantValue != null ? 'tenant' : s.globalValue != null ? 'global' : s.configurationValue != null ? 'config' : 'default');
    const value = s => (st.edits.has(s.name) ? st.edits.get(s.name) : own(s));
    const shown = () => {
      const q = st.q.trim().toLowerCase();
      return st.data.filter(s => (!st.group || s.group === st.group) && (!st.changed || source(s) !== 'default')
        && (!q || `${s.name} ${s.displayName} ${s.description ?? ''}`.toLowerCase().includes(q)));
    };

    function shell() {
      render(host, html`<section class="card all" aria-labelledby="all-h">
        <header>
          <div>
            <h2 id="all-h">${L('AbpAdmin::Settings:All:Title')}</h2>
            <p class="muted">${L(tenant ? 'AbpAdmin::Settings:All:IntroTenant' : 'AbpAdmin::Settings:All:IntroHost')}</p>
          </div>
          ${canEdit ? html`<div class="acts" data-part="acts"></div>` : ''}
        </header>
        <div class="filters">
          <label class="search">${icon(SEARCH)}
            <input class="input" type="search" data-f="q" placeholder="${L('AbpAdmin::Settings:All:Search')}" aria-label="${L('AbpAdmin::Settings:All:Search')}" /></label>
          <select class="input" data-f="group" aria-label="${L('AbpAdmin::Settings:All:Module')}"></select>
          <label class="check"><input type="checkbox" data-f="changed" /> ${L('AbpAdmin::Settings:All:OnlyChanged')}</label>
        </div>
        <div data-part="list">${skeleton}</div>
      </section>`);
    }

    function drawActs() {
      const el = part(host, 'acts');
      if (!el) return;
      const n = st.edits.size;
      render(el, html`${n ? html`<span class="muted small">${L('AbpAdmin::Settings:Unsaved', String(n))}</span>` : ''}
        <button class="btn" type="button" data-act="reset" ${!n || st.saving ? 'disabled' : ''}>${L('AbpAdmin::Common:Reset')}</button>
        <button class="btn primary" type="button" data-act="save" ${!n || st.saving ? 'disabled' : ''}>${L(st.saving ? 'AbpAdmin::Common:Saving' : 'AbpAdmin::Common:Save')}</button>`);
    }

    function row(s) {
      const editable = canEdit && s.isEditable, src = source(s), id = 'set-' + s.name;
      const lvl = (key, label, v) => html`<span class="lvl ${src === key ? 'on' : ''}">${label}: ${v}</span>`;
      return html`<li class="${st.edits.has(s.name) ? 'changed' : ''}">
        <div class="what">
          <label for="${id}"><b>${s.displayName}</b></label>
          <code class="mono">${s.name}</code>
          ${s.description && s.description !== s.displayName ? html`<small class="muted">${s.description}</small>` : ''}
          <span class="levels">
            ${lvl('default', L('AbpAdmin::Settings:All:Default'), show(s.defaultValue))}
            ${s.configurationValue != null ? lvl('config', 'appsettings', s.configurationValue) : ''}
            ${s.globalValue != null ? lvl('global', L('AbpAdmin::Settings:All:Host'), s.globalValue) : ''}
            ${s.tenantValue != null ? lvl('tenant', L('AbpAdmin::Settings:All:Tenant'), s.tenantValue) : ''}
            ${s.isEncrypted ? html`<span class="lvl">${L('AbpAdmin::Settings:All:Encrypted')}</span>` : ''}
          </span>
        </div>
        <div class="val">
          ${s.type === 'bool'
            ? html`<select class="input" id="${id}" data-name="${s.name}" ${editable ? '' : 'disabled'}>
                ${[['', L('AbpAdmin::Settings:All:Inherit', inherited(s))], ['true', 'true'], ['false', 'false']].map(([v, t]) =>
                  html`<option value="${v}" ${value(s) === v ? 'selected' : ''}>${t}</option>`)}
              </select>`
            : html`<input class="input" id="${id}" data-name="${s.name}" type="${s.isEncrypted ? 'password' : s.type === 'number' ? 'number' : 'text'}" min="0"
                value="${value(s)}" placeholder="${inherited(s)}" ${editable ? '' : 'disabled'} />`}
        </div>
      </li>`;
    }

    function drawList() {
      const rows = shown();
      render(part(host, 'list'), rows.length ? html`<ul class="list">${rows.map(row)}</ul>`
        : html`<div class="state empty"><span class="muted">${L('AbpAdmin::Settings:All:NoMatch')}</span></div>`);
    }

    async function load() {
      st.edits.clear(); drawActs();
      render(part(host, 'list'), skeleton);
      try {
        st.data = await api.get('/api/abp-admin/setting-browser');
        const groups = [...new Set(st.data.map(s => s.group))].sort();
        render(host.querySelector('[data-f=group]'), html`<option value="">${L('AbpAdmin::Settings:All:AllModules')}</option>
          ${groups.map(g => html`<option value="${g}" ${st.group === g ? 'selected' : ''}>${g}</option>`)}`);
        drawList();
      } catch {
        render(part(host, 'list'), html`<div class="state err">${L('AbpAdmin::Settings:All:LoadFailed')} <button class="btn" type="button" data-act="retry">${L('AbpAdmin::Common:Retry')}</button></div>`);
      }
    }

    // Typing marks the row and the counter without redrawing the list (keeps focus).
    function edit(el) {
      const s = st.data.find(x => x.name === el.dataset.name);
      if (!s) return;
      if (el.value === own(s)) st.edits.delete(s.name); else st.edits.set(s.name, el.value);
      el.closest('li').classList.toggle('changed', st.edits.has(s.name));
      drawActs();
    }

    on(host, 'input', '[data-f=q]', (e, el) => { st.q = el.value; drawList(); });
    on(host, 'change', '[data-f=group]', (e, el) => { st.group = el.value; drawList(); });
    on(host, 'change', '[data-f=changed]', (e, el) => { st.changed = el.checked; drawList(); });
    on(host, 'input', '.val input[data-name]', (e, el) => edit(el));
    on(host, 'change', '.val select[data-name]', (e, el) => edit(el));
    on(host, 'click', '[data-act=retry]', load);
    on(host, 'click', '[data-act=reset]', () => { st.edits.clear(); drawActs(); drawList(); });
    on(host, 'click', '[data-act=save]', async () => {
      st.saving = true; drawActs();
      try {
        await api.put('/api/abp-admin/setting-browser', [...st.edits].map(([name, value]) => ({ name, value })));
        AbpAdmin.toast.ok(L('AbpAdmin::Settings:All:Saved'));
        st.saving = false; load();
      } catch (err) { st.saving = false; drawActs(); AbpAdmin.toast.error(errorText(err)); }
    });
    shell(); drawActs(); load();
  }

  const tab = page.dataset.tab;
  if (tab === 'time-zone') timeZone();
  else if (tab === 'email') email();
  else if (tab === 'all') allSettings();
})();
