/**
 * Playwright global setup for the reload-flash suite.
 *
 * ONLY creates the temp-DB directory. It must NOT delete the DB file:
 * Playwright starts the webServers BEFORE it runs globalSetup, so by the
 * time this runs the backend has already created the DB and is serving
 * from it — wiping the file here unlinks the live database and every
 * backend write after that fails "attempt to write a readonly database"
 * (proven with strace 2026-11-15: globalSetup ran ~17s after the
 * backend's first journal write and unlinked the live file, failing
 * every run's beforeAll register). The wipe lives in the backend's
 * webServer command in playwright.reload.config.ts instead, where it
 * runs before uvicorn starts and the file is created.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { TEST_DB_PATH } from "./test-config";

export default function globalSetup(): void {
  const dir = path.dirname(TEST_DB_PATH);
  fs.mkdirSync(dir, { recursive: true });
}
