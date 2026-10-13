# CloudBridge360

CloudBridge360 is a secure media migration platform for moving photos and videos from cloud storage sources to Google Photos while preserving a clear audit trail, retries, and live progress. The project is designed with a modular architecture so future providers can be added with minimal refactoring.

## Overview

This system currently focuses on a local-first workflow for migrating media from Microsoft OneDrive into Google Photos. The application includes:

- OAuth-based provider connection flow
- provider registry for future integrations
- media scanning and file discovery
- resumable upload handling and retry logic
- job tracking, reporting, and CSV export
- adaptive throughput control for safer large-file processing
- security layers for local-only access and hardening

## Why this architecture matters

The project is intentionally structured to separate:

- source adapters
- destination adapters
- orchestration logic
- runtime configuration
- security middleware
- state persistence

This keeps the workflow easier to extend, easier to test, and safer to operate as the system grows.

## Project structure

```text
cloudbridge360/
├── api/
│   └── index.js                  # Vercel serverless entry
├── docs/
│   ├── ADAPTER_GUIDE.md          # Provider-extension guide
│   └── DEPLOYMENT.md            # Local + Vercel deployment guide
├── public/
│   └── index.html                # Frontend dashboard
├── src/
│   ├── app.js                   # Express app assembly
│   ├── server.js                # Local runtime bootstrap
│   ├── config/
│   │   ├── env.js               # Environment config and validation
│   │   └── providers.js         # Generic provider registry
│   ├── data/
│   │   └── stateStore.js        # Local JSON job state
│   ├── middleware/
│   │   ├── localOnly.js         # Local access control
│   │   └── security.js          # Helmet + rate limits
│   ├── routes/
│   │   ├── api.routes.js        # Migration endpoints
│   │   ├── auth.routes.js       # OAuth entrypoints
│   │   └── callback.routes.js   # OAuth callback processing
│   ├── services/
│   │   ├── migrationService.js  # Orchestration and upload logic
│   │   └── throughputController.js # Adaptive concurrency tuning
│   └── utils/
│       ├── safeError.js
│       └── now.js
├── tests/
│   ├── providerRegistry.test.js
│   └── throughputController.test.js
├── .env.example
├── .gitignore
├── package.json
├── server.js
├── vercel.json
└── README.md
```

## Tech stack

- Node.js 20+
- Express.js
- express-session
- helmet
- express-rate-limit
- dotenv
- Vercel-ready serverless wrapper

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example file and populate the required values:

```bash
cp .env.example .env
```

Required values:

- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`

### 3. Configure provider redirect URIs

Use the local callback endpoints:

- Microsoft: `http://localhost:3000/callback/microsoft`
- Google: `http://localhost:3000/callback/google`

### 4. Start locally

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Vercel deployment

This project includes a Vercel-ready entry point at `api/index.js` and a serverless route in `vercel.json`.

### Required Vercel environment variables

- `NODE_ENV=production`
- `PORT=3000`
- `APP_BASE_URL=https://your-project.vercel.app`
- `SESSION_SECRET=your-strong-random-secret`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### OAuth redirect URLs for Vercel

- Microsoft: `https://your-project.vercel.app/callback/microsoft`
- Google: `https://your-project.vercel.app/callback/google`

> Important: this app is designed as a secure local-first migration platform. For heavy production migrations, a dedicated Node runtime with persistent state is safer than a pure serverless function environment.

## Security model

The project is intentionally built with a tighter risk posture:

- local-only access restrictions for sensitive endpoints
- secure session cookies
- security headers via Helmet
- rate limiting on auth and API routes
- no embedded credentials in code
- environment-based configuration
- provider registration instead of hardcoded integration logic

## Operational notes

- Media transfer jobs are tracked in local state files
- Retry logic is used for transient network and API errors
- Ambiguous states are flagged instead of silently auto-approving them
- The throughput controller adjusts concurrency based on real outcomes to reduce failure spikes

## Extending the system

The architecture supports plugging in new providers with minimal disruption. See:

- [docs/ADAPTER_GUIDE.md](docs/ADAPTER_GUIDE.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## License

This project is for personal or internal engineering use and should be reviewed before production deployment.

## Contact

For questions or extension support, update this section with your contact details or repository links.
