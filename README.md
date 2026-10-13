# ☁️ CloudBridge360

### Secure, Modular & Reliable Cloud Media Migration

**Move your memories across cloud platforms with confidence.**

![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-Backend-000000?style=for-the-badge&logo=express&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Microsoft OneDrive](https://img.shields.io/badge/OneDrive-Source-0078D4?style=for-the-badge&logo=microsoftonedrive&logoColor=white)
![Google Photos](https://img.shields.io/badge/Google_Photos-Destination-4285F4?style=for-the-badge&logo=googlephotos&logoColor=white)

![Project Status](https://img.shields.io/badge/Status-Active_Development-blue?style=flat-square)
![Portfolio Project](https://img.shields.io/badge/Project-Personal_Portfolio-purple?style=flat-square)
![OAuth 2.0](https://img.shields.io/badge/Authentication-OAuth_2.0-green?style=flat-square)
![Deployment](https://img.shields.io/badge/Deployment-Local_First-orange?style=flat-square)
![Contributions Welcome](https://img.shields.io/badge/Contributions-Welcome-brightgreen?style=flat-square)
![GitHub Stars](https://img.shields.io/github/stars/DeepakChakravarthy/CloudBridge360?style=flat-square&logo=github)
![GitHub Issues](https://img.shields.io/github/issues/DeepakChakravarthy/CloudBridge360?style=flat-square&logo=github)
![Last Commit](https://img.shields.io/github/last-commit/DeepakChakravarthy/CloudBridge360?style=flat-square&logo=github)
![Repository Size](https://img.shields.io/github/repo-size/DeepakChakravarthy/CloudBridge360?style=flat-square&logo=github)

---

## 🌟 Overview

**CloudBridge360** is a local-first cloud media migration application designed to transfer photos and videos from Microsoft OneDrive to Google Photos.

The application combines OAuth-based authentication, media discovery, resumable upload handling, retry mechanisms, live progress tracking, and detailed migration reports.

Built with a modular, adapter-based architecture, CloudBridge360 is designed to support additional cloud providers in the future without requiring major changes to the migration engine.

> **Project vision:** Make cloud-to-cloud media migration simpler, more transparent, and more reliable.

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔐 OAuth 2.0 Authentication | Connect Microsoft and Google accounts using provider authorization flows |
| ☁️ Cloud Media Migration | Transfer photos and videos from OneDrive to Google Photos |
| 🔍 Media Discovery | Scan and identify eligible media files |
| 📊 Live Progress Tracking | Monitor migration status and individual file outcomes |
| 🔄 Retry Handling | Retry transient network and API failures |
| ⏯️ Resumable Processing | Support recovery and continuation of interrupted transfers |
| 📁 CSV Reporting | Export migration results for review and auditing |
| ⚡ Adaptive Throughput | Adjust concurrency based on transfer outcomes |
| 🧩 Provider Registry | Extend the platform with additional source and destination adapters |
| 🛡️ Security Middleware | Apply access restrictions, security headers, and rate limiting |

## 🏗️ System Architecture

CloudBridge360 follows a modular architecture with clear separation of responsibilities.

```text
                 CloudBridge360
                       |
                Web Dashboard
                       |
                 Express API
                       |
          +------------+------------+
          |                         |
     OAuth Service            Migration Engine
          |                         |
    +-----+-----+          +--------+--------+
    |           |          |                 |
 Microsoft    Google   Source Adapter   Destination Adapter
    OAuth      OAuth        |                 |
                         OneDrive         Google Photos
                              \             /
                               \           /
                             Transfer Pipeline
                                    |
                         +----------+----------+
                         |          |          |
                       Retry     Progress   Throughput
                       Logic     Tracking   Controller
                         |          |          |
                         +----------+----------+
                                    |
                              State Store
                                    |
                            Reports / CSV
```

### Architecture Principles

- **Separation of concerns:** Authentication, provider integration, orchestration, and persistence are independently organized.
- **Extensibility:** New cloud providers can be integrated through adapters.
- **Resilience:** Retry handling and resumable processing help recover from interruptions.
- **Observability:** Job tracking and reporting provide visibility into migration outcomes.
- **Security:** Sensitive configuration is managed through environment variables and security middleware.

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| Backend | Express.js |
| Language | JavaScript |
| Authentication | OAuth 2.0, express-session |
| Security | Helmet, express-rate-limit |
| Configuration | dotenv |
| State Persistence | Local JSON |
| Frontend | HTML, CSS, JavaScript |
| Testing | Node.js test suite |
| Deployment | Local Node.js runtime, Vercel-compatible entry point |

## 📂 Project Structure

```text
cloudbridge360/
├── api/
│   └── index.js
├── docs/
│   ├── ADAPTER_GUIDE.md
│   └── DEPLOYMENT.md
├── public/
│   └── index.html
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config/
│   │   ├── env.js
│   │   └── providers.js
│   ├── data/
│   │   └── stateStore.js
│   ├── middleware/
│   │   ├── localOnly.js
│   │   └── security.js
│   ├── routes/
│   │   ├── api.routes.js
│   │   ├── auth.routes.js
│   │   └── callback.routes.js
│   ├── services/
│   │   ├── migrationService.js
│   │   └── throughputController.js
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

## 🚀 Getting Started

### Prerequisites

Before running CloudBridge360, ensure you have:

- Node.js 20 or later
- npm
- A Microsoft account
- A Google account
- Microsoft Entra application credentials
- Google Cloud OAuth credentials

### 1. Clone the Repository

```bash
git clone https://github.com/DeepakChakravarthy/CloudBridge360.git
cd CloudBridge360
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a local environment file:

```bash
cp .env.example .env
```

Configure the required values:

```dotenv
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

SESSION_SECRET=your_strong_random_session_secret

APP_BASE_URL=http://localhost:3000
PORT=3000
```

**Security:** Never commit your `.env` file, OAuth client secrets, access tokens, or refresh tokens to GitHub.

### 4. Configure OAuth Redirect URIs

Register the following callback URLs with the corresponding providers.

**Microsoft**

```text
http://localhost:3000/callback/microsoft
```

**Google**

```text
http://localhost:3000/callback/google
```

The callback URLs must match the redirect URIs configured in the provider consoles.

### 5. Run the Application

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 🔄 Migration Workflow

```text
1. Launch CloudBridge360
             ↓
2. Connect Microsoft OneDrive
             ↓
3. Connect Google Photos
             ↓
4. Discover Eligible Media
             ↓
5. Start Migration
             ↓
6. Monitor Live Progress
             ↓
7. Retry Recoverable Failures
             ↓
8. Review Migration Summary
             ↓
9. Export CSV Report
```

Migration results are tracked to help distinguish completed, skipped, failed, and pending files.

## 🛡️ Security Considerations

CloudBridge360 includes multiple security-oriented design decisions:

- OAuth-based provider authorization
- Environment-based secret configuration
- Session cookie security settings
- HTTP security headers through Helmet
- Rate limiting for authentication and API endpoints
- Local-only access restrictions for sensitive routes
- Error handling designed to avoid exposing sensitive details
- Separation between provider integrations and migration orchestration

**Important:** These controls do not constitute a formal security audit. Production deployment requires additional validation of token storage, authorization, session persistence, and operational security.

## ☁️ Deployment

CloudBridge360 includes a Vercel-compatible entry point at `api/index.js` and deployment routing through `vercel.json`.

For a hosted deployment, configure:

```dotenv
NODE_ENV=production
APP_BASE_URL=https://your-project.vercel.app

SESSION_SECRET=your_strong_random_secret

MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

**Production OAuth Redirect URLs**

```text
https://your-project.vercel.app/callback/microsoft
https://your-project.vercel.app/callback/google
```

### Deployment Limitation

The current architecture is optimized for local-first execution.

Long-running migration jobs, local JSON state, and in-memory sessions are not naturally suited to stateless serverless environments.

For production-scale migrations, consider:

- Persistent database storage
- Durable job queues
- Background workers
- Shared session storage
- Encrypted token persistence
- Centralized logging and monitoring

See [Deployment Guide](docs/DEPLOYMENT.md) for additional details.

## 🧩 Extending CloudBridge360

The provider registry and adapter architecture are designed to simplify future integrations.

Potential future source and destination integrations include:

![Google Drive](https://img.shields.io/badge/Google_Drive-Planned-4285F4?style=flat-square&logo=googledrive&logoColor=white)
![Dropbox](https://img.shields.io/badge/Dropbox-Planned-0061FF?style=flat-square&logo=dropbox&logoColor=white)
![Amazon S3](https://img.shields.io/badge/Amazon_S3-Planned-569A31?style=flat-square&logo=amazons3&logoColor=white)

For implementation details, see the [Adapter Guide](docs/ADAPTER_GUIDE.md).

## 🗺️ Roadmap

Potential improvements for upcoming releases:

- [ ] Add additional cloud storage providers
- [ ] Introduce persistent database-backed migration jobs
- [ ] Implement durable background processing
- [ ] Add scheduled migrations
- [ ] Improve duplicate detection
- [ ] Expand automated integration tests
- [ ] Add Docker deployment support
- [ ] Introduce migration history analytics
- [ ] Improve deployment scalability
- [ ] Add end-to-end encryption and token-storage hardening where applicable

## 🎯 Why I Built This Project

CloudBridge360 started as a personal engineering project to explore the challenges involved in transferring media between cloud platforms.

Instead of implementing a simple file-copy script, I wanted to explore how a migration system could be designed around modular integrations, fault tolerance, OAuth authentication, progress tracking, and operational visibility.

The project also serves as a practical demonstration of backend engineering, API integration, system design, and reliability-focused development.

## 🤝 Contributing

Suggestions, bug reports, and improvements are welcome.

If you would like to contribute:

1. Fork the repository.
2. Create a feature branch.
3. Implement and test your changes.
4. Open a pull request describing the improvement.

Please avoid submitting real OAuth credentials or sensitive migration data.

## 📜 License

This project is currently intended for personal, educational, and portfolio use.

No open-source license is granted unless a separate `LICENSE` file is added to the repository. Contributions should be discussed with the maintainer before submission.

## 👨‍💻 Author

**Deepak Chakravarthy**

Software Engineer | Full-Stack Development | Cloud & Backend Engineering

[![GitHub](https://img.shields.io/badge/GitHub-Profile-181717?style=for-the-badge&logo=github)](https://github.com/DeepakChakravarthy)


---

### ⭐ Support the Project

If you find CloudBridge360 interesting or useful, consider giving the repository a star.

**Built with curiosity, engineering discipline, and a passion for solving real-world problems. 🚀**
