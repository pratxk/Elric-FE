# Elric — Frontend

Accounts-payable invoice processing agent. Next.js 14 (App Router) + TypeScript (strict) + Tailwind CSS, styled in the Mercury demo design language (§10 of `../ARCHITECTURE.md`): light grey page `#F7F7F8`, white hairline cards, Inter, primary blue `#4F46E5`, tabular numerals, ₹ formatting.

## Run

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm start       # serve the production build
```

## Pages

| Route | Page |
| --- | --- |
| `/` | Dashboard — pending approval, vendor balances, exceptions, pipeline, money movement |
| `/inbox` | Inbox / upload — dropzone (local-only, no real upload yet) + received invoices |
| `/exceptions` | Exception queue — filterable by type + status, rows link to invoice detail |
| `/approvals` | Approval queue — approve/reject buttons (client-side state only) |
| `/invoices/[id]` | Invoice detail — mock document viewer, extracted fields, 3-way match table, agent trace |
| `/vendors` | Vendor list with reliability scores and balances |
| `/eval` | Eval report — extraction accuracy, match rate, auto-approve rate, false-approve rate |
| `/payments` | Scheduled payments |
| `/accounting` | Ledger entries posted by the Bookkeeper |

Sidebar items Cards, Capital and Reimbursements are marked "Soon" — no page yet.

## Data

All data is mock data in `src/lib/mock-data.ts` (Indian vendors, GSTINs, ₹ amounts). No backend calls, no auth (phase 2), no secrets. The agent trace panel on the invoice detail page is a static list wired for SSE later (`/api/invoices/{id}/trace`).
