import { provideAbpCore, withOptions } from '@abp/ng.core';
import { provideAbpOAuth } from '@abp/ng.oauth';
import { registerLocaleForEsBuild } from '@abp/ng.core/locale';
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    // withComponentInputBinding: ABP Admin pages read deep-link query params (?user=, ?correlation=…) as inputs.
    provideRouter(routes, withComponentInputBinding()),
    provideAbpCore(withOptions({ environment, registerLocaleFn: registerLocaleForEsBuild() })),
    provideAbpOAuth(),
  ],
};
