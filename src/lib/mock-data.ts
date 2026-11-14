/**
 * Mock data for the Elric frontend scaffold.
 * No backend calls yet — every page reads from here.
 * All figures are invented demo data, clearly labelled "Mock data" in the UI.
 */

export type InvoiceStatus =
  | "received"
  | "extracted"
  | "validated"
  | "matched"
  | "approved"
  | "flagged"
  | "on_hold"
  | "posted"
  | "scheduled"
  | "paid"
  | "duplicate"
  | "rejected";

export type ExceptionType =
  | "PRICE_VARIANCE"
  | "QTY_SHORT"
  | "DUPLICATE"
  | "MISSING_PO"
  | "TAX_MISMATCH"
  | "TOTAL_MISMATCH";

export type ExceptionStatus = "open" | "in_review" | "resolved";

export interface Vendor {
  id: string;
  name: string;
  gstin: string;
  state: string;
  balance: number; // amount owed to vendor
  reliability: number; // 0–100 vendor reliability score
  onTimePct: number;
  accuracyPct: number;
  openInvoices: number;
  lastInvoice: string; // ISO date
}

export interface InvoiceLine {
  description: string;
  hsn: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export interface MatchRow {
  line: string;
  invoiceQty: number;
  poQty: number;
  receiptQty: number;
  invoicePrice: number;
  poPrice: number;
  variance: number; // in rupees, invoice - PO for the line
  status: "matched" | "variance";
}

export interface TraceStep {
  agent: string;
  step: string;
  status: "done" | "active" | "waiting" | "failed";
  detail: string;
  durationMs?: number;
}

export interface Invoice {
  id: string;
  number: string;
  vendorId: string;
  vendor: string;
  gstin: string;
  invoiceDate: string;
  dueDate: string;
  poNumber: string | null;
  amount: number;
  tax: number;
  status: InvoiceStatus;
  exceptionType?: ExceptionType;
  ageDays: number;
  lines: InvoiceLine[];
  matchRows: MatchRow[];
  trace: TraceStep[];
  rootCause?: string;
}

export interface ExceptionItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  type: ExceptionType;
  vendor: string;
  amount: number;
  ageDays: number;
  status: ExceptionStatus;
  summary: string;
}

export interface ApprovalItem {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  vendor: string;
  amount: number;
  dueDate: string;
  matchSummary: string;
  approver: string;
  slaHoursLeft: number;
}

export const vendors: Vendor[] = [
  { id: "VEN-001", name: "Acme Supplies Pvt Ltd", gstin: "27AAACA1234F1Z5", state: "Maharashtra", balance: 482500, reliability: 94, onTimePct: 96, accuracyPct: 98, openInvoices: 4, lastInvoice: "2026-11-12" },
  { id: "VEN-002", name: "Shree Ganesh Office Mart", gstin: "29AABCS5678G1Z2", state: "Karnataka", balance: 128750, reliability: 88, onTimePct: 91, accuracyPct: 93, openInvoices: 2, lastInvoice: "2026-11-10" },
  { id: "VEN-003", name: "TechServe Solutions India Pvt Ltd", gstin: "06AABCT9012H1Z8", state: "Haryana", balance: 1240000, reliability: 97, onTimePct: 98, accuracyPct: 99, openInvoices: 3, lastInvoice: "2026-11-13" },
  { id: "VEN-004", name: "Kaveri Paper & Packaging Co", gstin: "33AAKCP3456K1Z4", state: "Tamil Nadu", balance: 86400, reliability: 81, onTimePct: 84, accuracyPct: 89, openInvoices: 2, lastInvoice: "2026-11-08" },
  { id: "VEN-005", name: "Narmada Logistics Pvt Ltd", gstin: "24AABCN7890L1Z9", state: "Gujarat", balance: 312000, reliability: 76, onTimePct: 79, accuracyPct: 85, openInvoices: 3, lastInvoice: "2026-11-11" },
  { id: "VEN-006", name: "BrightLeaf Catering Services", gstin: "29AABCB2345M1Z3", state: "Karnataka", balance: 45200, reliability: 90, onTimePct: 93, accuracyPct: 95, openInvoices: 1, lastInvoice: "2026-11-09" },
  { id: "VEN-007", name: "Himalaya IT Hardware LLP", gstin: "07AAHHI6789N1Z6", state: "Delhi", balance: 968000, reliability: 92, onTimePct: 95, accuracyPct: 97, openInvoices: 2, lastInvoice: "2026-11-14" },
  { id: "VEN-008", name: "Deccan Facility Management", gstin: "36AABCD1122P1Z7", state: "Telangana", balance: 210300, reliability: 83, onTimePct: 86, accuracyPct: 90, openInvoices: 2, lastInvoice: "2026-11-07" },
];

