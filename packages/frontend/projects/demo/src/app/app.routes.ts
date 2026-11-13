import { Routes } from '@angular/router';
import { HomeComponent } from './home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  // The whole admin UI, mounted under /admin, from the @nazem0/abp-admin-ng package.
  { path: 'admin', loadChildren: () => import('@nazem0/abp-admin-ng').then(m => m.ABP_ADMIN_ROUTES) },
];
