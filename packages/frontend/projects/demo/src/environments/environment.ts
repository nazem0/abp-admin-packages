import { Environment } from '@abp/ng.core';

// Local dev (ng serve on :4201) talks to the sample host on :44368. Anywhere else the demo is served by
// the sample host itself (under /app/), so the API and auth server are the page's own origin.
const local = location.port === '4201';
const baseUrl = local ? 'http://localhost:4201' : new URL('.', document.baseURI).href.replace(/\/$/, '');
const api = local ? 'https://localhost:44368' : location.origin;

const oAuthConfig = {
  issuer: `${api}/`,
  redirectUri: baseUrl,
  clientId: 'AbpAdmin_App',
  responseType: 'code',
  scope: 'offline_access AbpAdmin',
  requireHttps: api.startsWith('https:'),
};

export const environment = {
  production: !local,
  application: { baseUrl, name: 'ABP Admin demo' },
  oAuthConfig,
  apis: {
    // ABP Admin's proxies use apiName "AbpAdmin"; without an entry they fall back to "default".
    default: { url: api, rootNamespace: 'AbpAdmin.Host' },
    AbpAccountPublic: { url: oAuthConfig.issuer, rootNamespace: 'AbpAccountPublic' },
  },
} as Environment;