export const invoices: Invoice[] = [
  {
    id: "INV-2481",
    number: "ACM/2026-27/1142",
    vendorId: "VEN-001",
    vendor: "Acme Supplies Pvt Ltd",
    gstin: "27AAACA1234F1Z5",
    invoiceDate: "2026-11-10",
    dueDate: "2026-12-10",
    poNumber: "PO-2026-0841",
    amount: 184620,
    tax: 28170,
    status: "flagged",
    exceptionType: "PRICE_VARIANCE",
    ageDays: 5,
    lines: [
      { description: "A4 Copier Paper 75 GSM (Ream)", hsn: "4802", qty: 200, unitPrice: 285, amount: 57000 },
      { description: "Ballpoint Pens Blue (Box of 50)", hsn: "9608", qty: 120, unitPrice: 340, amount: 40800 },
      { description: "Ergonomic Office Chair — Mesh Back", hsn: "9401", qty: 12, unitPrice: 4850, amount: 58200 },
    ],
    matchRows: [
      { line: "A4 Copier Paper 75 GSM (Ream)", invoiceQty: 200, poQty: 200, receiptQty: 200, invoicePrice: 285, poPrice: 278, variance: 1400, status: "variance" },
      { line: "Ballpoint Pens Blue (Box of 50)", invoiceQty: 120, poQty: 120, receiptQty: 120, invoicePrice: 340, poPrice: 340, variance: 0, status: "matched" },
      { line: "Ergonomic Office Chair — Mesh Back", invoiceQty: 12, poQty: 12, receiptQty: 10, invoicePrice: 4850, poPrice: 4850, variance: 0, status: "variance" },
    ],
    trace: [
      { agent: "Ingestor", step: "Intake & dedupe", status: "done", detail: "PDF received via upload · SHA-256 dedupe clean", durationMs: 420 },
      { agent: "Extractor", step: "Structured extraction", status: "done", detail: "3 lines extracted · avg confidence 0.97 · arithmetic self-check passed", durationMs: 2840 },
      { agent: "Matcher", step: "3-way match (deterministic)", status: "done", detail: "2 of 3 lines matched · PRICE_VARIANCE + QTY_SHORT raised", durationMs: 96 },
      { agent: "Exception Handler", step: "Root-cause analysis", status: "done", detail: "Paper unit price +2.5% vs PO; 2 chairs short-received (GRN-7712)", durationMs: 3120 },
      { agent: "Approver", step: "Human review", status: "active", detail: "Waiting in approvals queue · SLA 18h left", },
      { agent: "Bookkeeper", step: "Post to ledger", status: "waiting", detail: "Runs after approval" },
    ],
    rootCause:
      "Unit price on A4 paper is ₹285 vs ₹278 on PO-2026-0841 (+2.5%, above the ±2% tolerance; variance ₹1,400). The goods receipt GRN-7712 shows 10 of 12 chairs received — 2 chairs are short-delivered, not over-billed. Recommended: approve the matched lines, hold ₹9,700 for the 2 undelivered chairs, and query Acme on the paper price.",
  },
  {
    id: "INV-2479",
    number: "TS/26-27/0891",
    vendorId: "VEN-003",
    vendor: "TechServe Solutions India Pvt Ltd",
    gstin: "06AABCT9012H1Z8",
    invoiceDate: "2026-11-09",
    dueDate: "2026-12-09",
    poNumber: "PO-2026-0833",
    amount: 542000,
    tax: 82644,
    status: "approved",
    ageDays: 6,
    lines: [
      { description: "Annual SaaS Subscription — Monitoring Suite", hsn: "9983", qty: 1, unitPrice: 542000, amount: 542000 },
    ],
    matchRows: [
      { line: "Annual SaaS Subscription — Monitoring Suite", invoiceQty: 1, poQty: 1, receiptQty: 1, invoicePrice: 542000, poPrice: 542000, variance: 0, status: "matched" },
    ],
    trace: [
      { agent: "Ingestor", step: "Intake & dedupe", status: "done", detail: "PDF received via email intake · dedupe clean", durationMs: 380 },
      { agent: "Extractor", step: "Structured extraction", status: "done", detail: "1 line extracted · confidence 0.99", durationMs: 1980 },
      { agent: "Matcher", step: "3-way match (deterministic)", status: "done", detail: "Clean 3-way match · within tolerance", durationMs: 74 },
      { agent: "Approver", step: "Auto-approve", status: "done", detail: "Clean match under ₹10L auto-approve threshold", durationMs: 12 },
      { agent: "Bookkeeper", step: "Post to ledger", status: "done", detail: "Posted · payment scheduled 09 Dec 2026", durationMs: 210 },
    ],
  },
  {
    id: "INV-2483",
    number: "NL/2026/5520",
    vendorId: "VEN-005",
    vendor: "Narmada Logistics Pvt Ltd",
    gstin: "24AABCN7890L1Z9",
    invoiceDate: "2026-11-12",
    dueDate: "2026-11-27",
    poNumber: "PO-2026-0844",
    amount: 96400,
    tax: 14705,
    status: "flagged",
    exceptionType: "QTY_SHORT",
    ageDays: 3,
    lines: [
      { description: "Inter-city Freight — Bengaluru to Pune (2 trips)", hsn: "9965", qty: 2, unitPrice: 48200, amount: 96400 },
    ],
    matchRows: [
      { line: "Inter-city Freight — Bengaluru to Pune (2 trips)", invoiceQty: 2, poQty: 2, receiptQty: 1, invoicePrice: 48200, poPrice: 48200, variance: 0, status: "variance" },
    ],
    trace: [
      { agent: "Ingestor", step: "Intake & dedupe", status: "done", detail: "PDF received via upload · dedupe clean", durationMs: 410 },
      { agent: "Extractor", step: "Structured extraction", status: "done", detail: "1 line extracted · confidence 0.96", durationMs: 2210 },
      { agent: "Matcher", step: "3-way match (deterministic)", status: "done", detail: "QTY_SHORT raised · receipt covers 1 of 2 trips", durationMs: 88 },
      { agent: "Exception Handler", step: "Root-cause analysis", status: "done", detail: "Second trip POD not yet uploaded by vendor", durationMs: 2980 },
      { agent: "Approver", step: "Human review", status: "active", detail: "Waiting in approvals queue · SLA 30h left" },
      { agent: "Bookkeeper", step: "Post to ledger", status: "waiting", detail: "Runs after approval" },
    ],
    rootCause:
      "Invoice bills 2 freight trips but the goods receipt covers only 1 — the second trip's proof of delivery has not been uploaded yet. Recommended: hold ₹48,200 for the unreceipted trip and query Narmada for the missing POD.",
  },
  {
    id: "INV-2476",
    number: "HIM/26-27/0318",
    vendorId: "VEN-007",
    vendor: "Himalaya IT Hardware LLP",
    gstin: "07AAHHI6789N1Z6",
    invoiceDate: "2026-11-08",
    dueDate: "2026-12-08",
    poNumber: "PO-2026-0829",
    amount: 312500,
    tax: 47669,
    status: "flagged",
    exceptionType: "DUPLICATE",
    ageDays: 7,
    lines: [
      { description: "27-inch 4K Monitor — IPS Panel", hsn: "8528", qty: 10, unitPrice: 31250, amount: 312500 },
    ],
    matchRows: [
      { line: "27-inch 4K Monitor — IPS Panel", invoiceQty: 10, poQty: 10, receiptQty: 10, invoicePrice: 31250, poPrice: 31250, variance: 0, status: "matched" },
    ],
    trace: [
      { agent: "Ingestor", step: "Intake & dedupe", status: "done", detail: "Duplicate signal: same vendor + invoice no + amount as INV-2451 (paid 02 Nov)", durationMs: 450 },
      { agent: "Extractor", step: "Structured extraction", status: "done", detail: "1 line extracted · confidence 0.98", durationMs: 1890 },
      { agent: "Matcher", step: "3-way match (deterministic)", status: "done", detail: "Lines match PO · DUPLICATE exception blocks auto-approve", durationMs: 81 },
      { agent: "Exception Handler", step: "Root-cause analysis", status: "done", detail: "Likely vendor re-send of an already-paid invoice", durationMs: 2650 },
      { agent: "Approver", step: "Human review", status: "active", detail: "Waiting in approvals queue · SLA 12h left" },
      { agent: "Bookkeeper", step: "Post to ledger", status: "waiting", detail: "Blocked — duplicate" },
    ],
    rootCause:
      "Same vendor, invoice number HIM/26-27/0318 and amount ₹3,12,500 as INV-2451, which was paid on 02 Nov 2026. This looks like a vendor re-send. Recommended: reject as duplicate and confirm with Himalaya before any payment.",
  },
  {
    id: "INV-2485",
    number: "SG/26-27/2210",
    vendorId: "VEN-002",
    vendor: "Shree Ganesh Office Mart",
    gstin: "29AABCS5678G1Z2",
    invoiceDate: "2026-11-13",
    dueDate: "2026-12-13",
    poNumber: null,
    amount: 58750,
    tax: 8962,
    status: "flagged",
    exceptionType: "MISSING_PO",
    ageDays: 2,
    lines: [
      { description: "Pantry Supplies — Tea, Coffee, Sugar (Monthly)", hsn: "0901", qty: 1, unitPrice: 58750, amount: 58750 },
    ],
    matchRows: [
      { line: "Pantry Supplies — Tea, Coffee, Sugar (Monthly)", invoiceQty: 1, poQty: 0, receiptQty: 0, invoicePrice: 58750, poPrice: 0, variance: 58750, status: "variance" },
    ],
    trace: [
      { agent: "Ingestor", step: "Intake & dedupe", status: "done", detail: "PDF received via upload · dedupe clean", durationMs: 390 },
      { agent: "Extractor", step: "Structured extraction", status: "done", detail: "1 line extracted · confidence 0.95", durationMs: 2140 },
      { agent: "Matcher", step: "3-way match (deterministic)", status: "done", detail: "MISSING_PO raised · no PO found for vendor + amount", durationMs: 92 },
      { agent: "Exception Handler", step: "Root-cause analysis", status: "done", detail: "Recurring pantry order — likely raised without a PO", durationMs: 2410 },
      { agent: "Approver", step: "Human review", status: "active", detail: "Waiting in approvals queue · SLA 42h left" },
      { agent: "Bookkeeper", step: "Post to ledger", status: "waiting", detail: "Runs after approval" },
    ],
    rootCause:
      "No purchase order exists for this pantry invoice — recurring monthly orders from Shree Ganesh are raised without a PO. Recommended: approve against the pantry budget head (₹60,000/month) and raise a standing PO for next month.",
  },
  {
    id: "INV-2472",
    number: "KP/26-27/0877",
    vendorId: "VEN-004",
    vendor: "Kaveri Paper & Packaging Co",
    gstin: "33AAKCP3456K1Z4",
    invoiceDate: "2026-11-06",
    dueDate: "2026-12-06",
    poNumber: "PO-2026-0819",
    amount: 86400,
    tax: 13180,
    status: "paid",
    ageDays: 9,
    lines: [
      { description: "Corrugated Boxes 12x12x12 (Pack of 100)", hsn: "4819", qty: 40, unitPrice: 2160, amount: 86400 },
    ],
    matchRows: [
      { line: "Corrugated Boxes 12x12x12 (Pack of 100)", invoiceQty: 40, poQty: 40, receiptQty: 40, invoicePrice: 2160, poPrice: 2160, variance: 0, status: "matched" },
    ],
    trace: [
      { agent: "Ingestor", step: "Intake & dedupe", status: "done", detail: "PDF received via upload · dedupe clean", durationMs: 400 },
      { agent: "Extractor", step: "Structured extraction", status: "done", detail: "1 line extracted · confidence 0.97", durationMs: 2010 },
      { agent: "Matcher", step: "3-way match (deterministic)", status: "done", detail: "Clean 3-way match", durationMs: 79 },
      { agent: "Approver", step: "Auto-approve", status: "done", detail: "Clean match under threshold", durationMs: 11 },
      { agent: "Bookkeeper", step: "Post to ledger", status: "done", detail: "Posted · paid 12 Nov 2026 via NEFT", durationMs: 230 },
    ],
  },
  {
    id: "INV-2488",
    number: "BL/26-27/0445",
    vendorId: "VEN-006",
    vendor: "BrightLeaf Catering Services",
    gstin: "29AABCB2345M1Z3",
    invoiceDate: "2026-11-14",
    dueDate: "2026-11-29",
    poNumber: "PO-2026-0847",
    amount: 45200,
    tax: 2260,
    status: "received",
    ageDays: 1,
    lines: [
      { description: "Team Lunch Catering — 40 pax (Weekly)", hsn: "9963", qty: 1, unitPrice: 45200, amount: 45200 },
    ],
    matchRows: [
      { line: "Team Lunch Catering — 40 pax (Weekly)", invoiceQty: 1, poQty: 1, receiptQty: 1, invoicePrice: 45200, poPrice: 45200, variance: 0, status: "matched" },
    ],
    trace: [
      { agent: "Ingestor", step: "Intake & dedupe", status: "done", detail: "PDF received via upload · dedupe clean", durationMs: 405 },
      { agent: "Extractor", step: "Structured extraction", status: "active", detail: "Extracting line items…" },
      { agent: "Matcher", step: "3-way match (deterministic)", status: "waiting", detail: "Runs after extraction" },
      { agent: "Approver", step: "Human review", status: "waiting", detail: "—" },
      { agent: "Bookkeeper", step: "Post to ledger", status: "waiting", detail: "—" },
    ],
  },
  {
    id: "INV-2470",
    number: "DFM/26-27/1103",
    vendorId: "VEN-008",
    vendor: "Deccan Facility Management",
    gstin: "36AABCD1122P1Z7",
    invoiceDate: "2026-11-05",
    dueDate: "2026-12-05",
    poNumber: "PO-2026-0815",
    amount: 210300,
    tax: 32080,
    status: "scheduled",
    ageDays: 10,
    lines: [
      { description: "Facility Management — Monthly Retainer (Nov)", hsn: "9985", qty: 1, unitPrice: 210300, amount: 210300 },
    ],
    matchRows: [
      { line: "Facility Management — Monthly Retainer (Nov)", invoiceQty: 1, poQty: 1, receiptQty: 1, invoicePrice: 210300, poPrice: 210300, variance: 0, status: "matched" },
    ],
    trace: [
      { agent: "Ingestor", step: "Intake & dedupe", status: "done", detail: "PDF received via upload · dedupe clean", durationMs: 415 },
      { agent: "Extractor", step: "Structured extraction", status: "done", detail: "1 line extracted · confidence 0.98", durationMs: 1960 },
      { agent: "Matcher", step: "3-way match (deterministic)", status: "done", detail: "Clean 3-way match", durationMs: 83 },
      { agent: "Approver", step: "Human review", status: "done", detail: "Approved by Finance Head · 10 Nov 2026", durationMs: 0 },
      { agent: "Bookkeeper", step: "Post to ledger", status: "done", detail: "Posted · payment scheduled 05 Dec 2026", durationMs: 240 },
    ],
  },
];

