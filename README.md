# Lead Automation Platform

A small lead qualification and routing prototype built around an Express API, PostgreSQL, Gemini-based AI scoring, optional GoHighLevel CRM syncing, and Slack notifications for high-priority leads.

This repository contains a working backend and a lightweight frontend for submitting and checking lead status. The project is best understood as a proof-of-concept workflow for lead intake, deduplication, AI qualification, and downstream actioning.

## Problem

Lead intake often happens through forms, webhooks, or external automation tools, but the information is usually noisy and inconsistent. Teams need a repeatable way to:

- accept leads from multiple sources,
- prevent duplicate processing,
- classify them quickly,
- send only the highest-value leads to sales, and
- keep CRM sync state traceable and retry-safe.

This project addresses that by adding a structured lead-processing pipeline with idempotency safeguards, AI-based qualification, and deterministic business rules.

## Architecture

The application is organized into a backend service, a React frontend, and optional workflow automation via n8n.

```mermaid
flowchart LR
    A[Lead Source / Frontend / n8n] --> B[Express API]
    B --> C[(PostgreSQL)]
    B --> D[Gemini AI Qualifier]
    B --> E[CRM Adapter]
    B --> F[Notification Provider]
    G[n8n Workflow] --> B
    H[React Frontend] --> B
```

### Runtime components

- Backend: Node.js + Express in [backend/index.js](backend/index.js)
- Data layer: Prisma ORM + PostgreSQL in [backend/prisma/schema.prisma](backend/prisma/schema.prisma)
- AI processing: Gemini via Google Generative AI in [backend/aiService.js](backend/aiService.js)
- CRM abstraction: [backend/crm/CRMService.js](backend/crm/CRMService.js)
- Notifications: [backend/notifications/NotificationService.js](backend/notifications/NotificationService.js)
- Authentication: [backend/auth/routes.js](backend/auth/routes.js) and [backend/auth/middleware.js](backend/auth/middleware.js)
- Frontend: React + Vite in [frontend/src/App.jsx](frontend/src/App.jsx)
- Workflow orchestration: [backend/n8n/lead-qualification.json](backend/n8n/lead-qualification.json)

## Workflow

The lead-processing flow is driven by the backend service, not by the frontend alone.

1. A lead is submitted through the web form or API webhook.
2. The backend validates the payload and applies deduplication rules.
3. If the lead is new, a record is created in PostgreSQL.
4. The backend starts asynchronous qualification in `qualifyLead()`.
5. AI generates a qualification result with priority, reason, summary, and follow-up message.
6. Deterministic business rules adjust the AI output and assign a CRM pipeline stage.
7. If priority is HIGH, a notification is sent.
8. The lead is synced to the CRM contact and pipeline stage.
9. The lead status is updated to `COMPLETED` or a retryable failure state.

The actual processing sequence in code is:

- AI qualification
- High-priority notification
- CRM contact creation/update
- CRM pipeline stage update

The processing loop supports retries by re-entering the pipeline at the failed step, rather than re-running everything.

## Tech Stack

### Backend

- Node.js
- Express
- Prisma ORM
- PostgreSQL
- Zod validation
- JWT-based auth
- Gemini API via `@google/generative-ai`
- Jest + Supertest for tests

### Frontend

- React
- Vite
- Browser-based polling for lead status

### Integrations

- GoHighLevel adapter (optional)
- Slack webhook provider (optional)
- n8n workflow automation

## API

The backend exposes both auth and lead endpoints.

### Authentication

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account and return JWT |
| POST | `/api/auth/login` | Authenticate and return JWT |
| GET | `/api/auth/me` | Fetch current user from token |

### Lead ingestion

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/leads/webhook` | Public lead webhook with rate limiting |
| POST | `/api/leads` | Authenticated lead submission |
| GET | `/api/leads/:leadId/qualification` | Fetch qualification status and AI result |

### Request payload

```json
{
  "name": "Jane High",
  "email": "jane@example.com",
  "company": "Acme",
  "message": "Interested in an enterprise plan",
  "idempotencyKey": "optional-stable-key"
}
```

### Response examples

```json
{
  "message": "Lead created successfully",
  "leadId": "7be89d7f-118c-4a0d-a5dd-977f1f9118fe"
}
```

```json
{
  "id": "7be89d7f-118c-4a0d-a5dd-977f1f9118fe",
  "priority": "HIGH",
  "aiReason": "Strong buying signal with enterprise context",
  "aiSummary": "Interested in an enterprise plan and likely qualifies for priority follow-up",
  "followUpMessage": "Thanks for reaching out. We can help with an enterprise solution.",
  "processingStatus": "COMPLETED",
  "aiProcessed": true,
  "notificationProcessed": true,
  "crmContactProcessed": true,
  "crmStageProcessed": true
}
```

## PostgreSQL schema

The database schema is defined in [backend/prisma/schema.prisma](backend/prisma/schema.prisma). The key models are:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  leads     Lead[]
}

model Lead {
  id                  String   @id @default(uuid())
  name                String
  email               String
  company             String?
  message             String?
  priority            String?
  aiReason            String?
  aiSummary           String?
  followUpMessage     String?
  crmContactId        String?
  crmStage            String?
  idempotencyKey      String?  @unique
  processingStatus    String   @default("PENDING")
  lastError           String?
  lastErrorType       String?
  processingAttempts  Int      @default(0)
  aiProcessed         Boolean  @default(false)
  notificationProcessed Boolean @default(false)
  crmContactProcessed Boolean  @default(false)
  crmStageProcessed   Boolean  @default(false)
  userId              String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}

model AIInteraction {
  id             String   @id @default(uuid())
  leadId         String
  input          String
  output         String?
  status         String
  error          String?
  idempotencyKey String?  @unique
  createdAt      DateTime @default(now())
}
```

