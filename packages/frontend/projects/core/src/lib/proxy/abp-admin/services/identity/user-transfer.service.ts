import type { UserImportResultDto } from './models';
import { RestService, Rest } from '@abp/ng.core';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UserTransferService {
  private restService = inject(RestService);
  apiName = 'AbpAdmin';

  export = (config?: Partial<Rest.Config>) =>
    this.restService.request<any, Blob>({
      method: 'GET',
      url: '/api/abp-admin/user-transfer/export',
      responseType: 'blob',
    },
      { apiName: this.apiName,...config });

  import = (file: FormData, config?: Partial<Rest.Config>) =>
    this.restService.request<any, UserImportResultDto>({
      method: 'POST',
      headers: { Accept: 'application/json' },
      url: '/api/abp-admin/user-transfer/import',
      body: file,
    },
      { apiName: this.apiName,...config });
}
