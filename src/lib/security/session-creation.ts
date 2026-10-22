import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "../db";

export const CREATION_COOKIE = "vialibera-device";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const policies = [
  { key: "global-day", seconds: 86400, limit: 300 },
  { key: "global-hour", seconds: 3600, limit: 60 },
  { key: "device", seconds: 600, limit: 8 },
] as const;

export class CreationLimitError extends Error {
  constructor(public retryAfter: number, public clientId: string) { super("creation limit reached"); }
}

/** Atomic across all server instances. A rejected attempt rolls back every budget increment. */
export async function consumeCreationBudget(clientId: string, options: { now?: number; scope?: string; limits?: readonly { key: string; seconds: number; limit: number }[] } = {}) {
  const now = options.now ?? Date.now();
  const device = createHash("sha256").update(clientId).digest("hex");
  await sql.begin(async tx => {
    for (const policy of options.limits ?? policies) {
      const start = Math.floor(now / (policy.seconds * 1000)) * policy.seconds * 1000;
      const end = start + policy.seconds * 1000;
      const key = `${options.scope ?? process.env.SESSION_CREATION_NAMESPACE ?? "creation"}:${policy.key === "device" ? device : policy.key}`;
      const rows = await tx`insert into session_creation_limits (key, window_start, attempts, expires_at)
        values (${key}, ${new Date(start).toISOString()}, 1, ${new Date(end).toISOString()})
        on conflict (key, window_start) do update set attempts = session_creation_limits.attempts + 1
        where session_creation_limits.attempts < ${policy.limit} returning attempts`;
      if (!rows.length) throw new CreationLimitError(Math.max(1, Math.ceil((end - now) / 1000)), clientId);
    }
  });
}

export async function reserveSessionCreation(request: Request) {
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${CREATION_COOKIE}=`))?.slice(CREATION_COOKIE.length + 1);
  const clientId = cookie && UUID.test(cookie) ? cookie.toLowerCase() : randomUUID();
  await consumeCreationBudget(clientId);
  return clientId;
}

export function withCreationCookie<T>(response: NextResponse<T>, clientId: string) {
  response.cookies.set(CREATION_COOKIE, clientId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function creationLimitResponse(error: unknown) {
  if (!(error instanceof CreationLimitError)) return null;
  const minutes = Math.ceil(error.retryAfter / 60);
  const wait = minutes < 60 ? `${minutes} min` : `${Math.ceil(minutes / 60)} h`;
  return withCreationCookie(NextResponse.json({ error: { code: "RATE_LIMITED", message: `Hai raggiunto il limite di nuovi quiz. Riprova tra ${wait}. Puoi continuare quelli già avviati.` } },
    { status: 429, headers: { "Retry-After": String(error.retryAfter) } }), error.clientId);
}
