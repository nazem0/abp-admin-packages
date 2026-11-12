import {
  FormGroup,
  FormBuilder,
  Validators,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, CurrencyPipe, formatDate } from '@angular/common';
import { NgbDatepickerModule, NgbDateStruct, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';
import {
  ListService,
  PagedResultDto,
  LocalizationPipe,
  PermissionDirective,
  AutofocusDirective,
  EnvironmentService,
} from '@abp/ng.core';
import {
  ConfirmationService,
  Confirmation,
  NgxDatatableDefaultDirective,
  NgxDatatableListDirective,
  ModalCloseDirective,
  ModalComponent,
  ButtonComponent,
} from '@abp/ng.theme.shared';
import { BookService, BookDto, bookTypeOptions } from '../proxy/books';
import { AuthorService, AuthorDto } from '../proxy/authors';

@Component({
  selector: 'app-book',
  templateUrl: './book.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    NgbDatepickerModule,
    NgxDatatableModule,
    NgbDropdownModule,
    ModalComponent,
    AutofocusDirective,
    NgxDatatableListDirective,
    NgxDatatableDefaultDirective,
    PermissionDirective,
    ModalCloseDirective,
    LocalizationPipe,
    DatePipe,
    CurrencyPipe,
    ButtonComponent,
  ],
  providers: [ListService],
})
export class BookComponent {
  public readonly list = inject(ListService);
  private readonly injector = inject(Injector);
  private bookService = inject(BookService);
  private authorService = inject(AuthorService);
  private fb = inject(FormBuilder);
  private confirmation = inject(ConfirmationService);
  private environmentService = inject(EnvironmentService);

  private readonly authorQuery = signal({ skipCount: 0, maxResultCount: 1000, sorting: '' });

  // We use `rxResource` for read-only API data so Angular owns loading, caching, and reactivity.
  // Angular resource guide: https://angular.dev/api/core/rxjs-interop/rxResource#api
  private readonly listQuery = toSignal(this.list.query$, {
    initialValue: { skipCount: 0, maxResultCount: 10, sorting: '' },
    injector: this.injector,
  });

  private readonly bookResource = rxResource<
    PagedResultDto<BookDto>,
    { skipCount: number; maxResultCount: number; sorting: string }
  >({
    params: () => this.listQuery(),
    stream: ({ params }) => this.bookService.getList(params as any),
    defaultValue: { items: [], totalCount: 0 },
    injector: this.injector,
  });

  private readonly authorsResource = rxResource<
    PagedResultDto<AuthorDto>,
    { skipCount: number; maxResultCount: number; sorting: string }
  >({
    params: () => this.authorQuery(),
    stream: ({ params }) => this.authorService.getList(params as any),
    defaultValue: { items: [], totalCount: 0 },
    injector: this.injector,
  });

  book = signal<PagedResultDto<BookDto>>({ items: [], totalCount: 0 });
  selectedBook = signal<BookDto | undefined>(undefined);
  form = signal<FormGroup>(new FormGroup({}));
  bookTypes = bookTypeOptions;
  authors = signal<AuthorDto[]>([]);
  isModalOpen = signal(false);

  constructor() {
    effect(() => {
      const snapshot = this.bookResource.snapshot();
      if (snapshot.status === 'resolved' || snapshot.status === 'local') {
        this.book.set(snapshot.value);
      }
    });

    effect(() => {
      const snapshot = this.authorsResource.snapshot();
      if (snapshot.status === 'resolved' || snapshot.status === 'local') {
        this.authors.set(snapshot.value.items ?? []);
      }
    });
  }

  createBook() {
    this.selectedBook.set(undefined);
    this.buildForm();
    this.isModalOpen.set(true);
  }

  editBook(id: string) {
    this.bookService.get(id).subscribe(book => {
      this.selectedBook.set(book);
      this.buildForm();
      this.isModalOpen.set(true);
    });
  }

  delete(id: string) {
    this.confirmation.warn('::AreYouSureToDelete', '::AreYouSure').subscribe(status => {
      if (status === Confirmation.Status.confirm) {
        this.bookService.delete(id).subscribe(() => this.list.get());
      }
    });
  }

  buildForm() {
    const selectedBook = this.selectedBook();
    const publishDate = selectedBook?.publishDate;
    this.form.set(
      this.fb.group({
        name: [selectedBook?.name || '', Validators.required],
        authorId: [selectedBook?.authorId || null, Validators.required],
        type: [selectedBook?.type || null, Validators.required],
        publishDate: [publishDate ? this.parseDate(publishDate) : null, Validators.required],
        price: [selectedBook?.price || null, Validators.required],
      }),
    );
  }

  exportToExcel() {
    const apiUrl = this.environmentService.getApiUrl('default');
    this.bookService.getDownloadToken().subscribe(result => {
      const token = encodeURIComponent(result.token || '');
      window.location.href = `${apiUrl}/api/app/book/as-excel-file?downloadToken=${token}`;
    });
  }

  save() {
    const form = this.form();
    if (!form || form.invalid) {
      return;
    }

    const formValue = form.value;
    const requestData = {
      ...formValue,
      publishDate: this.formatDate(formValue.publishDate),
    };
    let request = this.bookService.create(requestData);
    const selectedBook = this.selectedBook();
    if (selectedBook?.id) {
      request = this.bookService.update(selectedBook.id, requestData);
    }

    request.subscribe(() => {
      this.isModalOpen.set(false);
      form.reset();
      this.list.get();
    });
  }

  private parseDate(value: string | Date): NgbDateStruct | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return null;
    }

    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }

  private formatDate(dateStruct: NgbDateStruct | null): string {
    if (!dateStruct) {
      return '';
    }

    const date = new Date(dateStruct.year, dateStruct.month - 1, dateStruct.day);
    return formatDate(date, 'yyyy-MM-dd', 'en');
  }
}
