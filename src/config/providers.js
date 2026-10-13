import { appConfig } from "./env.js";

const defaultProviderConfig = {
  name: "",
  auth: "",
  token: "",
  scope: "",
  client: () => undefined,
  secret: () => undefined,
  authParams: ({ provider, state, redirectUri, scope, clientId }) => ({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
    prompt: provider === "google" ? "consent" : "select_account",
    ...(provider === "google" ? { access_type: "offline" } : {}),
  }),
  tokenParams: ({ code, redirectUri, clientId, clientSecret }) => ({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }),
  refreshTokenParams: ({ refreshToken, clientId, clientSecret, scope }) => ({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    ...(scope ? { scope } : {}),
  }),
  accountProfile: async () => ({ id: "connected-account", name: "Connected account" }),
  mapAccount: (profile) => ({
    id: profile?.id ?? profile?.user_id ?? profile?.account_id ?? "connected-account",
    name: profile?.name ?? profile?.display_name ?? profile?.userPrincipalName ?? profile?.email ?? "Connected account",
  }),
};

export const providers = {};

function normalizeProvider(providerName, config = {}) {
  return {
    ...defaultProviderConfig,
    ...config,
    name: providerName,
    scope: config.scope || "",
    client: config.client || (() => undefined),
    secret: config.secret || (() => undefined),
  };
}

export function registerProvider(providerName, config = {}) {
  if (!providerName) {
    throw new Error("Provider name is required");
  }

  providers[providerName] = normalizeProvider(providerName, config);
  return providers[providerName];
}

export function redirectFor(provider) {
  return `${appConfig.baseUrl}/callback/${provider}`;
}

export function getProviderConfig(provider) {
  return providers[provider];
}

export function buildAuthUrl(provider, stateValue) {
  const config = getProviderConfig(provider);
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  if (!config.auth) {
    throw new Error(`Missing auth URL for provider: ${provider}`);
  }

  const authUrl = new URL(config.auth);
  const clientId = config.client();
  const params = config.authParams({
    provider,
    state: stateValue,
    redirectUri: redirectFor(provider),
    scope: config.scope,
    clientId,
  });

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      authUrl.searchParams.set(key, String(value));
    }
  }

  return authUrl.toString();
}

export function buildTokenPayload(provider, code) {
  const config = getProviderConfig(provider);
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return config.tokenParams({
    code,
    redirectUri: redirectFor(provider),
    clientId: config.client(),
    clientSecret: config.secret() || "",
  });
}

export function getAccountRecord(provider, profile) {
  const config = getProviderConfig(provider);
  if (!config) {
    return { id: provider, name: "Connected account" };
  }

  return config.mapAccount(profile);
}

registerProvider("microsoft", {
  auth: "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
  token: "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
  scope: "offline_access Files.Read User.Read",
  client: () => process.env.MICROSOFT_CLIENT_ID,
  secret: () => process.env.MICROSOFT_CLIENT_SECRET,
  authParams: ({ state, redirectUri, scope, clientId }) => ({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
    prompt: "select_account",
  }),
  accountProfile: async (accessToken) => {
    const response = await fetch(
      "https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Microsoft profile lookup failed: ${text.slice(0, 250)}`);
    }

    return response.json();
  },
  mapAccount: (profile) => ({
    id: profile.id,
    name: profile.userPrincipalName || profile.displayName,
  }),
});

registerProvider("google", {
  auth: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  scope: "https://www.googleapis.com/auth/photoslibrary.appendonly",
  client: () => process.env.GOOGLE_CLIENT_ID,
  secret: () => process.env.GOOGLE_CLIENT_SECRET,
  authParams: ({ state, redirectUri, scope, clientId }) => ({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
    access_type: "offline",
    prompt: "consent",
  }),
  accountProfile: async () => ({
    id: "local-google-account",
    name: "Connected Google Photos account",
  }),
  mapAccount: (profile) => ({
    id: profile.id,
    name: profile.name,
  }),
});
