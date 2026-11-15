/**
 * Shared constants for the reload-flash suite (tests/reload-flash.spec.ts).
 * The temp DB path must match playwright.reload.config.ts.
 */
export const TEST_DB_PATH = "/tmp/elric-playwright-test/elric-playwright.db";
export const TEST_DATABASE_URL = `sqlite:///${TEST_DB_PATH}`;
export const BACKEND_URL = "http://127.0.0.1:8001";

/** Dummy values that must NEVER appear in the DOM, even for one frame. */
export const FORBIDDEN = ["acme", "inv-2481", "184620", "482500", "53690"];

export function forbiddenFound(text: string): string[] {
  const lower = text.toLowerCase();
  return FORBIDDEN.filter((f) => lower.includes(f));
}

/** Minimal valid PDF bytes — a real document for the real upload endpoint. */
export function minimalPdf(): Buffer {
  return Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
      "4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 72 720 Td (TAX INVOICE) Tj ET\nendstream endobj\n" +
      "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
      "trailer<</Root 1 0 R>>\n%%EOF\n",
    "utf8",
  );
}
