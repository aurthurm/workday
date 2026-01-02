# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Workday** is a lightweight daily planning and work visibility application for teams. It emphasizes making work visible without micromanagement - helping workers plan their day and giving supervisors visibility to support their team.

### Core Philosophy
- Not project management or time tracking
- Not surveillance
- Simple, human-centered oversight
- "Make work visible without making people feel watched"

## Development Commands

### Setup
```bash
# Install dependencies
bun install

# Seed the local SQLite database with demo accounts
bun run seed
```

### Development
```bash
# Start development server (runs on http://localhost:3000)
bun dev

# Build for production
bun run build

# Start production server
bun start

# Run linter
bun run lint
```

### Database
The application uses SQLite with better-sqlite3. The database file is located at `data/workday.db` and is auto-created on first run.

## Application Architecture

### Tech Stack
- **Framework**: Next.js 16.1.1 (App Router)
- **Runtime**: Bun
- **Database**: SQLite (better-sqlite3)
- **State Management**: TanStack React Query
- **Styling**: Tailwind CSS v4
- **UI Components**: Radix UI primitives (shadcn/ui pattern)
- **Auth**: JWT sessions (jose library)

### Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (app)/             # Authenticated routes (layout requires session)
│   │   ├── today/         # Main daily planning interface
│   │   ├── supervisor/    # Supervisor team overview
│   │   ├── history/       # Historical plan view
│   │   └── profile/       # User profile
│   ├── api/               # API routes
│   │   ├── auth/          # Login, logout, register
│   │   ├── plans/         # Daily plan CRUD
│   │   ├── tasks/         # Task CRUD
│   │   ├── comments/      # Comment operations
│   │   └── workspaces/    # Workspace management
│   ├── login/
│   ├── register/
│   └── providers.tsx      # React Query provider
├── components/
│   ├── ui/                # Radix UI primitives (button, card, input, etc.)
│   ├── nav.tsx            # Navigation components
│   └── workspace-switcher.tsx
└── lib/
    ├── db.ts              # Database setup and schema
    ├── data.ts            # Data access layer (all DB queries)
    ├── auth.ts            # Session management (JWT)
    ├── api.ts             # Client-side fetch wrapper
    ├── date.ts            # Date formatting utilities
    └── time.ts            # Time formatting utilities
```

### Key Architectural Patterns

#### Data Layer
All database operations go through `src/lib/data.ts`. This module exports typed functions for all database queries. Never write raw SQL in API routes - use the data layer functions.

Example:
```typescript
// Good
import { getUserByEmail, createUser } from '@/lib/data';
const user = getUserByEmail(email);

// Bad - don't do this
db.prepare("SELECT * FROM users WHERE email = ?").get(email);
```

#### Authentication Flow
1. JWT sessions stored in httpOnly cookies (`workday_session`)
2. Session helpers in `src/lib/auth.ts`: `getSession()`, `setSession()`, `clearSession()`
3. The `(app)` layout checks for session and redirects to `/login` if missing
4. Active workspace tracked via `workday_workspace` cookie

#### Role-Based Access
- **member**: Can create and manage their own daily plans
- **supervisor**: Can view team plans and leave comments (cannot edit tasks)
- **admin**: Manages workspace and users

Access control is enforced at the API route level by checking `membership.role`.

#### Client-Server Pattern
- Server Components for layouts and initial data
- Client Components (marked `"use client"`) for interactive forms
- TanStack React Query for data fetching, mutations, and optimistic updates
- API routes handle all mutations and return JSON

Example pattern in `TodayClient.tsx`:
```typescript
const planQuery = useQuery({
  queryKey: ['plan', dateValue],
  queryFn: () => apiFetch<PlanResponse>(`/api/plans?date=${dateValue}`)
});

const createTaskMutation = useMutation({
  mutationFn: () => apiFetch('/api/tasks', { method: 'POST', body: {...} }),
  onSuccess: () => planQuery.refetch()
});
```

### Database Schema

The schema is defined and auto-created in `src/lib/db.ts`:

- **users**: id, email, password_hash, name
- **workspaces**: id, name, type (personal | organization)
- **memberships**: user-workspace join with role
- **daily_plans**: One per user per workspace per date, tracks visibility and submission status
- **tasks**: Belong to daily_plans, include title, category, status, estimated/actual minutes
- **reflections**: One per daily_plan (what_went_well, blockers, tomorrow_focus)
- **comments**: Attached to daily_plans (optionally to specific tasks), include author

### Styling Conventions

- Uses Tailwind v4 with custom color palette: `ink` (neutral) and `tide` (accent)
- Custom shadows: `shadow-card`, `shadow-inset`
- Font families: `font-display` and `font-body` (set in `src/app/layout.tsx`)
- Desktop uses 3-column grid: sidebar, main content, right panel
- Mobile uses single-column with bottom navigation

## Demo Accounts

Seed data creates three accounts (all with password `password123`):
- `admin@workday.local` - admin role
- `supervisor@workday.local` - supervisor role
- `member@workday.local` - member role

## Environment Variables

Optional: Set `AUTH_SECRET` in `.env.local` for production JWT signing. Defaults to `"workday-dev-secret"` for development.

## Important Constraints

### MVP Scope
This is a **strict MVP**. Do not add:
- Analytics dashboards
- Push notifications
- Calendar integrations
- Multi-workspace features beyond basic switching
- Task dependencies or hierarchies
- Advanced time tracking

### Data Model Rules
- Tasks are flat (no subtasks, no dependencies)
- One daily plan per user per workspace per day
- Tasks have simple statuses: `planned`, `done`, `skipped`
- Categories are fixed: Admin, Technical, Field, Other
- No recurring tasks or templates

### UI/UX Principles
- Minimal, calm design
- Avoid surveillance language ("track", "monitor")
- Use supportive language ("guide", "support", "visibility")
- Accessibility matters (proper semantic HTML, ARIA labels)

## Project Documentation

See `project-docs/prompt.md` for the full Product Requirements Document that guided this application's design.
