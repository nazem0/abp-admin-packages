import { Rest, RestService } from '@abp/ng.core';
import { HttpRequest } from '@angular/common/http';
import { Injectable, Provider, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** The tenant a host admin is acting in on one screen; null = the host itself. */
@Injectable()
export class TenantScope {
  tenantId: string | null = null;
}

/** RestService that sends `__tenant` for the scope's tenant (ABP runs the request inside that tenant). */
@Injectable()
export class TenantScopedRestService extends RestService {
  private readonly scope = inject(TenantScope);

  override request<T, R>(request: HttpRequest<T> | Rest.Request<T>, config?: Rest.Config, api?: string): Observable<R> {
    const id = this.scope.tenantId;
    if (id && !(request instanceof HttpRequest)) request = { ...request, headers: { ...(request.headers as Record<string, string>), __tenant: id } };
    return super.request(request, config, api);
  }
}

/**
 * Component providers: the given proxy services (and everything they're used by inside this component, child
 * dialogs included) send their requests to `TenantScope.tenantId`. Proxies elsewhere in the app are untouched.
 */
export const provideTenantScope = (...proxies: Provider[]): Provider[] =>
  [TenantScope, { provide: RestService, useClass: TenantScopedRestService }, ...proxies];
