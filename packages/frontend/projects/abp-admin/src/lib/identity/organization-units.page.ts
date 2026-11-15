import { LocalizationPipe, LocalizationService, PermissionService } from '@abp/ng.core';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { OrganizationUnitDto, OrganizationUnitService } from '../proxy/abp-admin/services/identity';
import { IdentityRoleService, IdentityUserService } from '../proxy/volo/abp/identity';
import { apiError } from '../shared/api-error';
import { Toaster } from '../shared/toast';

interface Node extends OrganizationUnitDto { depth: number; hasChildren: boolean; path: string[] }

/**
 * Organization units: a tree of departments/teams. Members get every role assigned to their unit and its
 * parent units, so the tree is a way to hand out permissions by structure.
 */
@Component({
  selector: 'abp-organization-units-page',
  imports: [NgTemplateOutlet, LocalizationPipe],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>{{ 'AbpAdmin::OrganizationUnits:Title' | abpLocalization }}</h1>
          <p class="muted">{{ 'AbpAdmin::OrganizationUnits:Subtitle' | abpLocalization }}</p>
        </div>
        @if (can('AbpAdmin.OrganizationUnits.ManageTree')) {
          <button class="btn primary" (click)="startAdd(null)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg> {{ 'AbpAdmin::OrganizationUnits:NewRoot' | abpLocalization }}
          </button>
        }
      </header>

      <div class="split">
        <!-- Tree -->
        <section class="card tree" [attr.aria-label]="'AbpAdmin::OrganizationUnits:TreeLabel' | abpLocalization">
          @if (tree.isLoading() && !nodes().length) {
            <div class="skeleton rows">@for (i of [1, 2, 3, 4]; track i) { <i></i> }</div>
          } @else if (tree.error()) {
            <div class="state err">{{ 'AbpAdmin::OrganizationUnits:LoadFailed' | abpLocalization }} <button class="btn" (click)="tree.reload()">{{ 'AbpAdmin::Common:Retry' | abpLocalization }}</button></div>
          } @else {
            <ul role="tree">
              @if (adding() === null) { <ng-container *ngTemplateOutlet="newRow; context: { depth: 0 }" /> }
              @for (n of visible(); track n.id) {
                <li role="treeitem" [attr.aria-level]="n.depth + 1" [attr.aria-expanded]="n.hasChildren ? !collapsed().has(n.id!) : null"
                    [attr.aria-selected]="selectedId() === n.id" [style.--d]="n.depth" [class.sel]="selectedId() === n.id">
                  <button class="chev" [class.leaf]="!n.hasChildren" (click)="toggle(n)" [attr.aria-label]="((collapsed().has(n.id!) ? 'AbpAdmin::OrganizationUnits:Expand' : 'AbpAdmin::OrganizationUnits:Collapse') | abpLocalization: n.displayName ?? '')" [disabled]="!n.hasChildren">
                    <svg viewBox="0 0 24 24" aria-hidden="true" [class.open]="!collapsed().has(n.id!)"><path d="M9 6l6 6-6 6" /></svg>
                  </button>
                  <button class="name" (click)="select(n.id!)">
                    <span class="folder" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></span>
                    <span class="label">{{ n.displayName }}</span>
                    <span class="counts" [title]="'AbpAdmin::OrganizationUnits:Counts' | abpLocalization: n.memberCount + '' : n.roleCount + ''">{{ n.memberCount }}</span>
                  </button>
                  @if (can('AbpAdmin.OrganizationUnits.ManageTree')) {
                    <button class="icon-btn add" [title]="'AbpAdmin::OrganizationUnits:AddChild' | abpLocalization" [attr.aria-label]="'AbpAdmin::OrganizationUnits:AddChildAria' | abpLocalization: n.displayName ?? ''" (click)="startAdd(n.id!)">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
                  }
                </li>
                @if (adding() === n.id) { <ng-container *ngTemplateOutlet="newRow; context: { depth: n.depth + 1 }" /> }
              } @empty {
                @if (adding() === undefined) {
                  <li class="state empty">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                    <b>{{ 'AbpAdmin::OrganizationUnits:NoUnits' | abpLocalization }}</b><span class="muted">{{ 'AbpAdmin::OrganizationUnits:NoUnitsHint' | abpLocalization }}</span>
                  </li>
                }
              }
            </ul>
          }
          <ng-template #newRow let-depth="depth">
            <li class="new" [style.--d]="depth">
              <form (submit)="$event.preventDefault(); create(nameInput.value)">
                <input #nameInput class="input" [placeholder]="'AbpAdmin::OrganizationUnits:UnitName' | abpLocalization" [attr.aria-label]="'AbpAdmin::OrganizationUnits:NewUnitName' | abpLocalization" maxlength="128" required autofocus (keydown.escape)="adding.set(undefined)" />
                <button class="btn sm primary">{{ 'AbpAdmin::OrganizationUnits:Add' | abpLocalization }}</button>
                <button type="button" class="btn sm" (click)="adding.set(undefined)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button>
              </form>
            </li>
          </ng-template>
        </section>

        <!-- Detail -->
        <section class="card detail" aria-live="polite">
          @if (selected(); as u) {
            <header class="dhead">
              <nav class="crumbs" [attr.aria-label]="'AbpAdmin::OrganizationUnits:UnitPath' | abpLocalization">
                @for (p of u.path; track $index) { <span>{{ p }}</span><span class="sep" aria-hidden="true">›</span> }
              </nav>
              @if (renaming()) {
                <form class="rename" (submit)="$event.preventDefault(); rename(u, rn.value)">
                  <input #rn class="input" [value]="u.displayName" [attr.aria-label]="'AbpAdmin::OrganizationUnits:UnitName' | abpLocalization" maxlength="128" required autofocus (keydown.escape)="renaming.set(false)" />
                  <button class="btn sm primary">{{ 'AbpAdmin::Common:Save' | abpLocalization }}</button>
                  <button type="button" class="btn sm" (click)="renaming.set(false)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button>
                </form>
              } @else {
                <div class="title">
                  <h2>{{ u.displayName }}</h2>
                  <span class="mono muted small" [title]="'AbpAdmin::OrganizationUnits:HierarchyCode' | abpLocalization">{{ u.code }}</span>
                  @if (can('AbpAdmin.OrganizationUnits.ManageTree')) {
                    <span class="tools">
                      <button class="icon-btn" [title]="'AbpAdmin::OrganizationUnits:Rename' | abpLocalization" [attr.aria-label]="'AbpAdmin::OrganizationUnits:RenameAria' | abpLocalization" (click)="renaming.set(true)">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg></button>
                      <select class="input move" [attr.aria-label]="'AbpAdmin::OrganizationUnits:MoveAria' | abpLocalization" (change)="move(u, $any($event.target).value); $any($event.target).value = ''">
                        <option value="" selected disabled>{{ 'AbpAdmin::OrganizationUnits:MoveTo' | abpLocalization }}</option>
                        @if (u.parentId) { <option value="root">{{ 'AbpAdmin::OrganizationUnits:TopLevel' | abpLocalization }}</option> }
                        @for (t of moveTargets(); track t.id) { <option [value]="t.id">{{ '— '.repeat(t.depth) }}{{ t.displayName }}</option> }
                      </select>
                      @if (confirmDelete()) {
                        <span class="confirm">{{ 'AbpAdmin::OrganizationUnits:DeleteWithSub' | abpLocalization }}
                          <button class="btn sm danger" (click)="remove(u)">{{ 'AbpAdmin::Common:Delete' | abpLocalization }}</button>
                          <button class="btn sm" (click)="confirmDelete.set(false)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button></span>
                      } @else {
                        <button class="icon-btn" [title]="'AbpAdmin::Common:Delete' | abpLocalization" [attr.aria-label]="'AbpAdmin::OrganizationUnits:DeleteAria' | abpLocalization" (click)="confirmDelete.set(true)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg></button>
                      }
                    </span>
                  }
                </div>
              }
              <div class="seg" role="tablist" [attr.aria-label]="'AbpAdmin::OrganizationUnits:UnitDetails' | abpLocalization">
                <button role="tab" [attr.aria-selected]="tab() === 'members'" [attr.aria-checked]="tab() === 'members'" (click)="tab.set('members')">{{ 'AbpAdmin::OrganizationUnits:MembersTab' | abpLocalization: u.memberCount + '' }}</button>
                <button role="tab" [attr.aria-selected]="tab() === 'roles'" [attr.aria-checked]="tab() === 'roles'" (click)="tab.set('roles')">{{ 'AbpAdmin::OrganizationUnits:RolesTab' | abpLocalization: u.roleCount + '' }}</button>
              </div>
            </header>

            @if (tab() === 'members') {
              <div class="pane">
                <div class="bar">
                  <label class="search">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                    <input class="input" type="search" placeholder="{{ 'AbpAdmin::OrganizationUnits:FilterMembers' | abpLocalization }}" [attr.aria-label]="'AbpAdmin::OrganizationUnits:FilterMembersLabel' | abpLocalization"
                           (change)="memberFilter.set($any($event.target).value.trim())" (search)="memberFilter.set($any($event.target).value.trim())" />
                  </label>
                  @if (can('AbpAdmin.OrganizationUnits.ManageMembers')) {
                    <button class="btn" (click)="picking.set(picking() === 'users' ? null : 'users')" [attr.aria-expanded]="picking() === 'users'">{{ 'AbpAdmin::OrganizationUnits:AddMembers' | abpLocalization }}</button>
                  }
                </div>
                @if (picking() === 'users') {
                  <div class="picker">
                    <input class="input" type="search" placeholder="{{ 'AbpAdmin::OrganizationUnits:SearchUsers' | abpLocalization }}" [attr.aria-label]="'AbpAdmin::OrganizationUnits:SearchUsersLabel' | abpLocalization" autofocus
                           (input)="userQuery.set($any($event.target).value.trim())" />
                    <ul>
                      @for (c of userCandidates(); track c.id) {
                        <li><label class="check"><input type="checkbox" [checked]="picked().has(c.id!)" (change)="pick(c.id!, $any($event.target).checked)" />
                          <span>{{ c.name }} {{ c.surname }} <small>&#64;{{ c.userName }} · {{ c.email }}</small></span></label></li>
                      } @empty { <li class="muted">{{ (userQuery() ? 'AbpAdmin::OrganizationUnits:NoMatchingUsers' : 'AbpAdmin::OrganizationUnits:TypeToSearch') | abpLocalization }}</li> }
                    </ul>
                    <div class="pick-foot">
                      <span class="muted small">{{ 'AbpAdmin::OrganizationUnits:Selected' | abpLocalization: picked().size.toString() }}</span>
                      <button class="btn sm" (click)="picking.set(null)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button>
                      <button class="btn sm primary" [disabled]="!picked().size" (click)="addMembers(u)">{{ (picked().size ? 'AbpAdmin::OrganizationUnits:AddN' : 'AbpAdmin::OrganizationUnits:Add') | abpLocalization: picked().size.toString() }}</button>
                    </div>
                  </div>
                }
                <ul class="people">
                  @for (m of members.value()?.items; track m.id) {
                    <li>
                      <span class="avatar" aria-hidden="true">{{ (m.name || m.userName || '?')[0].toUpperCase() }}</span>
                      <span class="who"><b>{{ [m.name, m.surname].join(' ').trim() || m.userName }}</b><small>&#64;{{ m.userName }} · {{ m.email }}</small></span>
                      @if (can('AbpAdmin.OrganizationUnits.ManageMembers')) {
                        <button class="icon-btn" [title]="'AbpAdmin::OrganizationUnits:RemoveFromUnit' | abpLocalization" [attr.aria-label]="'AbpAdmin::OrganizationUnits:RemoveAria' | abpLocalization: m.userName ?? ''" (click)="removeMember(u, m.id!, m.userName!)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
                      }
                    </li>
                  } @empty {
                    <li class="state empty"><b>{{ 'AbpAdmin::OrganizationUnits:NoMembers' | abpLocalization }}</b><span class="muted">{{ 'AbpAdmin::OrganizationUnits:NoMembersHint' | abpLocalization }}</span></li>
                  }
                </ul>
              </div>
            } @else {
              <div class="pane">
                <p class="muted small hint">{{ 'AbpAdmin::OrganizationUnits:RolesHint' | abpLocalization: u.displayName ?? '' }}</p>
                @if (can('AbpAdmin.OrganizationUnits.ManageRoles')) {
                  <div class="bar"><span></span><button class="btn" (click)="picking.set(picking() === 'roles' ? null : 'roles')" [attr.aria-expanded]="picking() === 'roles'">{{ 'AbpAdmin::OrganizationUnits:AddRoles' | abpLocalization }}</button></div>
                }
                @if (picking() === 'roles') {
                  <div class="picker">
                    <ul>
                      @for (r of roleCandidates(); track r.id) {
                        <li><label class="check"><input type="checkbox" [checked]="picked().has(r.id!)" (change)="pick(r.id!, $any($event.target).checked)" /><span>{{ r.name }}</span></label></li>
                      } @empty { <li class="muted">{{ 'AbpAdmin::OrganizationUnits:AllAssigned' | abpLocalization }}</li> }
                    </ul>
                    <div class="pick-foot">
                      <span class="muted small">{{ 'AbpAdmin::OrganizationUnits:Selected' | abpLocalization: picked().size.toString() }}</span>
                      <button class="btn sm" (click)="picking.set(null)">{{ 'AbpAdmin::Common:Cancel' | abpLocalization }}</button>
                      <button class="btn sm primary" [disabled]="!picked().size" (click)="addRoles(u)">{{ (picked().size ? 'AbpAdmin::OrganizationUnits:AddN' : 'AbpAdmin::OrganizationUnits:Add') | abpLocalization: picked().size.toString() }}</button>
                    </div>
                  </div>
                }
                <ul class="people">
                  @for (r of roles.value(); track r.id) {
                    <li>
                      <span class="avatar sq" aria-hidden="true">{{ (r.name || '?')[0].toUpperCase() }}</span>
                      <span class="who"><b>{{ r.name }}</b></span>
                      @if (can('AbpAdmin.OrganizationUnits.ManageRoles')) {
                        <button class="icon-btn" [title]="'AbpAdmin::OrganizationUnits:RemoveRole' | abpLocalization" [attr.aria-label]="'AbpAdmin::OrganizationUnits:RemoveRoleAria' | abpLocalization: r.name ?? ''" (click)="removeRole(u, r.id!, r.name!)">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
                      }
                    </li>
                  } @empty {
                    <li class="state empty"><b>{{ 'AbpAdmin::OrganizationUnits:NoRoles' | abpLocalization }}</b><span class="muted">{{ 'AbpAdmin::OrganizationUnits:NoRolesHint' | abpLocalization }}</span></li>
                  }
                </ul>
              </div>
            }
          } @else {
            <div class="state empty pick-one">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6v4H9zM4 16h6v4H4zM14 16h6v4h-6zM12 8v4M7 16v-2h10v2" /></svg>
              <b>{{ 'AbpAdmin::OrganizationUnits:SelectUnit' | abpLocalization }}</b><span class="muted">{{ 'AbpAdmin::OrganizationUnits:SelectUnitHint' | abpLocalization }}</span>
            </div>
          }
        </section>
      </div>
    </div>
  `,
  styles: `
    .split { display: grid; grid-template-columns: minmax(260px, 360px) minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 900px) { .split { grid-template-columns: minmax(0, 1fr); } }
    .tree { padding: 8px; position: sticky; top: 16px; max-height: calc(100dvh - 32px); overflow: auto; }
    @media (max-width: 900px) { .tree { position: static; max-height: none; } }
    ul { list-style: none; margin: 0; padding: 0; }
    .tree li { display: flex; align-items: center; gap: 2px; padding-inline-start: calc(var(--d) * 18px); border-radius: 9px; }
    .tree li:hover { background: var(--surface-2); }
    .tree li.sel { background: var(--accent-soft); }
    .tree li.sel .name { color: var(--accent); font-weight: 600; }
    .chev { display: grid; place-items: center; width: 24px; height: 32px; flex: none; border: 0; background: none; color: var(--muted); cursor: pointer; padding: 0; }
    .chev.leaf { visibility: hidden; }
    .chev svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; transition: transform 0.15s; }
    .chev svg.open { transform: rotate(90deg); }
    .name { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 6px; border: 0; background: none; color: var(--text);
      font: inherit; text-align: start; cursor: pointer; border-radius: 8px; }
    .folder svg { width: 17px; height: 17px; display: block; fill: color-mix(in srgb, var(--accent) 18%, transparent); stroke: var(--accent); stroke-width: 1.8; stroke-linejoin: round; }
    .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .counts { font-size: 11.5px; color: var(--muted); padding: 1px 7px; border-radius: 999px; background: var(--surface-2); font-variant-numeric: tabular-nums; }
    li.sel .counts { background: var(--surface); }
    .add { width: 28px; height: 28px; opacity: 0; }
    li:hover .add, li.sel .add, .add:focus-visible { opacity: 1; }
    .add svg { width: 15px; height: 15px; }
    .new form { display: flex; gap: 6px; padding: 6px 4px 6px 26px; width: 100%; }
    .new .input { flex: 1; height: 30px; }
    .detail { min-height: 360px; overflow: hidden; }
    .dhead { padding: 18px 20px 12px; border-bottom: 1px solid var(--border); display: grid; gap: 10px; }
    .crumbs { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12.5px; color: var(--muted); min-height: 18px; }
    .crumbs .sep:last-child { display: none; }
    .title { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 12px; }
    .title h2 { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
    .small { font-size: 12px; }
    .tools { margin-inline-start: auto; display: flex; align-items: center; gap: 4px; }
    .move { width: 150px; height: 30px; font-size: 13px; }
    .rename { display: flex; gap: 6px; }
    .rename .input { flex: 1; max-width: 360px; }
    .seg { width: fit-content; }
    .pane { padding: 12px 20px 20px; display: grid; gap: 10px; }
    .bar { display: flex; gap: 8px; justify-content: space-between; align-items: center; }
    .bar .search { flex: 1; max-width: 360px; position: relative; display: flex; }
    .hint { margin: 0; }
    .picker { border: 1px solid var(--border); border-radius: 12px; padding: 10px; display: grid; gap: 8px; background: var(--surface-2); }
    .picker .input { width: 100%; }
    .picker ul { max-height: 240px; overflow: auto; display: grid; gap: 2px; }
    .picker li { padding: 6px 8px; border-radius: 8px; }
    .picker li:hover { background: var(--surface); }
    .picker small { color: var(--muted); }
    .pick-foot { display: flex; align-items: center; gap: 6px; }
    .pick-foot .muted { flex: 1; }
    .people li { display: flex; align-items: center; gap: 12px; padding: 9px 8px; border-radius: 10px; }
    .people li:hover { background: var(--surface-2); }
    .people li + li { border-top: 1px solid var(--border); }
    .avatar.sq { border-radius: 9px; }
    .who { flex: 1; display: grid; min-width: 0; }
    .who small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .people .state { border: 0; }
    .pick-one { min-height: 340px; }
  `,
})
export class OrganizationUnitsPage {
  private readonly service = inject(OrganizationUnitService);
  private readonly users = inject(IdentityUserService);
  private readonly roleService = inject(IdentityRoleService);
  private readonly permissions = inject(PermissionService);
  private readonly toaster = inject(Toaster);
  private readonly l = inject(LocalizationService);

  protected readonly tree = rxResource({ stream: () => this.service.getTree(), defaultValue: [] });
  protected readonly collapsed = signal(new Set<string>());
  /** Parent id being added to; null = root; undefined = not adding. */
  protected readonly adding = signal<string | null | undefined>(undefined);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly tab = signal<'members' | 'roles'>('members');
  protected readonly renaming = linkedSignal({ source: this.selectedId, computation: () => false });
  protected readonly confirmDelete = linkedSignal({ source: this.selectedId, computation: () => false });
  protected readonly picking = linkedSignal<unknown, 'users' | 'roles' | null>({ source: () => [this.selectedId(), this.tab()], computation: () => null });
  protected readonly picked = linkedSignal({ source: this.picking, computation: () => new Set<string>() });
  protected readonly memberFilter = linkedSignal({ source: this.selectedId, computation: () => '' });
  protected readonly userQuery = linkedSignal({ source: this.picking, computation: () => '' });

  /** Tree order with depth, child flags and breadcrumb path. */
  protected readonly nodes = computed<Node[]>(() => {
    const list = this.tree.value();
    const byId = new Map(list.map(u => [u.id!, u]));
    const pathOf = (u: OrganizationUnitDto): string[] => (u.parentId && byId.get(u.parentId) ? [...pathOf(byId.get(u.parentId)!), byId.get(u.parentId)!.displayName!] : []);
    return list.map(u => ({
      ...u,
      depth: (u.code?.split('.').length ?? 1) - 1,
      hasChildren: list.some(c => c.parentId === u.id),
      path: pathOf(u),
    }));
  });

  protected readonly visible = computed(() => {
    const hidden = new Set<string>();
    return this.nodes().filter(n => {
      if (n.parentId && (hidden.has(n.parentId) || this.collapsed().has(n.parentId))) { hidden.add(n.id!); return false; }
      return true;
    });
  });

  protected readonly selected = computed(() => this.nodes().find(n => n.id === this.selectedId()) ?? null);

  /** A unit can move anywhere except under itself or its descendants, or to where it already is. */
  protected readonly moveTargets = computed(() => {
    const u = this.selected();
    if (!u) return [];
    return this.nodes().filter(n => n.id !== u.id && n.id !== u.parentId && !n.code?.startsWith(u.code + '.'));
  });

  protected readonly members = rxResource({
    params: () => (this.selectedId() ? { id: this.selectedId()!, filter: this.memberFilter() } : undefined),
    stream: ({ params }) => this.service.getMembers(params.id, { filter: params.filter || undefined, maxResultCount: 200 }),
  });
  protected readonly roles = rxResource({
    params: () => (this.selectedId() && this.tab() === 'roles' ? this.selectedId()! : undefined),
    stream: ({ params }) => this.service.getRoles(params),
    defaultValue: [],
  });

  private readonly userSearch = rxResource({
    params: () => (this.picking() === 'users' && this.userQuery() ? this.userQuery() : undefined),
    stream: ({ params }) => this.users.getList({ filter: params, maxResultCount: 20 }),
  });
  protected readonly userCandidates = computed(() => {
    const already = new Set((this.members.value()?.items ?? []).map(m => m.id));
    return (this.userSearch.value()?.items ?? []).filter(u => !already.has(u.id));
  });

  private readonly allRoles = rxResource({
    params: () => (this.picking() === 'roles' ? true : undefined),
    stream: () => this.roleService.getAllList(),
  });
  protected readonly roleCandidates = computed(() => {
    const already = new Set(this.roles.value().map(r => r.id));
    return (this.allRoles.value()?.items ?? []).filter(r => !already.has(r.id));
  });

  protected can(policy: string) {
    return this.permissions.getGrantedPolicy(policy);
  }

  protected select(id: string) {
    this.selectedId.set(id);
  }

  protected toggle(n: Node) {
    this.collapsed.update(s => { const c = new Set(s); if (c.has(n.id!)) c.delete(n.id!); else c.add(n.id!); return c; });
  }

  protected startAdd(parentId: string | null) {
    if (parentId) this.collapsed.update(s => { const c = new Set(s); c.delete(parentId); return c; });
    this.adding.set(parentId);
  }

  protected create(name: string) {
    const parentId = this.adding();
    if (!name.trim()) return;
    this.service.create({ displayName: name.trim(), parentId: parentId ?? undefined }).subscribe({
      next: ou => { this.adding.set(undefined); this.toaster.ok(this.l.instant('AbpAdmin::OrganizationUnits:Created', ou.displayName ?? '')); this.tree.reload(); this.selectedId.set(ou.id!); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected rename(u: Node, name: string) {
    this.service.update(u.id!, { displayName: name.trim() }).subscribe({
      next: () => { this.renaming.set(false); this.toaster.ok(this.l.instant('AbpAdmin::OrganizationUnits:Renamed')); this.tree.reload(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected move(u: Node, target: string) {
    if (!target) return;
    const newParentId = target === 'root' ? undefined : target;
    this.service.move(u.id!, { newParentId }).subscribe({
      next: () => { this.toaster.ok(this.l.instant('AbpAdmin::OrganizationUnits:Moved', u.displayName ?? '')); this.tree.reload(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected remove(u: Node) {
    this.service.delete(u.id!).subscribe({
      next: () => { this.toaster.ok(this.l.instant('AbpAdmin::OrganizationUnits:Deleted', u.displayName ?? '')); this.selectedId.set(null); this.tree.reload(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected pick(id: string, on: boolean) {
    this.picked.update(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  }

  protected addMembers(u: Node) {
    this.service.addMembers(u.id!, { ids: [...this.picked()] }).subscribe({
      next: () => { this.toaster.ok(this.l.instant('AbpAdmin::OrganizationUnits:MembersAdded', this.picked().size.toString(), u.displayName ?? '')); this.picking.set(null); this.members.reload(); this.tree.reload(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected removeMember(u: Node, userId: string, userName: string) {
    this.service.removeMember(u.id!, userId).subscribe({
      next: () => { this.toaster.ok(this.l.instant('AbpAdmin::OrganizationUnits:MemberRemoved', userName)); this.members.reload(); this.tree.reload(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected addRoles(u: Node) {
    this.service.addRoles(u.id!, { ids: [...this.picked()] }).subscribe({
      next: () => { this.toaster.ok(this.l.instant('AbpAdmin::OrganizationUnits:RolesAssigned', this.picked().size.toString(), u.displayName ?? '')); this.picking.set(null); this.roles.reload(); this.tree.reload(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }

  protected removeRole(u: Node, roleId: string, name: string) {
    this.service.removeRole(u.id!, roleId).subscribe({
      next: () => { this.toaster.ok(this.l.instant('AbpAdmin::OrganizationUnits:RoleRemoved', name)); this.roles.reload(); this.tree.reload(); },
      error: e => this.toaster.error(apiError(e)),
    });
  }
}
