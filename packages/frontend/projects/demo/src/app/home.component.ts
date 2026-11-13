import { AuthService } from '@abp/ng.core';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Stands in for "your app": its own page, with a link into the mounted admin. */
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <main>
      <h1>Your application</h1>
      <p>This page belongs to the host app. ABP Admin is mounted under <code>/admin</code> from the <code>&#64;abp-admin/ng</code> package.</p>
      <a routerLink="/admin">Open ABP Admin →</a>
      @if (!auth.isAuthenticated) { <button (click)="auth.navigateToLogin()">Sign in</button> }
    </main>
  `,
  styles: `main { max-width: 640px; margin: 15vh auto; padding: 0 16px; line-height: 1.6; } a { font-weight: 600; } button { margin-left: 12px; }`,
})
export class HomeComponent {
  protected readonly auth = inject(AuthService);
}