export const exceptions: ExceptionItem[] = [
  { id: "EXC-101", invoiceId: "INV-2481", invoiceNumber: "ACM/2026-27/1142", type: "PRICE_VARIANCE", vendor: "Acme Supplies Pvt Ltd", amount: 184620, ageDays: 5, status: "open", summary: "A4 paper +2.5% over PO price (₹1,400 over tolerance) + 2 chairs short-received" },
  { id: "EXC-102", invoiceId: "INV-2476", invoiceNumber: "HIM/26-27/0318", type: "DUPLICATE", vendor: "Himalaya IT Hardware LLP", amount: 312500, ageDays: 7, status: "open", summary: "Same invoice no + amount as INV-2451, paid 02 Nov 2026" },
  { id: "EXC-103", invoiceId: "INV-2483", invoiceNumber: "NL/2026/5520", type: "QTY_SHORT", vendor: "Narmada Logistics Pvt Ltd", amount: 96400, ageDays: 3, status: "in_review", summary: "Receipt covers 1 of 2 billed freight trips; POD missing" },
  { id: "EXC-104", invoiceId: "INV-2485", invoiceNumber: "SG/26-27/2210", type: "MISSING_PO", vendor: "Shree Ganesh Office Mart", amount: 58750, ageDays: 2, status: "open", summary: "No PO on file — recurring pantry order raised without one" },
  { id: "EXC-105", invoiceId: "INV-2481", invoiceNumber: "ACM/2026-27/1142", type: "QTY_SHORT", vendor: "Acme Supplies Pvt Ltd", amount: 9700, ageDays: 5, status: "open", summary: "2 ergonomic chairs short-received against GRN-7712" },
];

