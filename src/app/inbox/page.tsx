"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BackendBanner, Card, CardHeader, EmptyState, LiveTag, Skeleton, StatusPill } from "@/components/ui";
import { formatDate, money } from "@/lib/format";
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
  const invoices = invList.data ?? [];

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
            Upload invoices, POs and receipts — agents extract, match and queue them. If extraction fails, the
            invoice is parked with the real reason shown on its detail page, where you can retry it.
          </p>
        </div>
        {invList.data !== null && <LiveTag />}
      </div>

      {invList.error !== null && (
        <BackendBanner message={`Invoices could not be loaded. ${invList.error}`} onRetry={invList.refresh} />
      )}

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
          className={`m-5 flex flex-col items-center justify-center rounded-card border border-dashed px-6 py-12 text-center transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none ${
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
                <Link
                  href={`/invoices/${inv.id}`}
                  className="flex-1 font-medium text-primary transition-colors duration-150 ease-out hover:text-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
                >
                  {inv.invoice_number || shortId(inv.id)}
                </Link>
                <StatusPill status={inv.status} />
                <span className="text-xs text-muted">
                  Uploaded — the pipeline runs in the background; open the invoice to follow it
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Recently received" action={invList.data !== null ? <LiveTag /> : undefined} />
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
              {invList.loading ? (
                [0, 1, 2, 3].map((i) => (
                  <tr key={i} className="border-t border-hairline" aria-hidden="true">
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </td>
                    <td className="px-3 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                  </tr>
                ))
              ) : invList.error !== null ? (
                <tr className="border-t border-hairline">
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-amber-700">
                    Invoices could not be loaded. {invList.error}
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr className="border-t border-hairline">
                  <td colSpan={6} className="px-3 py-4">
                    <EmptyState
                      title="No invoices yet"
                      body="Upload your first invoice above — the agents will extract, match and queue it."
                    />
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-t border-hairline transition-colors duration-150 ease-out hover:bg-slate-50 motion-reduce:transition-none"
                  >
                    <td className="px-3 py-3">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="font-medium text-primary transition-colors duration-150 ease-out hover:text-primary-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
                      >
                        {shortId(inv.id)}
                      </Link>
                      <span className="block text-xs text-muted">{inv.invoice_number || "—"}</span>
                    </td>
                    <td className="px-3 py-3 text-ink">{inv.vendor_name || "Unknown vendor"}</td>
                    <td className="px-3 py-3 text-muted tnum">{formatDate(inv.invoice_date)}</td>
                    <td className="px-3 py-3 text-muted tnum">{formatDate(inv.due_date ?? "")}</td>
                    <td className="px-3 py-3 text-right font-medium text-ink tnum">{money(inv.total, inv.currency)}</td>
                    <td className="px-3 py-3">
                      <StatusPill status={inv.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
