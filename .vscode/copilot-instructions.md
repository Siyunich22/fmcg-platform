# FMCG Operations Platform — Copilot Instructions

## Project Overview
This is a full-stack FMCG distribution management platform for a Kazakh company with 12 regional branches and ~200 SKUs (oil, jam, tea, noodles, pepper, tissues, etc.). The platform replaces daily manual Excel work by parsing 1C ERP exports and providing a real-time web dashboard.

## Architecture
- **apps/web** — Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, React Query, Zustand, Recharts
- **apps/api** — FastAPI (Python 3.11), SQLAlchemy 2.0, Alembic, pandas, openpyxl
- **Database** — PostgreSQL 16
- **Infra** — Docker Compose

---

## Coding Standards

### TypeScript / React
- Always use TypeScript with strict types. Never use `any`.
- Use `interface` for props and API response shapes, `type` for unions.
- All components are functional with React hooks. No class components.
- Use React Query for ALL data fetching. No raw `fetch` in components.
- Form state: React Hook Form + Zod validation. Never manual state for forms.
- Naming: `PascalCase` components, `camelCase` functions, `SCREAMING_SNAKE` constants.
- File structure: one component per file, named same as component.
- Always handle loading and error states in UI components.
- Use `cn()` utility for conditional Tailwind classes.

```typescript
// ✅ Good
interface BranchSalesProps {
  branchId: string;
  period: DateRange;
}

export function BranchSales({ branchId, period }: BranchSalesProps) {
  const { data, isLoading, error } = useBranchSales(branchId, period);
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorState message={error.message} />;
  return <BarChart data={data} />;
}

// ❌ Bad — no types, no loading state, raw fetch
export function BranchSales({ id }) {
  const [data, setData] = useState();
  useEffect(() => { fetch('/api/sales').then(r => r.json()).then(setData) }, []);
  return <div>{data?.map(...)}</div>;
}
```

### Python / FastAPI
- Type hints on ALL functions. Use Pydantic v2 for request/response schemas.
- Async everywhere: `async def` for all route handlers.
- Dependency injection for DB sessions: `db: AsyncSession = Depends(get_db)`.
- Never raw SQL — use SQLAlchemy ORM queries.
- Services are separate from routers. Routers only call services.
- Error handling: raise `HTTPException` with meaningful status codes and messages.
- Use `logging` module, not `print`.

```python
# ✅ Good
@router.post("/upload/sales", response_model=UploadResponse)
async def upload_sales(
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await upload_service.process_sales_file(db, file, current_user.id)
    return result

# ❌ Bad — no types, no auth, sync, raw SQL
@router.post("/upload")
def upload(file):
    df = pd.read_excel(file)
    conn.execute(f"INSERT INTO sales VALUES ...")
```

---

## Database Schema

### Key Tables
```
branches        — id, name, code_1c, active
nomenclature    — id, code_1c, name, category, unit, active  
uploads         — id, upload_type, filename, period_date, rows_processed, status, uploaded_by, uploaded_at
sales           — id, upload_id, nomenclature_id, branch_id, period_date, amount
stock           — id, upload_id, nomenclature_id, branch_id, snapshot_date, qty, amount, days_supply, flag
debts           — id, upload_id, branch_id, period_date, debt_amount, payment_amount, overdue_days, status
orders          — id, number, branch_id, status, total_amount, source, created_by, created_at
order_items     — id, order_id, nomenclature_id, qty, price, amount, in_stock
alerts          — id, level, type, message, branch_id, resolved, created_at
users           — id, email, hashed_password, role, branch_id
```

### Enums
```python
# upload_type: sales | stock
# stock.flag: ok | warning | critical
# debt.status: ok | warning | risk | critical
# order.status: pending | confirmed | shipped | delivered | cancelled
# order.source: manual | whatsapp
# user.role: admin | analyst | manager | branch
# alert.level: info | warning | critical
```

---

## Parsing Logic — CRITICAL

### File 1: Sales & Payments (1C export)
```
Structure:
  row[0]  = empty (title row)
  row[1]  = date header
  row[2]  = column headers: [code, name, Осн.склад, Актау, Актобе, Алматы, 
                              Астана, ИП Береке, Атырау, Кокшетау, Семей, Шымкент, Итого]
  row[3+] = data rows

Column index → Branch mapping:
  2  = Основной склад
  3  = Актау
  4  = Актобе  
  5  = Алматы
  6  = Астана
  7  = ИП Береке
  8  = Атырау
  9  = Кокшетау (NOTE: no Актобе in file 2, order differs between files)
  10 = RTA DISTRIBUTION
  11 = Семей
  12 = Шымкент
  13 = Итого (skip — use for validation only)

Row classification:
  - col[0] matches /^БК\d+/ → sales row
  - col[1] contains "Долг"   → debt row (долг by branch)
  - col[1] contains "Оплаты" → payment row
  - else                     → skip

Category detection (col[1] name):
  МАСЛО     = /масл|масло/i
  ВАРЕНЬЕ   = /варень|джем/i
  ЧАЙ       = /чай|tea/i
  НАРЫН     = /нарын/i
  ЛАПША     = /лапш|алькони|express|экспресс/i
  ПЕРЕЦ     = /перец|пряност|специ/i
  САЛФЕТКИ  = /салфет/i
  ПРОЧЕЕ    = default
```