export const approvals: ApprovalItem[] = [
  { id: "APR-201", invoiceId: "INV-2481", invoiceNumber: "ACM/2026-27/1142", vendor: "Acme Supplies Pvt Ltd", amount: 184620, dueDate: "2026-12-10", matchSummary: "2 of 3 lines matched · PRICE_VARIANCE ₹1,400 + QTY_SHORT 2 chairs", approver: "Finance Head", slaHoursLeft: 18 },
  { id: "APR-202", invoiceId: "INV-2476", invoiceNumber: "HIM/26-27/0318", vendor: "Himalaya IT Hardware LLP", amount: 312500, dueDate: "2026-12-08", matchSummary: "Lines match PO · DUPLICATE of paid INV-2451 — likely vendor re-send", approver: "Finance Head", slaHoursLeft: 12 },
  { id: "APR-203", invoiceId: "INV-2483", invoiceNumber: "NL/2026/5520", vendor: "Narmada Logistics Pvt Ltd", amount: 96400, dueDate: "2026-11-27", matchSummary: "1 of 2 trips receipted · QTY_SHORT ₹48,200 held", approver: "AP Manager", slaHoursLeft: 30 },
  { id: "APR-204", invoiceId: "INV-2485", invoiceNumber: "SG/26-27/2210", vendor: "Shree Ganesh Office Mart", amount: 58750, dueDate: "2026-12-13", matchSummary: "No PO · recurring pantry order within ₹60,000 monthly budget", approver: "AP Manager", slaHoursLeft: 42 },
];

