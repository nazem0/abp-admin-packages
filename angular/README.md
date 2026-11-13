# ABP Admin - Angular Application

This is an Angular application built on the ABP Framework. For more information, visit [abp.io](https://abp.io/).

## Pre-requirements

* [Node.js v20 or later](https://nodejs.org/)
* [pnpm](https://pnpm.io/)

## Getting Started

### Install dependencies

```bash
pnpm install
```

### Install ABP client-side libraries

If you haven't already, run the following command from the solution root folder:

```bash
abp install-libs
```

### Start the backend

Before running the Angular application, make sure your backend API is running. Start the `AbpAdmin` application.

## Development server

Run `ng serve` or `pnpm start` for a dev server. Navigate to `http://localhost:4200/`. The app will automatically reload if you change any of the source files.

## ABP CLI Commands

### Generate Proxy

Generate TypeScript proxies for your backend APIs:

With the backend running:

```bash
pnpm generate-proxy   # modules `app` and `settingManagement` from https://localhost:44366
```

Our own app services (e.g. `AuditLogAppService`) are exposed under module `app`. The free ABP
AuditLogging/OpenIddict modules ship no HTTP API, so their endpoints exist only because we wrap
their repositories in our own app services. Mark always-present output DTO members `[Required]`
so the generated TypeScript types are non-optional.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

For a production build:

```bash
ng build --configuration production
```

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice.

## Environment Configuration

### Development Environment

The development environment configuration is located in `src/environments/environment.ts`. Update the `apiUrl` to point to your backend API.

### Production Environment

For production, the application uses dynamic environment configuration through the `dynamic-env.json` file. This allows you to configure the environment variables at deployment time without rebuilding the application.

See [Environment](https://abp.io/docs/latest/framework/ui/angular/environment) for more information.

## Additional Resources

* [ABP Angular UI Documentation](https://abp.io/docs/latest/framework/ui/angular/overview)
* [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli)
