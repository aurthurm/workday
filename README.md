Workday is a lightweight daily planning and visibility app for teams.

## Getting Started

Install dependencies and seed a local SQLite database:

```bash
bun install
bun run seed
```

Start the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo accounts

Seed data creates:

- `admin@workday.local` / `password123` (admin)
- `supervisor@workday.local` / `password123` (supervisor)
- `member@workday.local` / `password123` (member)

### Environment

Optionally set `AUTH_SECRET` in `.env.local` for signed sessions.

## Build

```bash
bun run build
```
