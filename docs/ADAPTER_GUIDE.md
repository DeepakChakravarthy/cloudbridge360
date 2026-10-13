# Source, Destination, and Orchestration Adapter Guide

This project is structured so the transport layer and migration workflow are not hardcoded to OneDrive and Google Photos. The implementation follows a lightweight adapter model that separates:

- source adapters: where media is discovered and read
- destination adapters: where media is uploaded and imported
- orchestration: how a migration job is scheduled, tracked, and recovered

## 1. Core idea

A provider follows a shared contract with a predictable shape:

- auth configuration
- token exchange and refresh logic
- account/profile retrieval
- scan and streaming behavior for source providers
- upload and import behavior for destination providers

The registry in `src/config/providers.js` gives every provider a common API surface. This keeps provider-specific behavior isolated and makes future extensions low-risk.

## 2. Adding a new source adapter

A source adapter should implement the minimum contract needed to:

1. authenticate the user
2. list media files
3. stream file bytes safely
4. identify files and metadata reliably

### Example addition

```js
registerProvider("dropbox", {
  auth: "https://www.dropbox.com/oauth2/authorize",
  token: "https://api.dropboxapi.com/oauth2/token",
  scope: "files.content.read files.metadata.read",
  client: () => process.env.DROPBOX_CLIENT_ID,
  secret: () => process.env.DROPBOX_CLIENT_SECRET,
  authParams: ({ state, redirectUri, scope, clientId }) => ({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope,
  }),
  tokenParams: ({ code, redirectUri, clientId, clientSecret }) => ({
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
  }),
  accountProfile: async (accessToken) => {
    const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.json();
  },
  mapAccount: (profile) => ({
    id: profile.account_id,
    name: profile.name.display_name,
  }),
});
```

Then implement a source-specific scan routine that returns the same normalized file model used by the migration flow:

```js
{
  id: "unique-source-file-id",
  name: "image.jpg",
  size: 2048000,
  mime: "image/jpeg",
  etag: "hash-or-version"
}
```

The orchestration engine should not care whether the source is Microsoft, Dropbox, or another cloud store. It only consumes this normalized object.

## 3. Adding a new destination adapter

A destination adapter is responsible for:

1. validating upload permissions
2. creating upload sessions or resumable uploads
3. finalizing the imported item
4. returning a stable destination identifier

The existing Google Photos flow already follows this separation. The adapter contract is intentionally generic, which means you can add another destination like Amazon Photos, Flickr, or a custom object store without rewriting the whole migration pipeline.

## 4. Preserving architecture safety

To keep the design scalable and safe:

- keep provider config in `src/config/providers.js`
- keep OAuth logic in routes, not in the orchestration layer
- keep migration state in a central store
- keep provider-specific operations behind adapter boundaries
- never hardcode provider assumptions into the core scheduler

## 5. Why this stays scalable

The migration core only knows about:

- a source provider
- a destination provider
- a list of normalized files
- a job lifecycle with success, retry, skip, and failure states

Because the provider details are isolated behind registry and adapter contracts, you can extend the platform without breaking the scheduler or the trust boundaries.

## 6. Recommended next step

When adding a provider, start with these three checks:

1. does the provider expose OAuth and refresh-token flows?
2. can it list media files with stable IDs and metadata?
3. can it accept resumable or chunked uploads with safe retries?

If the answer is yes to all three, it can fit the existing architecture with minimal risk.
