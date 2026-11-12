import { Environment } from '@abp/ng.core';

const baseUrl = 'http://localhost:4200';

const oAuthConfig = {
  issuer: 'https://localhost:44366/',
  redirectUri: baseUrl,
  clientId: 'Abp_Administration_App',
  responseType: 'code',
  scope: 'offline_access Abp_Administration',
  requireHttps: true,
};

export const environment = {
  production: true,
  application: {
    baseUrl,
    name: 'Abp_Administration',
  },
  oAuthConfig,
  apis: {
    default: {
      url: 'https://localhost:44366',
      rootNamespace: 'Abp_Administration',
    },
    AbpAccountPublic: {
      url: oAuthConfig.issuer,
      rootNamespace: 'AbpAccountPublic',
    },
  },
} as Environment;