### File 2: Stock & Sales by Branch (1C export)
```
Structure:
  row[3] = branch group headers (merged cells)
  row[4] = sub-headers: продажи | остатки
  row[5] = detail: шт | сумма
  row[6] = col[0]=код, col[1]=Номенклатура, then repeating pattern
  row[7+] = data

Column → Branch → [sales_qty, sales_sum, stock_qty, stock_sum]:
  2,  3,  4,  5  = Итого        (validation only)
  6,  7,  8,  9  = Основной склад
  10, 11, 12, 13 = Актау
  14, 15, 16, 17 = Алматы
  18, 19, 20, 21 = Астана
  22, 23, 24, 25 = ИП Береке
  26, 27, 28, 29 = Атырау
  30, 31, 32, 33 = Кокшетау
  34, 35, 36, 37 = Семей
  38, 39, 40, 41 = Шымкент

days_supply calculation:
  period_days = (snapshot_date - first_day_of_month).days + 1
  daily_sales = sales_qty / period_days
  days_supply = stock_qty / daily_sales  (if daily_sales == 0 → 9999)
  
flags:
  days_supply <= 90   → ok
  days_supply <= 180  → warning
  days_supply >  180  → critical
```

---

## API Response Format

Always return consistent shapes:
```typescript
// List response
interface ListResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}

// Error response  
interface ErrorResponse {
  detail: string;
  code?: string;
}
```

---

## Business Rules

1. **Stock flags**: ≤90 days = ok (green), 91–180 = warning (yellow), >180 = critical (red)
2. **Debt status**: 0–30 days = ok, 31–60 = warning, 61–90 = risk, 91+ = critical
3. **Alert triggers**:
   - Debt overdue 91+ days → CRITICAL alert
   - Stock days_supply > 180 → WARNING alert  
   - Branch sales drop >20% vs prior period → WARNING alert
   - Stock days_supply < 7 → INFO alert (near stockout)
4. **Deduplication**: If upload for same date already exists → overwrite (delete old, insert new)
5. **Order numbers**: Auto-generate as `ORD-{YYYY}-{NNNN}` (e.g. ORD-2026-0001)

---

## Environment Variables

```bash
# apps/api/.env
DATABASE_URL=postgresql+asyncpg://fmcg:fmcg@localhost:5432/fmcg
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret
```

---

## File Structure Reference
```
fmcg-platform/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── login/page.tsx
│   │   │   └── dashboard/
│   │   │       ├── layout.tsx          ← sidebar + topbar
│   │   │       ├── page.tsx            ← main dashboard
│   │   │       ├── sales/page.tsx
│   │   │       ├── stock/page.tsx
│   │   │       ├── debts/page.tsx
│   │   │       ├── orders/page.tsx
│   │   │       ├── orders/new/page.tsx
│   │   │       └── upload/page.tsx
│   │   ├── components/
│   │   │   ├── ui/                     ← shadcn components
│   │   │   ├── charts/                 ← Recharts wrappers
│   │   │   └── forms/                  ← form components
│   │   ├── hooks/                      ← React Query hooks
│   │   ├── lib/
│   │   │   ├── api.ts                  ← axios instance
│   │   │   └── utils.ts                ← cn(), formatters
│   │   └── types/index.ts
│   └── api/
│       ├── main.py
│       ├── routers/
│       │   ├── upload.py
│       │   ├── dashboard.py
│       │   ├── sales.py
│       │   ├── stock.py
│       │   ├── debts.py
│       │   ├── orders.py
│       │   └── auth.py
│       ├── services/
│       │   ├── parser_sales.py         ← CRITICAL
│       │   ├── parser_stock.py         ← CRITICAL
│       │   ├── alert_engine.py
│       │   └── export_excel.py
│       ├── models/                     ← SQLAlchemy models
│       └── schemas/                    ← Pydantic schemas
├── .vscode/
│   ├── settings.json
│   ├── tasks.json
│   ├── launch.json
│   └── copilot-instructions.md        ← this file
└── docker-compose.yml
```

---

## When generating code, always:
1. Add type hints / TypeScript types
2. Handle error cases explicitly
3. Add a one-line docstring to every service function
4. Match the naming conventions above
5. For parsers — validate the column mapping against the schema above before writing
