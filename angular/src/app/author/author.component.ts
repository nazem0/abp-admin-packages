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
import { DatePipe, formatDate } from '@angular/common';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
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
import { AuthorService, AuthorDto } from '../proxy/authors';

@Component({
  selector: 'app-author',
  templateUrl: './author.component.html',
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
    ButtonComponent,
  ],
  providers: [ListService],
})
export class AuthorComponent {
  public readonly list = inject(ListService);
  private readonly injector = inject(Injector);
  private authorService = inject(AuthorService);
  private fb = inject(FormBuilder);
  private confirmation = inject(ConfirmationService);
  private environmentService = inject(EnvironmentService);

  // We use `rxResource` for read-only API data so Angular owns loading, caching, and reactivity.
  // Angular resource guide: https://angular.dev/api/core/rxjs-interop/rxResource#api
  private readonly listQuery = toSignal(this.list.query$, {
    initialValue: { skipCount: 0, maxResultCount: 10, sorting: '' },
    injector: this.injector,
  });

  private readonly authorResource = rxResource<
    PagedResultDto<AuthorDto>,
    { skipCount: number; maxResultCount: number; sorting: string }
  >({
    params: () => this.listQuery(),
    stream: ({ params }) => this.authorService.getList(params as any),
    defaultValue: { items: [], totalCount: 0 },
    injector: this.injector,
  });

  author = signal<PagedResultDto<AuthorDto>>({ items: [], totalCount: 0 });
  selectedAuthor = signal<AuthorDto | undefined>(undefined);
  form = signal<FormGroup>(new FormGroup({}));
  isModalOpen = signal(false);

  constructor() {
    effect(() => {
      const snapshot = this.authorResource.snapshot();
      if (snapshot.status === 'resolved' || snapshot.status === 'local') {
        this.author.set(snapshot.value);
      }
    });
  }

  createAuthor() {
    this.selectedAuthor.set(undefined);
    this.buildForm();
    this.isModalOpen.set(true);
  }

  editAuthor(id: string) {
    this.authorService.get(id).subscribe(author => {
      this.selectedAuthor.set(author);
      this.buildForm();
      this.isModalOpen.set(true);
    });
  }

  delete(id: string) {
    this.confirmation.warn('::AreYouSureToDelete', '::AreYouSure').subscribe(status => {
      if (status === Confirmation.Status.confirm) {
        this.authorService.delete(id).subscribe(() => this.list.get());
      }
    });
  }

  exportToExcel() {
    const apiUrl = this.environmentService.getApiUrl('default');
    this.authorService.getDownloadToken().subscribe(result => {
      const token = encodeURIComponent(result.token || '');
      window.location.href = `${apiUrl}/api/app/author/as-excel-file?downloadToken=${token}`;
    });
  }

  buildForm() {
    const selectedAuthor = this.selectedAuthor();
    const birthDate = selectedAuthor?.birthDate;
    this.form.set(
      this.fb.group({
        name: [selectedAuthor?.name || '', Validators.required],
        birthDate: [birthDate ? this.parseDate(birthDate) : null, Validators.required],
        shortBio: [selectedAuthor?.shortBio || ''],
      }),
    );
  }

  save() {
    const form = this.form();
    if (!form || form.invalid) {
      return;
    }

    const formValue = form.value;
    const requestData = { ...formValue, birthDate: this.formatDate(formValue.birthDate) };
    let request = this.authorService.create(requestData);
    const selectedAuthor = this.selectedAuthor();
    if (selectedAuthor?.id) {
      request = this.authorService.update(selectedAuthor.id, requestData);
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
