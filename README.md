# Spokane Markets

Discover local markets, craft fairs, and vendor events across Spokane.

Public-facing social updates use the **Spokane Markets** Facebook business page. Vendor and coordinator discussion (calls, onboarding context, etc.) lives in the private Facebook group **Spokane Markets - Vendors & Coordinators**.

Spokane Markets is a Next.js application with role-based workflows for admins, organizers, vendors, and shoppers. It includes event discovery, market and venue management, moderation workflows, newsletter/digest tooling, and production deployment via Docker + GitHub Actions.

## Highlights

- Public discovery pages for events, markets, and vendors
- Admin dashboard for CRUD, moderation queues, and site settings
- Organizer and vendor role workflows
- Neighborhood-based filtering and subscription preferences
- Background jobs for digest emails, alerts, and DB backups
- Containerized production deploy with GHCR and SSH rollout

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- PostgreSQL + Prisma
- Better Auth
- Tailwind CSS
- Vitest + ESLint
- Docker Compose + Caddy + GitHub Actions

## Requirements

- Node.js 20.19+ / 22.12+ / 24+ / 25 (Prisma 7.6+; use `.nvmrc` for the team default)
- npm 10+
- Docker + Docker Compose v2

## Local Setup (Recommended: Docker Dev Stack)

This is the fastest path to get a stable local environment for change testing.

1. Create environment file:

```bash
cp .env.example .env.local
```

2. Start local stack:

```bash
npm run dev:local:up
```

This starts:

- `db` (PostgreSQL)
- `init` (runs `prisma migrate deploy`)
- `web` (Next.js with hot reload at `http://localhost:3000`)

3. (Optional) Seed local DB:

```bash
npm run dev:local:seed
```

4. Stop stack:

```bash
npm run dev:local:down
```

5. Full reset (drop DB volume):

```bash
npm run dev:local:reset
```

## Local Setup (Host Next.js + Docker DB)

Use this mode when you specifically want Node running on your machine.

1. Install dependencies:

```bash
npm ci
```

2. Create environment file:

```bash
cp .env.example .env.local
```

3. Update `DATABASE_URL` in `.env.local` for host networking:

```env
DATABASE_URL=postgresql://postgres:changeme@localhost:5432/spokane_markets?schema=public
```

4. Start local database:

```bash
npm run db:up
```

5. Apply migrations and seed:

```bash
npx prisma migrate deploy
npx prisma db seed
```

6. Start app:

```bash
npm run dev
```

App runs at `http://localhost:3000`.

## Useful Scripts

- `npm run dev` - start local app
- `npm run dev:local:up` - start local dev stack (db/init/web)
- `npm run dev:local:down` - stop local dev stack
- `npm run dev:local:reset` - stop stack and remove volumes
- `npm run dev:local:migrate` - run Prisma migrations in local stack
- `npm run dev:local:seed` - seed database in local stack
- `npm run build` - production build
- `npm run start` - run production build
- `npm run lint` - run ESLint
- `npm run test` - run unit tests
- `npm run db:up` - start PostgreSQL compose stack
- `npm run db:seed` - seed database

## Feature flags (organizer onboarding rollout)

Optional environment variables (see also `src/lib/feature-flags.ts`):

| Variable | Effect |
| -------- | ------ |
| `NEXT_PUBLIC_VENDOR_DUAL_WORKFLOW=true` | Enables **BOTH** vendor workflow mode on events/markets (intent + official application UI when participation allows). Default off → behaves as intent-first only. |
| `NEXT_PUBLIC_ORGANIZER_ONBOARDING_DISPLAY=true` | Shows shopper/vendor onboarding fields on public event and market pages (e.g. short description, vendor-only logistics block). |
| `ADMIN_LISTING_EVIDENCE=true` | Enables admin APIs `GET/POST /api/admin/listings/evidence` and `GET/POST /api/admin/listings/moderation-notes`. |

## Deployment

Production deployment guide:

- [`docs/DEPLOY.md`](docs/DEPLOY.md)

Admin and operations guide:

- [`docs/ADMIN-GUIDE.md`](docs/ADMIN-GUIDE.md)

## Documentation

- [`docs/Home.md`](docs/Home.md) - docs index
- [`docs/wiki/`](docs/wiki/) - wiki-ready documentation pages

## Analytics Events

Canonical Umami events for the onboarding/moderation workflows:

- `vendor_profile_edit`
- `vendor_profile_publish`
- `vendor_verification_request_submitted`
- `vendor_verification_request_error`
- `vendor_verification_requirement_unmet`
- `organizer_market_created`
- `organizer_market_create_error`
- `vendor_onboarding_checklist_view`
- `vendor_onboarding_checklist_dismiss`
- `organizer_dashboard_view`
- `vendor_dashboard_view`

## Security

- Never commit real secrets or private keys
- Keep runtime secrets in `.env.local` (ignored by Git) and GitHub Actions secrets
- Use least-privilege tokens for deployment
