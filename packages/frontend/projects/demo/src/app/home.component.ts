import { AuthService, EnvironmentService } from '@abp/ng.core';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Stands in for "your app": its own page, with links into the mounted admin (Angular) and the Razor Pages version. */
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <main>
      <h1>Your application</h1>
      <p>This page belongs to the host app. ABP Admin is mounted under <code>/admin</code> from the <code>&#64;nazem0/abp-admin-ng</code> package.</p>
      <p><a routerLink="/admin">Open ABP Admin (Angular) →</a></p>
      <p><a [href]="razorUrl">Open ABP Admin (Razor Pages) →</a> <small>the same console as server-rendered pages, from the <code>AbpAdmin.Web</code> NuGet package</small></p>
      @if (!auth.isAuthenticated) { <button (click)="auth.navigateToLogin()">Sign in</button> }
    </main>
  `,
  styles: `main { max-width: 640px; margin: 15vh auto; padding: 0 16px; line-height: 1.6; } a { font-weight: 600; } small { display: block; color: #667085; }`,
})
export class HomeComponent {
  protected readonly auth = inject(AuthService);
  /** The Razor console lives on the API host. */
  protected readonly razorUrl = `${inject(EnvironmentService).getApiUrl('default')}/AbpAdmin/Overview`;
}
