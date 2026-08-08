/**
 * Intro visibility decision (pure, testable).
 *
 * Production behaviour (never changed):
 *  - shown once per browser session (flag stored in sessionStorage);
 *  - refresh/navigation in the same session skip it;
 *  - prefers-reduced-motion always skips it.
 *
 * Development convenience:
 *  - `?intro=1` in the URL forces the intro even if the session flag is set,
 *    WITHOUT removing or clearing the flag. Only active when NODE_ENV is
 *    "development"; completely ignored in production.
 */

export const INTRO_STORAGE_KEY = "vialibera_intro_seen";

export interface IntroDecisionInput {
  /** sessionStorage flag already set ("1") */
  seen: boolean;
  /** prefers-reduced-motion active */
  reduce: boolean;
  /** process.env.NODE_ENV === "development" */
  isDev: boolean;
  /** URL query `?intro=1` present */
  replay: boolean;
}

export function shouldShowIntro({ seen, reduce, isDev, replay }: IntroDecisionInput): boolean {
  // development replay: force the intro even if already seen this session
  // AND even under prefers-reduced-motion, so the animation can be inspected
  if (isDev && replay) return true;
  if (reduce) return false;
  return !seen;
}
