import { LocalizationPipe } from '@abp/ng.core';
import { Component, inject, input, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { apiError } from './api-error';
import { Toaster } from './toast';

/** Saves a blob as a file through a temporary link. */
export function download(blob: Blob, fileName: string) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName });
  a.click();
  URL.revokeObjectURL(a.href);
}

/** "Export CSV" for a list: downloads what `source` returns (the server applies the page's current filters). */
@Component({
  selector: 'app-export-button',
  imports: [LocalizationPipe],
  template: `
    <button class="icon-btn" (click)="run()" [disabled]="busy()" [class.spin]="busy()"
            [title]="'::Common:ExportCsvHint' | abpLocalization" [attr.aria-label]="'::Common:ExportCsv' | abpLocalization">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
    </button>
  `,
})
export class ExportButtonComponent {
  private readonly toaster = inject(Toaster);
  readonly source = input.required<() => Observable<Blob>>();
  readonly fileName = input.required<string>();
  protected readonly busy = signal(false);

  protected run() {
    this.busy.set(true);
    this.source()().subscribe({
      next: blob => { this.busy.set(false); download(blob, this.fileName()); },
      error: e => { this.busy.set(false); this.toaster.error(apiError(e)); },
    });
  }
}