Important implementation notes:

- `Lead.idempotencyKey` is unique and used to suppress duplicate submissions.
- `Lead.processingStatus` can be `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, or `RETRYABLE_FAILURE`.
- `AIInteraction` records the per-lead AI request and status.

## AI output schema

The AI result is validated by a Zod schema in [backend/aiService.js](backend/aiService.js):

```js
const aiResponseSchema = z.object({
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  reason: z.string(),
  summary: z.string(),
  followUpMessage: z.string(),
  isSpam: z.boolean().optional().default(false),
  suggestedStage: z.string().optional()
});
```

Example AI payload:

```json
{
  "priority": "HIGH",
  "reason": "The lead is a strong enterprise fit and expresses immediate interest.",
  "summary": "Enterprise buyer with relevant intent and clear next-step demand.",
  "followUpMessage": "Thanks for reaching out. We can help with an enterprise solution.",
  "isSpam": false,
  "suggestedStage": "PRIORITY_QUEUE"
}
```

The backend then applies deterministic adjustments before storing the result.

## Deterministic business rules

The project intentionally includes a small set of fixed business rules to reduce AI unpredictability and keep lead handling consistent.

- Spam detection uses a keyword list: `viagra`, `seo services`, `buy crypto`, and `lottery`.
- If the AI marks a lead as spam or the lead message contains one of the spam keywords, the final priority is forced to `LOW`.
- Priority to CRM stage mapping:
  - `HIGH` -> `PRIORITY_QUEUE`
  - `MEDIUM` -> `QUALIFIED_QUEUE`
  - `LOW` -> `STANDARD_QUEUE`
- Notification sending only occurs when `lead.priority === 'HIGH'` and the notification step has not yet been processed.
- Low-priority spam leads skip CRM stage updates when the reason includes the word `spam`.

These rules are implemented in `applyBusinessRules()` inside [backend/aiService.js](backend/aiService.js).

## CRM adapter

The CRM layer is built around a single service with provider selection logic in [backend/crm/CRMService.js](backend/crm/CRMService.js).

### Supported providers

- `MockAdapter` — default when no real credentials are present.
- `GoHighLevelAdapter` — used when `CRM_PROVIDER` is set to `gohighlevel` or `ghl` and the required credentials are configured.

### Interface

```js
async createOrUpdateContact(lead)
async updatePipelineStage(contactId, priority)
```

### Runtime behavior

- If `GHL_API_KEY` and `GHL_LOCATION_ID` are missing or look like placeholders, the system falls back to the mock CRM adapter and logs a warning.
- This is intentional for local development and tests.
- The real GHL adapter performs a contact lookup, create/update, and then posts an opportunity/pipeline stage update using the configured stage IDs.

The actual implementations are in:

- [backend/crm/MockAdapter.js](backend/crm/MockAdapter.js)
- [backend/crm/GoHighLevelAdapter.js](backend/crm/GoHighLevelAdapter.js)

## n8n workflow

The workflow export is stored in [backend/n8n/lead-qualification.json](backend/n8n/lead-qualification.json). The workflow is designed to:

1. accept a lead via an n8n webhook,
2. POST the payload to the backend webhook,
3. poll the backend qualification endpoint,
4. decide whether to notify in Slack for HIGH-priority leads,
5. return a success or failure response.

The documentation for the workflow is in [backend/n8n/README.md](backend/n8n/README.md). The project does not implement a full n8n-native lead processor; it relies on the backend as the source of truth for qualification and state transitions.

## Environment variables

The service expects environment variables in the backend runtime. Use placeholder values in local development and real values only in a secure deployment environment.

```env
DATABASE_URL="postgresql://user:password@host:5432/lead_automation"
PORT=5000
NODE_ENV=development
JWT_SECRET="replace-with-secure-secret"
GEMINI_API_KEY="replace-with-api-key"
N8N_WEBHOOK_URL="http://localhost:5678/webhook/lead"
CRM_PROVIDER="mock"
GHL_API_KEY=""
GHL_LOCATION_ID=""
SLACK_WEBHOOK_URL=""
WEBHOOK_SECRET="replace-with-secret"
CORS_ORIGIN="http://localhost:5173"
WEBHOOK_RATE_LIMIT_WINDOW_MS=60000
WEBHOOK_RATE_LIMIT_MAX=60
```

Notes:

- `CRM_PROVIDER` is normally `mock` for local development.
- `SLACK_WEBHOOK_URL` enables real Slack notifications; without it, the app falls back to the mock notification provider.
- `GEMINI_API_KEY` is optional at runtime; if it is absent, the code falls back to mock qualification logic for local testing and lower-risk `no-key` behavior.

## Local setup

### 1. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2. Set up PostgreSQL

Create a database such as `lead_automation` and set `DATABASE_URL` in the backend environment.

### 3. Initialize Prisma

```bash
cd backend
npx prisma generate
npx prisma db push
```

If you want a migration-based flow instead, use:

```bash
npx prisma migrate dev --name init
```

### 4. Start backend

```bash
cd backend
npm start
```

### 5. Start frontend

```bash
cd frontend
npm run dev
```

### 6. Optional n8n workflow

- Import [backend/n8n/lead-qualification.json](backend/n8n/lead-qualification.json) into n8n.
- Configure `BACKEND_BASE_URL` and Slack credentials in the workflow.
- Validate that the production webhook URL is reachable.

## Testing

The backend includes a Jest suite for lead and retry behavior.

Run tests from the backend folder:

```bash
cd backend
npm test
```

The tests cover:

- invalid payload rejection,
- duplicate submission idempotency,
- AI malformed response handling,
- retry behavior after AI, CRM, and notification failures,
- high-priority notification behavior,
- low-priority spam handling.

See:

- [backend/tests/webhook.test.js](backend/tests/webhook.test.js)
- [backend/tests/qa-edge.test.js](backend/tests/qa-edge.test.js)

## Deployment

This project is structured as a simple multi-service deployment, not a single monolith build.

### Recommended deployment shape

- Backend: Node.js app on a managed host or container service
- Database: managed PostgreSQL instance
- Frontend: Vite static build served via a CDN or simple static host
- n8n: self-hosted or managed instance

### Deployment checklist

- Set all required environment variables in the production backend runtime.
- Configure a secure JWT secret.
- Ensure PostgreSQL is reachable by the backend.
- Set `CRM_PROVIDER` and credentials only if CRM syncing is required.
- Set `SLACK_WEBHOOK_URL` or configure n8n Slack credentials when using notifications.
- Verify CORS settings for the frontend domain.

The repository does not include container templates or a production deployment manifest.

## Error handling

The backend uses a small custom error model in [backend/errors.js](backend/errors.js):

- `AppError` carries message, code, retryable, status, and cause.
- `externalError()` converts provider failures into app-level errors with retry metadata.

Failure modes include:

- invalid request payloads (400),
- auth problems (401),
- rate limiting (429),
- AI provider/response issues (retryable, often 502),
- CRM and notification provider failures,
- database or internal server errors (500).

The lead processing pipeline records failures on the lead row by setting:

- `processingStatus`
- `lastError`
- `lastErrorType`

This allows partial progress to be resumed safely.

## Idempotency

Idempotency is implemented in the lead creation flow in [backend/leads/processLead.js](backend/leads/processLead.js).

Behavior:

- If an `idempotencyKey` is supplied, the system attempts to find an existing row by that key.
- If the same email was recently submitted without an explicit idempotency key, the system checks for a recent same-email lead and suppresses duplication.
- Duplicate records return the existing lead id instead of creating another lead record.
- Retry logic respects processing state and avoids re-running already completed tasks unnecessarily.

This is a practical safety mechanism for webhook retries and duplicate submissions, but it is not a full distributed idempotency system across multiple backend instances.

## Assumptions

- The project assumes a single backend application instance for most local and test scenarios.
- The AI prompt is intentionally simple and not wrapped in a full prompt-management layer.
- CRM integrations are treated as optional and may fall back to mock behavior.
- Slack notifications are only considered for HIGH-priority leads.
- The backend is the source of truth for lead state and retry safety.
- PostgreSQL is available and reachable in the local or deployment environment.

## Limitations

This repository is intentionally limited and does not include:

- full role-based access control,
- multi-tenant isolation,
- analytics dashboards,
- advanced CRM lifecycle management,
- queue workers or message brokers,
- production-grade observability and alerting,
- advanced prompt evaluation or model governance,
- full webhook signature verification beyond the current rate-limited implementation.

The code is designed as a working prototype and should be hardened before production use.

## Tradeoffs

### Chosen design

- The backend owns the lead-processing lifecycle instead of relying only on n8n workers.
- Business rules are deterministic and explicit rather than hidden in a complex AI policy layer.
- The CRM abstraction keeps local development easy and allows optional production integration.
- The project favors clarity and minimal moving parts over a heavier event-driven architecture.

### Tradeoff implications

- Simpler architecture means easier debugging and local development.
- The implementation is not optimized for very high-scale throughput or multi-region processing.
- Real provider calls are still subject to latency and external dependency failures.
- The AI output is constrained by a simple JSON schema and a small prompt, which keeps behavior predictable but limits deep qualification logic.

## Summary

This project is a pragmatic lead-automation prototype: it ingests leads, deduplicates them, qualifies them with a lightweight AI step, applies business rules, syncs them to a CRM adapter, and alerts the team for the highest-priority opportunities. It is a solid foundation for a more complete commercial workflow, but it does not claim to be a full production sales automation platform.
