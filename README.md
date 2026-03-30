# FMCG Operations Platform — Sauda Analytics MVP

Full-stack FMCG distribution dashboard. Replaces daily manual Excel work.

## Quick Start

### 1. Prerequisites
- Docker + Docker Compose
- Node.js 20+
- Python 3.11+
- VS Code with recommended extensions (install prompt on open)

### 2. Clone & open
```bash
git clone <repo>
cd fmcg-platform
code .
# VS Code will prompt to install recommended extensions — click Install All
```

### 3. Install dependencies
```
Ctrl+Shift+B → "📦 Install: All deps"
```

### 4. Start everything
```
Ctrl+Shift+B → "🚀 Start All (Docker)"
```

Or run API + Web locally (faster for dev):
```
Ctrl+Shift+B → "⚡ Dev: Start API + Web"
```

### 5. Seed database (first time only)
```bash
cd apps/api
source .venv/bin/activate
python seed.py
```

### 6. Open app
- **Web**: http://localhost:3000
- **API docs**: http://localhost:8000/docs
- **Login**: admin@fmcg.kz / admin123

---

## Daily workflow

1. Export two files from 1C
2. Go to `/upload` page in the app
3. Drop files into upload zones
4. Dashboard updates automatically

## Dev workflow in VS Code

| Action | Shortcut |
|---|---|
| Run all services | `Ctrl+Shift+B` → Start All |
| Debug FastAPI | `F5` → Debug FastAPI |
| Debug parser | `F5` → Debug Parser: Sales |
| Run tests | `Ctrl+Shift+B` → Test: API |
| New DB migration | `Ctrl+Shift+B` → DB: Create Migration |
| Test API endpoints | Open `.vscode/api.http` |

## Project structure

```
fmcg-platform/
├── apps/
│   ├── web/          # Next.js 14 frontend
│   └── api/          # FastAPI backend
├── .vscode/
│   ├── settings.json       # Editor config
│   ├── tasks.json          # Build tasks (Ctrl+Shift+B)
│   ├── launch.json         # Debug configs (F5)
│   ├── extensions.json     # Recommended extensions
│   ├── copilot-instructions.md  # AI context for Copilot
│   └── api.http            # REST client test file
└── docker-compose.yml
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind, shadcn/ui, Recharts |
| State | React Query + Zustand |
| Backend | FastAPI, Python 3.11 |
| Database | PostgreSQL 16 + SQLAlchemy 2.0 |
| Parsing | pandas + openpyxl |
| Auth | NextAuth.js + JWT |
| Deploy | Docker Compose |

## Roadmap

- **v1.1** — 1C HTTP API integration (auto-sync hourly, no file uploads)
- **v1.2** — WhatsApp Bot (Green API + Claude API, orders from chat)
- **v1.3** — PWA + push notifications for branch directors
- **v2.0** — AI sales forecasting + auto-replenishment orders
- **v3.0** — Sauda Analytics SaaS for other FMCG companies
