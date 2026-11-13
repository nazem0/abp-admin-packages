import { Environment } from '@abp/ng.core';

const baseUrl = 'http://localhost:4201';

const oAuthConfig = {
  issuer: 'https://localhost:44368/',
  redirectUri: baseUrl,
  clientId: 'AbpAdmin_App',
  responseType: 'code',
  scope: 'offline_access AbpAdmin',
  requireHttps: true,
};

export const environment = {
  production: false,
  application: { baseUrl, name: 'ABP Admin demo' },
  oAuthConfig,
  apis: {
    // ABP Admin's proxies use apiName "AbpAdmin"; without an entry they fall back to "default".
    default: { url: 'https://localhost:44368', rootNamespace: 'AbpAdmin.Host' },
    AbpAccountPublic: { url: oAuthConfig.issuer, rootNamespace: 'AbpAccountPublic' },
  },
} as Environment;
