import { createHash } from "node:crypto";

/** SHA-256 hex of a Buffer/Uint8Array. */
export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sha256File(path: string): Promise<string> {
  return import("node:fs/promises").then(async ({ readFile }) => {
    const buf = await readFile(path);
    return sha256(new Uint8Array(buf));
  });
}

/**
 * Content hash for a question record: covers statement, answer and image reference
 * so identical questions (with same image) dedupe across catalog versions.
 */
export function contentHash(statement: string, correctAnswer: boolean, imageRef: string | null): string {
  const norm = statement.replace(/\s+/g, " ").trim();
  return sha256(new TextEncoder().encode(`${norm}|${correctAnswer ? "V" : "F"}|${imageRef ?? "none"}`));
}
