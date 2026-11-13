import { provideAbpCore, withOptions } from '@abp/ng.core';
import { provideAbpOAuth } from '@abp/ng.oauth';
import { registerLocaleForEsBuild } from '@abp/ng.core/locale';
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { environment } from '../environments/environment';
import { APP_ROUTES } from './app.routes';

// Headless: only ABP core (auth, config, permissions, REST/proxies). All UI is ours.
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(APP_ROUTES, withComponentInputBinding()),
    provideAbpCore(withOptions({ environment, registerLocaleFn: registerLocaleForEsBuild() })),
    provideAbpOAuth(),
  ],
};
