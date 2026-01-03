Workday is a lightweight daily planning and visibility app for teams.

## Features

- **Daily Planning**: Plan tasks with time estimates and scheduling
- **Team Visibility**: Supervisors can view team plans without micromanagement
- **Reflections**: End-of-day reflections for continuous improvement
- **Comments**: Collaborative feedback on plans and tasks
- **Workspaces**: Multi-workspace support for teams and organizations

## Getting Started

### Development

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

### Demo Accounts

Seed data creates:

- `admin@workday.local` / `password123` (admin)
- `supervisor@workday.local` / `password123` (supervisor)
- `member@workday.local` / `password123` (member)

### Environment Variables

Create `.env.local` for local development:

```bash
# Generate a secure secret
openssl rand -base64 32

# Create .env.local
echo "AUTH_SECRET=<paste-generated-secret>" > .env.local
echo "NODE_ENV=development" >> .env.local
```

See `.env.example` for all available options.

## Production Deployment

### Prerequisites

- Node.js 20+ or Bun 1.0+
- HTTPS-enabled domain (required for secure cookies)
- Backup strategy for SQLite database

### Build

```bash
# Install dependencies
bun install

# Build for production
bun run build

# Start production server
bun start
```

### Required Environment Variables

```env
AUTH_SECRET=<your-secure-secret>  # REQUIRED
NODE_ENV=production               # REQUIRED
```

### Security Features

✅ **Input validation** with Zod schemas
✅ **CSRF protection** on all state-changing requests
✅ **Security headers** (CSP, X-Frame-Options, HSTS, etc.)
✅ **Rate limiting** on auth endpoints
✅ **Secure cookies** with httpOnly and sameSite: strict
✅ **SQL injection prevention** through parameterized queries
✅ **Error boundaries** for graceful error handling
✅ **Structured logging** for security events

See `SECURITY.md` for detailed security documentation.

### Quick Deploy with PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start "bun start" --name workday

# Save configuration
pm2 save
pm2 startup

# Monitor
pm2 status
pm2 logs workday
```

### Database Backups

**CRITICAL**: Set up regular backups of `data/workday.db`

```bash
# Example backup script
sqlite3 data/workday.db ".backup backups/workday_$(date +%Y%m%d).db"
```

Add to crontab for daily backups:
```bash
0 2 * * * /path/to/backup-script.sh
```

## Documentation

- **SECURITY.md** - Security hardening details
- **CLAUDE.md** - Project guidelines and architecture
- **project-docs/prompt.md** - Original product requirements

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Runtime**: Bun
- **Database**: SQLite with better-sqlite3
- **State**: TanStack React Query
- **Styling**: Tailwind CSS v4
- **UI**: Radix UI primitives
- **Auth**: JWT sessions with jose
- **Validation**: Zod

## Development Commands

```bash
bun dev          # Start development server
bun run build    # Build for production
bun start        # Start production server
bun run lint     # Run ESLint
bun run seed     # Seed database with demo data
```

## Support

For issues or questions:
1. Check existing documentation
2. Review `SECURITY.md` for security-related questions
3. Open an issue on GitHub

## License

[Your License Here]
