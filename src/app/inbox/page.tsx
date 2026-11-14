"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BackendBanner, Card, CardHeader, LiveTag, MockTag, StatusPill } from "@/components/ui";
import { invoices as mockInvoices, type InvoiceStatus } from "@/lib/mock-data";
import { formatDate, inr } from "@/lib/format";
import { ApiError, listInvoices, uploadInvoice, useApi, type ApiInvoice } from "@/lib/api";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // backend limit (routes.py)

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export default function InboxPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<ApiInvoice[]>([]);

  const invList = useApi(listInvoices);
  const live = invList.data !== null;

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError(null);
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        setUploadError(`"${file.name}" exceeds the 20 MB backend limit.`);
        continue;
      }
      setUploading(true);
      try {
        const inv = await uploadInvoice(file);
        setUploaded((prev) => [inv, ...prev]);
        invList.refresh();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setUploadError(`"${file.name}" was already uploaded — ${e.message}.`);
        } else if (e instanceof ApiError && e.status === 415) {
          setUploadError(`"${file.name}": ${e.message}.`);
        } else {
          setUploadError(e instanceof Error ? e.message : "Upload failed.");
        }
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold leading-8 text-ink">Inbox</h1>
          <p className="mt-1 text-sm text-muted">
            Upload invoices, POs and receipts — agents extract, match and queue them. Without a Gemini key
            configured the backend parks uploads as flagged (extraction unavailable) — nothing is faked.
          </p>
        </div>
        {live ? <LiveTag /> : <MockTag />}
      </div>

      {invList.error !== null && <BackendBanner onRetry={invList.refresh} />}

      <Card className="mt-5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void onFiles(e.dataTransfer.files);
          }}
          className={`m-5 flex flex-col items-center justify-center rounded-card border border-dashed px-6 py-12 text-center ${
            dragOver ? "border-primary bg-primary-soft" : "border-hairline bg-page"
          } cursor-pointer`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary-dark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="m17 8-5-5-5 5" />
              <path d="M12 3v12" />
            </svg>
          </span>
          <p className="mt-3 text-sm font-medium text-ink">Drop invoice PDFs here, or click to browse</p>
          <p className="mt-1 text-xs text-muted">
            PDF, PNG or JPG · up to 20 MB per file · uploads go to POST /api/invoices/upload
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </div>
        {uploading && (
          <p className="mx-5 mb-5 text-sm text-muted">Uploading — the backend pipeline runs in the background…</p>
        )}
        {uploadError && (
          <p className="mx-5 mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {uploadError}
          </p>
        )}
        {uploaded.length > 0 && (
          <ul className="mx-5 mb-5 space-y-2">
            {uploaded.map((inv) => (
              <li key={inv.id} className="flex items-center gap-2 rounded-lg border border-hairline bg-white px-3 py-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber" />
                <Link href={`/invoices/${inv.id}`} className="flex-1 font-medium text-primary hover:text-primary-dark">
                  {inv.invoice_number || shortId(inv.id)}
                </Link>
                <StatusPill status={inv.status as InvoiceStatus} />
                <span className="text-xs text-muted">
                  Extraction parked — no Gemini key on the backend; flagged for human review
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Recently received" action={live ? <LiveTag /> : <MockTag />} />
        <div className="overflow-x-auto px-2 pb-2 pt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium">Vendor</th>
                <th className="px-3 py-2 font-medium">Received</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {live
                ? (invList.data ?? []).map((inv) => (
                    <tr key={inv.id} className="border-t border-hairline">
                      <td className="px-3 py-3">
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-primary hover:text-primary-dark">
                          {shortId(inv.id)}
                        </Link>
                        <span className="block text-xs text-muted">{inv.invoice_number || "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-ink">{inv.vendor_name || "Unknown vendor"}</td>
                      <td className="px-3 py-3 text-muted tnum">{formatDate(inv.invoice_date)}</td>
                      <td className="px-3 py-3 text-muted tnum">{formatDate(inv.due_date ?? "")}</td>
                      <td className="px-3 py-3 text-right font-medium text-ink tnum">{inr(inv.total)}</td>
                      <td className="px-3 py-3">
                        <StatusPill status={inv.status as InvoiceStatus} />
                      </td>
                    </tr>
                  ))
                : mockInvoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-hairline">
                      <td className="px-3 py-3">
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-primary hover:text-primary-dark">
                          {inv.id}
                        </Link>
                        <span className="block text-xs text-muted">{inv.number}</span>
                      </td>
                      <td className="px-3 py-3 text-ink">{inv.vendor}</td>
                      <td className="px-3 py-3 text-muted tnum">{formatDate(inv.invoiceDate)}</td>
                      <td className="px-3 py-3 text-muted tnum">{formatDate(inv.dueDate)}</td>
                      <td className="px-3 py-3 text-right font-medium text-ink tnum">{inr(inv.amount)}</td>
                      <td className="px-3 py-3">
                        <StatusPill status={inv.status} />
                      </td>
                    </tr>
                  ))}
              {live && (invList.data ?? []).length === 0 && (
                <tr className="border-t border-hairline">
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">
                    No invoices in the backend yet — upload one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
