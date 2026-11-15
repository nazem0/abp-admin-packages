import { Injectable, InjectionToken, Type, inject } from '@angular/core';

/** An admin destination (relative to the admin layout route). The sidebar, command palette and overview read these. */
export interface NavItem {
  path: string;
  label: string;
  /** Localization key ('AbpAdmin::Nav:…'), rendered with the abpLocalization pipe; `label` is the English fallback/search text. */
  labelKey: string;
  /** Section heading (English id); translated via `sectionKey()`. */
  section: string;
  /** ABP policy (supports `||`); hidden when not granted. */
  policy: string;
  /** SVG path data, 24×24 stroke icon. */
  icon: string;
  keywords?: string;
  /** Sub-pages, shown nested under this item in the sidebar. */
  children?: NavItem[];
}

/** A Settings tab. `component` renders it; core's own tabs (time zone, email) leave it out. */
export interface SettingsSection extends NavItem {
  component?: Type<unknown>;
}

/** A Ctrl+K quick action that opens a page, e.g. `users?new=1`. */
export interface QuickAction {
  id: string;
  labelKey: string;
  hintKey: string;
  keywords: string;
  policy: string;
  path: string;
  query?: Record<string, string>;
  /** Icon path data; defaults to a plus. */
  icon?: string;
}

/** What a feature package adds to the console. Pass features to `abpAdminRoutes(...)`. */
export interface AbpAdminFeature {
  nav?: NavItem[];
  routes?: import('@angular/router').Routes;
  actions?: QuickAction[];
  settings?: SettingsSection[];
}

export const ABP_ADMIN_FEATURES = new InjectionToken<AbpAdminFeature[]>('ABP_ADMIN_FEATURES');

/** Sidebar section order; sections not listed go last, in the order they appear. */
const SECTION_ORDER = ['', 'Monitoring', 'Identity', 'OpenIddict', 'System'];

export const SETTINGS_ICON = 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z';

/** The installed features, merged: sidebar items in section order, Settings tabs, quick actions. Provided by `abpAdminRoutes`. */
@Injectable()
export class AbpAdminRegistry {
  private readonly features = inject(ABP_ADMIN_FEATURES);

  /** Settings tabs from every feature, in registration order (identity first when installed). */
  readonly settings: SettingsSection[] = this.features.flatMap(f => f.settings ?? [])
    .sort((a, b) => (a.path === 'settings/identity' ? -1 : 0) - (b.path === 'settings/identity' ? -1 : 0));

  readonly nav: NavItem[] = (() => {
    const items = this.features.flatMap(f => f.nav ?? []).map(n =>
      n.path === 'settings' ? { ...n, children: this.settings, policy: this.settings.map(s => s.policy).join(' || ') } : n);
    const rank = (s: string) => { const i = SECTION_ORDER.indexOf(s); return i < 0 ? SECTION_ORDER.length : i; };
    return items.map((n, i) => ({ n, i })).sort((a, b) => rank(a.n.section) - rank(b.n.section) || a.i - b.i).map(x => x.n);
  })();

  readonly actions: QuickAction[] = this.features.flatMap(f => f.actions ?? []);

  private readonly paths = new Set(this.nav.flatMap(n => [n.path, ...(n.children ?? []).map(c => c.path)]));

  /** Whether a page is installed, e.g. to link to it from another feature's page. */
  has(path: string) {
    return this.paths.has(path);
  }

  /** `../path` when installed (for links from a page), else null (the link renders without navigation). */
  link(path: string) {
    return this.has(path) ? '../' + path : null;
  }

  find(path: string) {
    return this.nav.find(n => n.path === path);
  }
}

/** Localization key of a section heading: 'Monitoring' → 'AbpAdmin::Nav:Section:Monitoring'. */
export const sectionKey = (section: string) => `AbpAdmin::Nav:Section:${section}`;