export interface ScheduledPayment {
  id: string;
  invoiceId: string;
  vendor: string;
  amount: number;
  scheduledDate: string;
  method: string;
  status: "scheduled" | "paid" | "overdue";
  discountNote?: string;
}

export const scheduledPayments: ScheduledPayment[] = [
  { id: "PAY-301", invoiceId: "INV-2470", vendor: "Deccan Facility Management", amount: 210300, scheduledDate: "2026-12-05", method: "NEFT", status: "scheduled", discountNote: "2/10 Net 30 — pay by 15 Nov to save ₹4,206" },
  { id: "PAY-302", invoiceId: "INV-2479", vendor: "TechServe Solutions India Pvt Ltd", amount: 542000, scheduledDate: "2026-12-09", method: "NEFT", status: "scheduled" },
  { id: "PAY-303", invoiceId: "INV-2472", vendor: "Kaveri Paper & Packaging Co", amount: 86400, scheduledDate: "2026-11-12", method: "NEFT", status: "paid" },
  { id: "PAY-304", invoiceId: "INV-2476", vendor: "Himalaya IT Hardware LLP", amount: 312500, scheduledDate: "2026-11-20", method: "NEFT", status: "overdue", discountNote: "Blocked — duplicate under review" },
];

export interface LedgerEntry {
  id: string;
  date: string;
  description: string;
  account: string;
  debit: number;
  credit: number;
}

