import { Directive, ElementRef, effect, inject, input, output } from '@angular/core';

/** `<dialog [appSheet]="open" (dismiss)="…">`: native modal side sheet (focus trap, Esc, backdrop) driven by a boolean. */
@Directive({
  selector: 'dialog[appSheet]',
  host: { class: 'sheet', '(cancel)': '$event.preventDefault(); dismiss.emit()', '(click)': 'onClick($event)' },
})
export class SheetDirective {
  readonly open = input(false, { alias: 'appSheet' });
  readonly dismiss = output<void>();
  private readonly el: HTMLDialogElement = inject(ElementRef).nativeElement;

  constructor() {
    effect(() => {
      if (this.open()) { if (!this.el.open) this.el.showModal(); }
      else if (this.el.open) this.el.close();
    });
  }

  protected onClick(e: MouseEvent) {
    if (e.target === this.el) this.dismiss.emit();
  }
}
