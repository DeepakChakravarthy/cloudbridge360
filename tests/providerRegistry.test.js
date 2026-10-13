import test from 'node:test';
import assert from 'node:assert/strict';

import {
  providers,
  registerProvider,
  buildAuthUrl,
  buildTokenPayload,
  getProviderConfig,
} from '../src/config/providers.js';

test('provider registry exposes built-in providers and supports registration of a new external', () => {
  assert.ok(providers.microsoft);
  assert.ok(providers.google);

  registerProvider('dropbox', {
    auth: 'https://www.dropbox.com/oauth2/authorize',
    token: 'https://api.dropboxapi.com/oauth2/token',
    scope: 'files.content.read files.metadata.read',
    client: () => 'dropbox-client',
    secret: () => 'dropbox-secret',
    authParams: ({ state, redirectUri }) => ({
      response_type: 'code',
      state,
      redirect_uri: redirectUri,
      scope: 'files.content.read files.metadata.read',
    }),
    tokenParams: ({ code, redirectUri, clientId, clientSecret }) => ({
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
    }),
    accountProfile: async () => ({ account_id: 'db-123', display_name: 'Dropbox User' }),
    mapAccount: (profile) => ({ id: profile.account_id, name: profile.display_name }),
  });

  const config = getProviderConfig('dropbox');
  assert.equal(config.client(), 'dropbox-client');

  const authUrl = buildAuthUrl('dropbox', 'state-123');
  assert.match(authUrl, /state-123/);
  assert.match(authUrl, /dropbox\.com\/oauth2\/authorize/);

  const tokenPayload = buildTokenPayload('dropbox', 'auth-code');
  assert.equal(tokenPayload.grant_type, 'authorization_code');
  assert.equal(tokenPayload.code, 'auth-code');
});
