import { ConfigStateService } from '@abp/ng.core';
import { Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { PermissionsService } from '../proxy/volo/abp/permission-management';
import { SheetDirective } from '../shared/sheet.directive';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

/** Who the permissions are edited for: role ("R", role name), user ("U", user id) or OpenIddict client ("C", client id). */
export interface PermissionTarget { providerName: 'R' | 'U' | 'C'; providerKey: string; title: string }

interface Perm {
  name: string;
  label: string;
  parent?: string;
  depth: number;
  group: string;
  /** Grants that come from somewhere else (e.g. the user's role); shown checked and locked. */
  inherited: string[];
  editable: boolean;
}

const PROVIDER: Record<string, string> = { R: 'role', U: 'user', C: 'client' };

/**
 * Side sheet that edits ABP permission grants for one role or user.
 * ABP rules: granting a child grants its parents; revoking a parent revokes its children.
 */
@Component({
  selector: 'app-permissions-editor',
  imports: [SheetDirective],
  template: `
    <dialog [appSheet]="!!target()" (dismiss)="closed.emit()" aria-labelledby="pm-title" class="pm">
      @if (target(); as t) {
        <form (submit)="$event.preventDefault(); save()">
          <header class="sh-head">
            <span class="avatar sq" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>
            </span>
            <h2 id="pm-title">Permissions <small>{{ t.title }}</small></h2>
            <button type="button" class="icon-btn" (click)="closed.emit()" aria-label="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>

          @if (perms.isLoading()) {
            <div class="sh-body"><div class="skeleton rows">@for (i of [1, 2, 3, 4, 5]; track i) { <i></i> }</div></div>
          } @else if (perms.error()) {
            <div class="sh-body"><div class="state err">Couldn't load permissions. <button type="button" class="btn" (click)="perms.reload()">Retry</button></div></div>
          } @else {
            <div class="tools">
              <label class="search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input class="input" type="search" placeholder="Search permissions…" aria-label="Search permissions"
                       [value]="q()" (input)="q.set($any($event.target).value)" />
              </label>
              <label class="check">
                <input type="checkbox" [checked]="allState() === 'all'" [indeterminate]="allState() === 'some'"
                       (change)="setMany(all(), $any($event.target).checked)" />
                Grant all
              </label>
              <span class="muted count">{{ grantedCount() }} / {{ all().length }} granted</span>
            </div>

            <div class="cols">
              @if (!q()) {
                <nav class="groups" aria-label="Permission groups">
                  @for (g of groups(); track g.name) {
                    <button type="button" [attr.aria-current]="active() === g.name" (click)="active.set(g.name)">
                      <span>{{ g.label }}</span>
                      <span class="n" [class.full]="g.granted === g.perms.length && g.granted > 0">{{ g.granted }}/{{ g.perms.length }}</span>
                    </button>
                  }
                </nav>
              }
              <div class="perms">
                @for (g of shown(); track g.name) {
                  <div class="g-head">
                    <h3>{{ g.label }}</h3>
                    <label class="check small">
                      <input type="checkbox" [checked]="g.granted === g.perms.length" [indeterminate]="g.granted > 0 && g.granted < g.perms.length"
                             (change)="setMany(g.perms, $any($event.target).checked)" />
                      Select all
                    </label>
                  </div>
                  <ul>
                    @for (p of g.perms; track p.name) {
                      <li [style.--d]="q() ? 0 : p.depth">
                        <label class="perm" [class.locked]="!p.editable || p.inherited.length">
                          <input type="checkbox" [checked]="isOn(p)" [disabled]="!p.editable || p.inherited.length"
                                 (change)="toggle(p, $any($event.target).checked)" />
                          <span class="txt">
                            <span>{{ p.label }}
                              @for (via of p.inherited; track via) { <span class="pill tone-info">via {{ via }}</span> }
                              @if (changed(p)) { <span class="pill tone-warn">{{ own().has(p.name) ? 'granting' : 'revoking' }}</span> }
                            </span>
                            <small class="mono">{{ p.name }}</small>
                          </span>
                        </label>
                      </li>
                    }
                  </ul>
                } @empty {
                  <p class="muted none">No permission matches “{{ q() }}”.</p>
                }
              </div>
            </div>
          }

          <footer class="sh-foot">
            @if (error(); as e) { <span class="alert tone-err">{{ e }}</span> }
            @else { <span class="muted">{{ changes().length ? changes().length + ' unsaved change' + (changes().length === 1 ? '' : 's') : 'No changes' }}</span> }
            <span class="spacer"></span>
            <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
            <button class="btn primary" [disabled]="!changes().length || saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `
    .pm { width: min(860px, 100vw); }
    .avatar.sq { width: 36px; height: 36px; border-radius: 10px; }
    .avatar svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .tools { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 12px 22px; border-bottom: 1px solid var(--border); background: var(--surface); }
    .tools .search { flex: 1 1 220px; }
    .count { font-size: 12.5px; font-variant-numeric: tabular-nums; }
    .cols { flex: 1; display: grid; grid-template-columns: 230px minmax(0, 1fr); min-height: 0; }
    .cols:has(> :only-child) { grid-template-columns: minmax(0, 1fr); }
    .groups { display: grid; align-content: start; gap: 2px; padding: 12px 10px; border-inline-end: 1px solid var(--border); }
    .groups button { display: flex; justify-content: space-between; gap: 8px; padding: 8px 10px; border: 0; border-radius: 8px; background: none;
      color: var(--muted); font: inherit; font-weight: 500; text-align: start; cursor: pointer; }
    .groups button:hover { background: var(--surface-2); color: var(--text); }
    .groups button[aria-current='true'] { background: var(--accent-soft); color: var(--accent); }
    .n { font-size: 12px; font-variant-numeric: tabular-nums; opacity: 0.8; }
    .n.full { color: var(--ok); opacity: 1; }
    .perms { padding: 8px 22px 24px; }
    .g-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 0 6px; }
    .g-head h3 { font-size: 13px; font-weight: 650; }
    .small { font-size: 12.5px; color: var(--muted); }
    ul { list-style: none; margin: 0; padding: 0; }
    li { padding-inline-start: calc(var(--d) * 26px); }
    .perm { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-radius: 9px; cursor: pointer; }
    .perm:hover { background: var(--surface-2); }
    .perm.locked { cursor: default; }
    .perm input { accent-color: var(--accent); margin: 3px 0 0; width: 16px; height: 16px; flex: none; }
    .txt { display: grid; min-width: 0; }
    .txt > span { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .txt small { color: var(--muted); font-size: 11.5px; overflow-wrap: anywhere; }
    .pill { height: 19px; font-size: 11px; }
    .none { padding: 24px 0; }
    .sh-foot .alert { flex: 1; }
    @media (max-width: 720px) {
      .tools { padding-inline: 14px; }
      .cols { grid-template-columns: minmax(0, 1fr); }
      .groups { display: flex; overflow-x: auto; border-inline-end: 0; border-bottom: 1px solid var(--border); }
      .groups button { flex: none; }
      .perms { padding-inline: 14px; }
      li { padding-inline-start: calc(var(--d) * 16px); }
    }
  `,
})
export class PermissionsEditorComponent {
  private readonly service = inject(PermissionsService);
  private readonly config = inject(ConfigStateService);
  private readonly toaster = inject(Toaster);

  readonly target = input<PermissionTarget | null>(null);
  readonly closed = output<void>();

  // Reset per opened target.
  protected readonly q = linkedSignal({ source: this.target, computation: () => '' });
  protected readonly error = linkedSignal<PermissionTarget | null, string | null>({ source: this.target, computation: () => null });
  protected readonly saving = signal(false);

  protected readonly perms = rxResource({
    params: () => this.target() ?? undefined,
    stream: ({ params }) => this.service.get(params.providerName, params.providerKey),
  });

  /** Groups with their permissions flattened in tree order. */
  private readonly model = computed(() => {
    const t = this.target();
    return (this.perms.value()?.groups ?? []).map(g => {
      const list = g.permissions ?? [];
      const depthOf = (name?: string): number => {
        const parent = list.find(p => p.name === name)?.parentName;
        return parent ? 1 + depthOf(parent) : 0;
      };
      const perms: Perm[] = list.map(p => ({
        name: p.name!,
        label: p.displayName ?? p.name!,
        parent: p.parentName ?? undefined,
        depth: depthOf(p.name),
        group: g.name!,
        editable: p.isEditable !== false,
        inherited: (p.grantedProviders ?? [])
          .filter(x => x.providerName !== t?.providerName)
          .map(x => `${PROVIDER[x.providerName!] ?? x.providerName} ${x.providerKey}`.trim()),
      }));
      const own = list.filter(p => p.grantedProviders?.some(x => x.providerName === t?.providerName)).map(p => p.name!);
      return { name: g.name!, label: g.displayName ?? g.name!, perms, own };
    });
  });

  private readonly original = computed(() => new Set(this.model().flatMap(g => g.own)));
  /** Grants owned by this role/user, as edited. */
  protected readonly own = linkedSignal(() => new Set(this.original()));
  protected readonly active = linkedSignal(() => this.model()[0]?.name ?? '');

  protected readonly all = computed(() => this.model().flatMap(g => g.perms));
  private readonly byName = computed(() => new Map(this.all().map(p => [p.name, p])));

  protected readonly groups = computed(() => this.model().map(g => ({
    ...g, granted: g.perms.filter(p => this.isOn(p)).length,
  })));

  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    if (!q) return this.groups().filter(g => g.name === this.active());
    return this.groups()
      .map(g => ({ ...g, perms: g.perms.filter(p => `${p.label} ${p.name}`.toLowerCase().includes(q)) }))
      .filter(g => g.perms.length);
  });

  protected readonly grantedCount = computed(() => this.all().filter(p => this.isOn(p)).length);
  protected readonly allState = computed(() => {
    const n = this.grantedCount();
    return n === 0 ? 'none' : n === this.all().length ? 'all' : 'some';
  });

  protected readonly changes = computed(() => {
    const before = this.original();
    const now = this.own();
    return this.all()
      .filter(p => before.has(p.name) !== now.has(p.name))
      .map(p => ({ name: p.name, isGranted: now.has(p.name) }));
  });

  protected isOn(p: Perm): boolean {
    return this.own().has(p.name) || p.inherited.length > 0;
  }

  protected changed(p: Perm): boolean {
    return this.original().has(p.name) !== this.own().has(p.name);
  }

  protected toggle(p: Perm, on: boolean) {
    const next = new Set(this.own());
    if (on) {
      // Granting a child grants its parents.
      for (let x: Perm | undefined = p; x; x = x.parent ? this.byName().get(x.parent) : undefined) {
        if (x.editable && !x.inherited.length) next.add(x.name);
      }
    } else {
      // Revoking a parent revokes its children.
      const drop = (name: string) => {
        next.delete(name);
        this.all().filter(c => c.parent === name).forEach(c => drop(c.name));
      };
      drop(p.name);
    }
    this.own.set(next);
  }

  protected setMany(perms: Perm[], on: boolean) {
    const next = new Set(this.own());
    for (const p of perms) {
      if (!p.editable || p.inherited.length) continue;
      if (on) next.add(p.name); else next.delete(p.name);
    }
    this.own.set(next);
  }

  protected save() {
    const t = this.target();
    if (!t || !this.changes().length) return;
    this.saving.set(true);
    this.error.set(null);
    this.service.update(t.providerName, t.providerKey, { permissions: this.changes() })
      // The signed-in user's own grants may have changed.
      .pipe(switchMap(() => this.config.refreshAppState()))
      .subscribe({
        next: () => { this.saving.set(false); this.toaster.ok(`Permissions saved for ${t.title}.`); this.closed.emit(); },
        error: e => { this.saving.set(false); this.error.set(apiError(e)); },
      });
  }
}
