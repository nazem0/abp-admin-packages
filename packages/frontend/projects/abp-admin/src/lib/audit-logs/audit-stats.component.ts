import { DecimalPipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { AuditLogStatisticsDto } from '../proxy/abp-admin/services/audit-logs';
import { calendarDay, duration, methodTone, statusTone } from './format';

export interface StatsPick { url?: string | null; method?: string | null; status?: number }

const W = 720, H = 190, PAD_L = 34, PAD_R = 40, PAD_T = 12, PAD_B = 26;

@Component({
  selector: 'abp-audit-stats',
  template: `
    @let s = stats();
    <section class="kpis" aria-label="Key figures">
      <div class="kpi card">
        <span class="label">Requests</span>
        <strong>{{ s.totalRequests | number }}</strong>
        <svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
          <path [attr.d]="spark()" />
        </svg>
      </div>
      <div class="kpi card" [class]="errorRate() > 5 ? 'kpi card tone-err' : 'kpi card tone-ok'">
        <span class="label">Error rate</span>
        <strong>{{ errorRate() | number: '1.0-1' }}<small>%</small></strong>
        <span class="sub">{{ s.failedRequests }} failed</span>
      </div>
      <div class="kpi card">
        <span class="label">Avg. duration</span>
        <strong>{{ fmt(s.averageDuration) }}</strong>
        <span class="sub">max {{ fmt(s.maxDuration) }}</span>
      </div>
      <div class="kpi card">
        <span class="label">Active users</span>
        <strong>{{ s.uniqueUsers }}</strong>
        <span class="sub">{{ s.topUsers[0]?.key ?? '—' }} most active</span>
      </div>
      <div class="kpi card">
        <span class="label">Entity changes</span>
        <strong>{{ s.entityChanges | number }}</strong>
        <span class="sub">rows written</span>
      </div>
    </section>

    <section class="grid">
      <div class="card panel chart">
        <header>
          <h3>Traffic</h3>
          <div class="legend">
            <span><i class="sw ok"></i>Succeeded</span>
            <span><i class="sw err"></i>Failed</span>
            <span><i class="sw line"></i>Avg. duration</span>
          </div>
        </header>
        <div class="readout" aria-live="polite">
          @if (hoverDay(); as d) {
            <b>{{ calendarDay(d.date, { weekday: 'short', month: 'short', day: 'numeric' }) }}</b>
            <span>{{ d.requests }} requests</span>
            <span class="err-t">{{ d.failed }} failed</span>
            <span>{{ fmt(d.averageDuration) }} avg</span>
          } @else {
            <span class="muted">Hover a day for details</span>
          }
        </div>
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" aria-label="Requests per day with failures and average duration">
          @for (t of yTicks(); track t.v) {
            <line class="gridline" [attr.x1]="PAD_L" [attr.x2]="W - PAD_R" [attr.y1]="t.y" [attr.y2]="t.y" />
            <text class="axis" [attr.x]="PAD_L - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.v }}</text>
          }
          @for (b of bars(); track b.i) {
            <g class="day" [class.dim]="hover() !== null && hover() !== b.i"
               (mouseenter)="hover.set(b.i)" (mouseleave)="hover.set(null)">
              <rect class="hit" [attr.x]="b.x - b.gap / 2" [attr.y]="PAD_T" [attr.width]="b.w + b.gap" [attr.height]="H - PAD_T - PAD_B" />
              <rect class="ok" [attr.x]="b.x" [attr.y]="b.yOk" [attr.width]="b.w" [attr.height]="b.hOk" rx="3" />
              <rect class="err" [attr.x]="b.x" [attr.y]="b.yErr" [attr.width]="b.w" [attr.height]="b.hErr" rx="3" />
              @if (b.label) {
                <text class="axis" [attr.x]="b.x + b.w / 2" [attr.y]="H - 8" text-anchor="middle">{{ b.label }}</text>
              }
            </g>
          }
          <path class="line" [attr.d]="durationLine()" />
          @for (p of durationDots(); track p.i) {
            <circle class="pt" [class.on]="hover() === p.i" [attr.cx]="p.x" [attr.cy]="p.y" r="3.5" />
          }
          <text class="axis" [attr.x]="W - PAD_R + 6" [attr.y]="PAD_T + 4">{{ fmt(maxAvg()) }}</text>
        </svg>
      </div>

      <div class="card panel">
        <header><h3>Status codes</h3></header>
        <div class="stack" role="img" [attr.aria-label]="'Status code distribution'">
          @for (c of s.statusCodes; track c.key) {
            <span [class]="'tone-' + tone(c.key)" [style.flex-grow]="c.count" [title]="c.key + ': ' + c.count"></span>
          }
        </div>
        <ul class="codes">
          @for (c of s.statusCodes; track c.key) {
            <li>
              <button [class]="'pill tone-' + tone(c.key)" (click)="pick.emit({ status: +c.key })" [disabled]="c.key === '—'">
                {{ c.key }}
              </button>
              <span class="bar"><i [class]="'tone-' + tone(c.key)" [style.width.%]="(c.count / s.totalRequests) * 100"></i></span>
              <b>{{ c.count }}</b>
            </li>
          }
        </ul>
        <header class="sub-h"><h3>Methods</h3></header>
        <div class="methods">
          @for (m of s.httpMethods; track m.key) {
            <button [class]="'pill tone-' + mTone(m.key)" (click)="pick.emit({ method: m.key })">
              <span class="method">{{ m.key }}</span> {{ m.count }}
            </button>
          }
        </div>
      </div>
    </section>

    <section class="grid two">
      @for (list of endpointLists(); track list.title) {
        <div class="card panel">
          <header><h3>{{ list.title }}</h3><span class="muted">{{ list.hint }}</span></header>
          <ol class="endpoints">
            @for (e of list.items; track $index) {
              <li>
                <button (click)="pick.emit({ url: e.url, method: e.httpMethod })" [title]="e.httpMethod + ' ' + e.url">
                  <span [class]="'method tone-' + mTone(e.httpMethod)">{{ e.httpMethod }}</span>
                  <span class="path mono">{{ e.url }}</span>
                  <span class="meter" aria-hidden="true">
                    <i [style.width.%]="list.metric(e) / list.max * 100"></i>
                    @if (e.failed) { <i class="f" [style.width.%]="e.failed / list.maxCount * 100"></i> }
                  </span>
                  <span class="val">{{ list.value(e) }}</span>
                </button>
              </li>
            } @empty {
              <li class="muted empty">No traffic in this range</li>
            }
          </ol>
        </div>
      }
    </section>
  `,
  styleUrl: './audit-stats.component.scss',
  imports: [DecimalPipe],
})
export class AuditStatsComponent {
  protected readonly calendarDay = calendarDay;
  readonly stats = input.required<AuditLogStatisticsDto>();
  readonly pick = output<StatsPick>();

  protected readonly W = W;
  protected readonly H = H;
  protected readonly PAD_L = PAD_L;
  protected readonly PAD_R = PAD_R;
  protected readonly PAD_T = PAD_T;
  protected readonly PAD_B = PAD_B;
  protected readonly hover = signal<number | null>(null);
  protected readonly fmt = duration;
  protected readonly mTone = methodTone;
  protected tone = (key: string) => (key === '—' ? 'info' : statusTone(+key));

  protected readonly errorRate = computed(() => {
    const s = this.stats();
    return s.totalRequests ? (s.failedRequests / s.totalRequests) * 100 : 0;
  });

  protected readonly hoverDay = computed(() => {
    const i = this.hover();
    return i === null ? null : this.stats().days[i];
  });

  private readonly maxReq = computed(() => niceMax(Math.max(1, ...this.stats().days.map(d => d.requests))));
  protected readonly maxAvg = computed(() => Math.max(1, ...this.stats().days.map(d => d.averageDuration)));

  protected readonly yTicks = computed(() => {
    const max = this.maxReq();
    return [0, max / 2, max].map(v => ({ v: Math.round(v), y: this.y(v) }));
  });

  protected readonly bars = computed(() => {
    const days = this.stats().days;
    const slot = (W - PAD_L - PAD_R) / Math.max(1, days.length);
    const w = Math.max(3, Math.min(28, slot * 0.62));
    const every = Math.ceil(days.length / 10);
    return days.map((d, i) => {
      // One bar per day: full height = all requests, the failed share sits at its base.
      const x = PAD_L + slot * i + (slot - w) / 2;
      const base = this.y(0);
      const hOk = base - this.y(d.requests);
      const hErr = base - this.y(d.failed);
      return {
        i, x, w, gap: slot - w,
        yOk: base - hOk, hOk,
        yErr: base - hErr, hErr,
        label: i % every === 0 ? calendarDay(d.date, { month: 'short', day: 'numeric' }) : '',
      };
    });
  });

  /** Avg-duration points; days without traffic have no duration, so they break the line instead of dipping to 0. */
  protected readonly durationPoints = computed(() => {
    const days = this.stats().days;
    const slot = (W - PAD_L - PAD_R) / Math.max(1, days.length);
    const max = this.maxAvg();
    return days.map((d, i) => d.requests === 0 ? null : {
      i,
      x: PAD_L + slot * i + slot / 2,
      y: H - PAD_B - (d.averageDuration / max) * (H - PAD_T - PAD_B),
    });
  });

  protected readonly durationLine = computed(() => {
    let d = '', prev = false;
    for (const p of this.durationPoints()) {
      if (p) d += `${prev ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `;
      prev = !!p;
    }
    return d;
  });

  protected readonly durationDots = computed(() => this.durationPoints().filter(p => p !== null));

  protected readonly spark = computed(() => {
    const days = this.stats().days;
    const max = Math.max(1, ...days.map(d => d.requests));
    const step = 100 / Math.max(1, days.length - 1);
    return days.map((d, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(26 - (d.requests / max) * 24).toFixed(1)}`).join(' ');
  });

  protected readonly endpointLists = computed(() => {
    const s = this.stats();
    const maxCount = Math.max(1, ...s.topEndpoints.map(e => e.count));
    const maxDur = Math.max(1, ...s.slowestEndpoints.map(e => e.averageDuration));
    return [
      {
        title: 'Busiest endpoints', hint: 'by requests', items: s.topEndpoints, max: maxCount, maxCount,
        metric: (e: { count: number }) => e.count,
        value: (e: { count: number; failed: number }) => (e.failed ? `${e.count} · ${e.failed} failed` : `${e.count}`),
      },
      {
        title: 'Slowest endpoints', hint: 'by average duration', items: s.slowestEndpoints, max: maxDur,
        maxCount: Math.max(1, ...s.slowestEndpoints.map(e => e.count)),
        metric: (e: { averageDuration: number }) => e.averageDuration,
        value: (e: { averageDuration: number }) => duration(e.averageDuration),
      },
    ];
  });

  private y(v: number) {
    return H - PAD_B - (v / this.maxReq()) * (H - PAD_T - PAD_B);
  }
}

function niceMax(v: number) {
  const pow = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map(m => m * pow).find(n => n >= v) ?? v;
}
