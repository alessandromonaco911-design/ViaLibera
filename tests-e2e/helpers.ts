import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

/** Load .env (Node 20.12+). */
export function loadEnv(): void {
  const envFile = join(process.cwd(), ".env");
  try {
    const raw = readFileSync(envFile, "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* .env optional */
  }
}

export const BASE = "http://127.0.0.1:3210";

export interface CreatedExam {
  sessionId: string;
  version: number;
  startedAt: string;
  expiresAt: string;
  questions: { id: string; position: number; statement: string; image: { url: string } | null }[];
}

/** Create a session tagged environment=test via the public API. */
export async function createSession(page: Page, env = "test"): Promise<CreatedExam> {
  const res = await page.request.post(`${BASE}/api/exams`, {
    data: { environment: env },
    headers: { "Content-Type": "application/json" },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as CreatedExam & { error?: unknown };
  if (!body.sessionId) throw new Error(`create failed: ${JSON.stringify(body)}`);
  return body;
}

/** Direct DB connection for test-only session manipulation (expiry etc.). */
let sql: ReturnType<typeof postgres> | null = null;
export function db() {
  if (!sql) {
    loadEnv();
    sql = postgres(process.env.DATABASE_URL ?? "postgres://scuolaguida:dev_only_change_me@localhost:5433/scuolaguida");
  }
  return sql;
}

export async function backdateSession(sessionId: string, secondsAgo: number): Promise<void> {
  await db()`update exam_sessions set expires_at = now() - make_interval(secs => ${secondsAgo}) where id = ${sessionId}`;
}

export async function cleanupTestSessions(): Promise<void> {
  try {
    await db()`delete from exam_session_questions where session_id in (select id from exam_sessions where environment = 'test')`;
    await db()`delete from exam_sessions where environment = 'test'`;
  } catch {
    /* ignore */
  }
}

/** Go to a question by number using the header indicator. */
export async function expectPosition(page: Page, n: number, total = 30): Promise<void> {
  await expect(page.locator("header").getByText(new RegExp(`Domanda ${n} di ${total}`))).toBeVisible();
}

/** Wait until the client is hydrated (timer shows a real value) before keyboard interactions. */
export async function waitQuizReady(page: Page, position = 1): Promise<void> {
  await expectPosition(page, position);
  await page.waitForFunction(() => {
    const t = document.querySelector('[role="timer"]');
    return !!t && t.textContent !== null && t.textContent !== "—:—" && t.textContent !== "00:00";
  });
}

export const VERO_BTN = "button:has-text('VERO')";
export const FALSO_BTN = "button:has-text('FALSO')";

/** Answer VERO on the current question and verify NO navigation happens. */
export async function clickAnswerWithoutAdvance(page: Page, label: "VERO" | "FALSO"): Promise<void> {
  const btn = page.locator("button", { hasText: label });
  await btn.first().click();
  // feedback aria-live
  await expect(page.locator('[aria-live="polite"]').getByText("Risposta registrata")).toBeVisible();
  await expect(page.locator('[aria-live="polite"]').getByText("Risposta registrata")).toBeHidden({ timeout: 3000 });
}
