import { test as base, expect } from "@playwright/test";

export { expect };
export type { Page } from "@playwright/test";

/**
 * Shared fixture for the existing E2E suites: the first-visit site intro is
 * session-scoped, so every test would trigger it and intercept clicks. This
 * fixture marks the session flag on the browser CONTEXT before any page is
 * created (no race on the first navigation), so the intro is always skipped.
 * The intro itself is tested in site-intro.spec.ts with the raw base test.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      try {
        window.sessionStorage.setItem("vialibera_intro_seen", "1");
      } catch {
        /* ignore */
      }
    });
    await use(context);
  },
});
