# Workday

Workday is a daily planning and visibility platform for individuals and teams. It combines focused daily plans, supervisor visibility, comments, and a clear workflow for planning, execution, and review.

This repository includes the full product experience, multi-workspace support, organizations, plan-based entitlements, and a security-hardened API layer.

## What It Does

- Plan the day with tasks, time estimates, and scheduling.
- Track progress and reflections without micromanagement.
- Support supervisors who need visibility without direct edits.
- Separate work across personal and organization workspaces.
- Gate features and limits by subscription plan.

## Core Concepts

### Workspaces

- **Personal workspace**: created automatically on signup. Private by default.
- **Organization workspace**: created under an organization and visible to org roles.
- Users can belong to multiple workspaces. The active workspace controls scope.

### Organizations

- Create organizations and invite members by email.
- Org roles: owner, admin, supervisor, member.
- Organization workspaces can be created and managed by owners/admins.

### Plans and Tasks

- A plan is a day (YYYY-MM-DD) with a list of tasks and comments.
- Tasks can be planned or unplanned, estimated, scheduled, and commented on.
- Supervisors can review and comment but cannot edit others' tasks.

### Entitlements (Plans)

Entitlements combine **features** and **limits**:

- **Features**: enable/disable access (AI, due dates, timeline, kanban, future plans, integrations).
- **Limits**: maximums (orgs per user, workspaces per org, categories per workspace, org members, etc.).

Entitlements are enforced in both UI and API. When a limit is reached or a feature is locked:

- The UI shows an Upgrade badge.
- The API returns a 403 with `code=FEATURE_NOT_AVAILABLE` or `code=LIMIT_REACHED`.

## Feature Highlights

- **Daily planning**: create tasks, estimates, and schedule times.
- **Timeline**: drag tasks on a real time-mapped day view (plan gated).
- **Kanban**: scrollable multi-day view (plan gated).
- **Unplanned ideas**: collect tasks before assigning to a plan.
- **Comments**: per-plan and per-task discussion.
- **Reflections**: end-of-day review.
- **Supervisor view**: team plans with read-only details and comments.
- **Settings**: profile, workspaces, orgs, categories, AI, due dates.

## Access Model

- **Admin user**: global override for all features and limits.
- **Workspace role**: admin, supervisor, member.
- **Org role**: owner, admin, supervisor, member.

API endpoints verify membership and role for every mutation.

## Tech Stack

- Next.js 16 (App Router)
- Bun runtime
- SQLite via better-sqlite3
- TanStack React Query
- Tailwind CSS v4
- Zod for input validation

## Getting Started

### Install

```bash
bun install
bun run seed
```

### Run

```bash
bun dev
```

Open http://localhost:3000

### Demo Accounts

Seed data creates:

- admin@workday.local / password123 (admin)
- supervisor@workday.local / password123 (supervisor)
- member@workday.local / password123 (member)

### Environment Variables

Create `.env` (or `.env.local`) and include:

```env
AUTH_SECRET=your-secret-here
NODE_ENV=development
DATABASE_PATH=./data/workday.db
PORT=3000
```

See `.env.example` for defaults and notes.

## Admin Plan Management

Admins can edit plan features and limits in:

Settings -> Subscription -> Plan management

Changes immediately affect entitlements and API enforcement.

## Subscription Flow (Mock)

Users can pick a plan in:

Settings -> Subscription -> Manage plan

The UI simulates payment and updates the active plan.

## Security

Security controls built in:

- CSRF protection for state-changing requests
- Zod validation for API input
- Rate limiting on auth endpoints
- Secure cookies and strict headers
- Structured event logging

Details: `SECURITY.md`

## Common Commands

```bash
bun dev          # start dev server
bun run build    # build production
bun start        # start prod server
bun run lint     # lint
bun run seed     # seed demo data
```

## Deployment Notes

- Use HTTPS in production.
- Set a strong `AUTH_SECRET`.
- Back up `data/workday.db` regularly.

Example backup command:

```bash
sqlite3 data/workday.db ".backup backups/workday_$(date +%Y%m%d).db"
```

## Folder Map (Selected)

- `src/app` - pages and API routes
- `src/components` - UI components
- `src/lib` - data access, auth, entitlements, validation
- `scripts/seed.ts` - demo seed
- `data/` - SQLite database

## API Overview (Selected)

- `/api/plans` - get/create plan for a date
- `/api/tasks` - create tasks
- `/api/tasks/[id]` - update tasks
- `/api/history` - list plans
- `/api/entitlements` - get current entitlements
- `/api/subscriptions/*` - plan management and subscription changes

## Troubleshooting

- **AUTH_SECRET required**: set it in `.env` for production builds.
- **CSRF errors**: ensure cookies are set and requests are same-origin.
- **Missing admin controls**: verify `users.is_admin = 1` in DB.

## License

Proprietary (update as needed).
