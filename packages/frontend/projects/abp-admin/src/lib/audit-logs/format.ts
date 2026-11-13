import { signal } from '@angular/core';
import { AuditLogDto } from '../proxy/abp-admin/services/audit-logs';
import { EntityChangeType } from '../proxy/volo/abp/auditing';

export type Tone = 'ok' | 'warn' | 'err' | 'info';

/**
 * IANA zone every time is displayed in: the Abp.Timing.TimeZone setting, or undefined for the browser's zone.
 * A signal, so templates that format times re-render when the setting changes.
 */
export const displayZone = signal<string | undefined>(undefined);

/** The server clock is UTC, so times arrive as ISO strings with a zone. */
export const toMs = (s?: string | null) => (s ? new Date(s).getTime() : 0);

/** Instants go to the API as UTC ISO strings. */
export const toApiDate = (d: Date) => d.toISOString();

export const RANGES = [
  { key: '24h', label: '24 hours', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
] as const;
export type RangeKey = (typeof RANGES)[number]['key'];

/** [now - range, now] as API dates. */
export function rangeWindow(key: RangeKey) {
  const end = new Date();
  const start = new Date(end.getTime() - RANGES.find(r => r.key === key)!.days * 86400000);
  return { startTime: toApiDate(start), endTime: toApiDate(end) };
}

/** Format an instant in the display zone. */
export const stamp = (s: string | null | undefined, opts: Intl.DateTimeFormatOptions) =>
  s ? new Date(s).toLocaleString(undefined, { ...opts, timeZone: displayZone() }) : '';

/** Format a calendar day ("yyyy-MM-dd", already cut in the display zone by the server). */
export const calendarDay = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });

/** "yyyy-MM-dd" of an instant in the display zone. */
const dayKey = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: displayZone() });

export const failed = (log: AuditLogDto) => !!log.exceptions || (log.httpStatusCode ?? 0) >= 400;

export function statusTone(code?: number | null, hasException = false): Tone {
  if (hasException || (code ?? 0) >= 500) return 'err';
  if ((code ?? 0) >= 400) return 'warn';
  return 'ok';
}

export function methodTone(method?: string | null): Tone {
  switch (method) {
    case 'GET': return 'info';
    case 'DELETE': return 'err';
    case 'PUT': case 'PATCH': return 'warn';
    default: return 'ok';
  }
}

export const changeLabel: Record<EntityChangeType, string> = {
  [EntityChangeType.Created]: 'Created',
  [EntityChangeType.Updated]: 'Updated',
  [EntityChangeType.Deleted]: 'Deleted',
};
export const changeTone: Record<EntityChangeType, Tone> = {
  [EntityChangeType.Created]: 'ok',
  [EntityChangeType.Updated]: 'warn',
  [EntityChangeType.Deleted]: 'err',
};

/** "Volo.Abp.Identity.IdentityUser" → "IdentityUser" */
export const shortType = (fullName?: string | null) => fullName?.split('.').pop() ?? '';

/** "…IdentityUserAppService" + "CreateAsync" → "IdentityUser · Create" */
export function actionLabel(service?: string | null, method?: string | null): string {
  const svc = shortType(service).replace(/(AppService|Controller|Service)$/, '');
  return `${svc} · ${(method ?? '').replace(/Async$/, '')}`;
}

export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
export function relative(s?: string, now = Date.now()): string {
  const diff = (toMs(s) - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export function dayLabel(s?: string | null): string {
  const key = dayKey(toMs(s));
  if (key === dayKey(Date.now())) return 'Today';
  if (key === dayKey(Date.now() - 86400000)) return 'Yesterday';
  return calendarDay(key, { weekday: 'long', month: 'short', day: 'numeric' });
}

export const clock = (s?: string | null) => stamp(s, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Pretty-print JSON-ish strings; leaves anything else alone. */
export function pretty(value?: string | null): string {
  if (!value) return '';
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

/** Action parameters JSON → flat rows: {"input":{"name":"a","tags":["x"]}} → input.name = a, input.tags[0] = x. */
export function flatParams(json?: string | null): { path: string; value: string | null }[] {
  if (!json) return [];
  let root: unknown;
  try { root = JSON.parse(json); } catch { return [{ path: '(raw)', value: json }]; }
  const rows: { path: string; value: string | null }[] = [];
  const walk = (v: unknown, path: string) => {
    if (v !== null && typeof v === 'object') {
      const entries = Array.isArray(v) ? v.map((x, i) => [`${path}[${i}]`, x] as const)
        : Object.entries(v).map(([k, x]) => [path ? `${path}.${k}` : k, x] as const);
      if (!entries.length) rows.push({ path, value: Array.isArray(v) ? '[]' : '{}' });
      entries.forEach(([p, x]) => walk(x, p));
    } else {
      rows.push({ path, value: v == null ? null : String(v) });
    }
  };
  walk(root, '');
  return rows.filter(r => r.path); // a bare "{}" means no parameters
}

/** Entity property values are stored JSON-encoded ("\"abc\"", "null"); show them plainly. */
export function plainValue(value?: string | null): string | null {
  if (value == null) return null;
  try {
    const v = JSON.parse(value);
    return v == null ? null : typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return value;
  }
}

/** Split the URL into path and query for display, and dim long ids. */
export function splitUrl(url?: string | null): { path: string; query: string } {
  const [path, query] = (url ?? '').split('?');
  return { path, query: query ? `?${query}` : '' };
}

/** "Mozilla/5.0 … Chrome/157.0 …" → "Chrome 157". */
export function browserName(info?: string | null): string {
  if (!info) return '—';
  const m = info.match(/(Edg|OPR|Chrome|Firefox|Safari|node|curl|PostmanRuntime|python-requests|okhttp)[/ ]?([\d.]*)/i);
  if (!m) return info.slice(0, 40);
  const name = ({ Edg: 'Edge', OPR: 'Opera' } as Record<string, string>)[m[1]] ?? m[1];
  const os = /Windows/.test(info) ? ' · Windows' : /Mac OS/.test(info) ? ' · macOS' : /Android/.test(info) ? ' · Android' : /iPhone|iPad/.test(info) ? ' · iOS' : /Linux/.test(info) ? ' · Linux' : '';
  return `${name} ${m[2].split('.')[0]}`.trim() + os;
}
