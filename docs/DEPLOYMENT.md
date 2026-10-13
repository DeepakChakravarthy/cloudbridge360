# Deployment Guide

This project is designed to run both locally and in a hosted environment, with Vercel as a deployment option for the API shell and frontend.

## Local development

1. Copy `.env.example` to `.env`.
2. Fill in your OAuth credentials and a secure `SESSION_SECRET`.
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm run dev
```

5. Open:

```text
http://localhost:3000
```

## Vercel deployment

This repository includes a Vercel-ready serverless wrapper in `api/index.js` and configuration in `vercel.json`.

### Required environment variables in Vercel

Set these in the Vercel project dashboard:

- `NODE_ENV=production`
- `PORT=3000`
- `APP_BASE_URL=https://your-vercel-domain.vercel.app`
- `SESSION_SECRET=your-long-random-secret`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### OAuth redirect URLs

Add the following redirect URLs in your provider dashboards:

- Microsoft: `https://your-vercel-domain.vercel.app/callback/microsoft`
- Google: `https://your-vercel-domain.vercel.app/callback/google`

### Important note

This application keeps state in a local JSON store and uses long-lived OAuth tokens. Vercel is suitable for hosting the API shell and UI, but it is not the best choice for heavy, long-running migration jobs that need persistent local storage and stable concurrency.

For production media-migration workloads, the safer approach is:

- Vercel for the frontend and lightweight API shell
- a dedicated Node host (VM, Azure App Service, Render, or similar) for the real migration engine
- external persistent storage for state and job metadata
- encrypted secret management, not `.env` on a shared disk

## Security checklist

- never commit `.env` files
- use Vercel environment variables, not hardcoded credentials
- store tokens in encrypted or protected state storage
- restrict OAuth scope to what is required
- use HTTPS everywhere
- review provider-level API permissions before production rollout

## Recommended production pattern

For a real commercial deployment, keep the architecture split like this:

- web frontend hosted on Vercel
- secure migration worker hosted on a dedicated server
- queue and persistent state outside the function runtime
- structured logging, retries, and dead-letter handling

This keeps the project scalable without compromising safety.