export const ledgerEntries: LedgerEntry[] = [
  { id: "LE-501", date: "2026-11-12", description: "Kaveri Paper — INV KP/26-27/0877 paid via NEFT", account: "Accounts Payable", debit: 86400, credit: 0 },
  { id: "LE-502", date: "2026-11-12", description: "Kaveri Paper — INV KP/26-27/0877 paid via NEFT", account: "Bank — HDFC Current", debit: 0, credit: 86400 },
  { id: "LE-503", date: "2026-11-10", description: "Deccan Facility — INV DFM/26-27/1103 approved & posted", account: "Facility Expense", debit: 210300, credit: 0 },
  { id: "LE-504", date: "2026-11-10", description: "Deccan Facility — INV DFM/26-27/1103 approved & posted", account: "Accounts Payable", debit: 0, credit: 210300 },
  { id: "LE-505", date: "2026-11-09", description: "TechServe — INV TS/26-27/0891 auto-approved & posted", account: "Software Subscription", debit: 542000, credit: 0 },
  { id: "LE-506", date: "2026-11-09", description: "TechServe — INV TS/26-27/0891 auto-approved & posted", account: "Accounts Payable", debit: 0, credit: 542000 },
];

/** Money movement, last 30 days (weekly buckets, demo series). */
export const moneyMovement = {
  labels: ["19 Oct", "26 Oct", "02 Nov", "09 Nov", "15 Nov"],
  moneyIn: [420000, 380000, 510000, 465000, 390000],
  moneyOut: [310000, 295000, 402000, 355000, 298000],
};

export const dashboard = {
  pendingApprovalTotal: 652370,
  pendingApprovalCount: 4,
  cashPosition: 4820500,
  moneyIn30d: 2165000,
  moneyOut30d: 1660000,
  exceptions: { outstanding: 5, overdue: 1, dueSoon: 2 },
  pipeline: { open: 12, paid: 12, overdue: 4, openValue: 1230000, paidValue: 600000, overdueValue: 95000 },
};

export const evalMetrics = {
  extractionAccuracy: 96.4,
  extractionDocs: 181,
  matchRate: 91.2,
  autoApproveRate: 68.5,
  falseApproveRate: 0.0,
  medianCycleHours: 7.4,
  moneyCaughtInExceptions: 652370,
  evalRun: "2026-11-14 · synthetic corpus (seeded, 500 invoices) + HF invoice-extraction-benchmark (181 docs)",
};

export function getInvoice(id: string): Invoice | undefined {
  return invoices.find((inv) => inv.id === id);
}

export function getVendor(id: string): Vendor | undefined {
  return vendors.find((v) => v.id === id);
}
