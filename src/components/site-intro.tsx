"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * First-visit site intro (session-scoped).
 *
 * A brief, branded animation on the very first page load of the browser
 * session: the VIA LIBERA logo travels down a minimal editorial "road",
 * stops at a red traffic light, the light turns green and the logo exits,
 * revealing the homepage. Runs once per browser session (sessionStorage,
 * never localStorage), skipped under prefers-reduced-motion, pure CSS.
 */

const INTRO_STORAGE_KEY = "vialibera_intro_seen";
/** when the exit fade starts (ms) — must match the CSS animation length */
const INTRO_EXIT_MS = 2050;
/** when the overlay is removed from the DOM (ms) */
const INTRO_TOTAL_MS = 2350;

export function SiteIntro() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useLayoutEffect(() => {
    let seen = false;
    let reduce = false;
    try {
      seen = window.sessionStorage.getItem(INTRO_STORAGE_KEY) === "1";
    } catch {
      /* storage unavailable: keep intro */
    }
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* no matchMedia: keep intro */
    }

    // first visit of this browser session: mark immediately, then show
    if (!seen && !reduce) {
      try {
        window.sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
      setVisible(true);
      timers.current.push(setTimeout(() => setExiting(true), INTRO_EXIT_MS));
      timers.current.push(setTimeout(() => setVisible(false), INTRO_TOTAL_MS));
    }

    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={exiting ? "site-intro-overlay site-intro-overlay--exit" : "site-intro-overlay"}
      aria-hidden="true"
    >
      <div className="site-intro-stage">
        {/* minimal editorial road, seen from above */}
        <span className="site-intro-rail site-intro-rail--left" aria-hidden="true" />
        <span className="site-intro-rail site-intro-rail--right" aria-hidden="true" />
        <span className="site-intro-lane" aria-hidden="true" />

        {/* real VIA LIBERA logotype (same markup as the header) */}
        <div className="site-intro-logo" aria-hidden="true">
          <span>VIA</span>
          <span className="site-intro-libera">LIBERA</span>
        </div>

        {/* minimal traffic light, seen from above */}
        <div className="site-intro-light" aria-hidden="true">
          <span className="site-intro-bulb site-intro-bulb--red" />
          <span className="site-intro-bulb site-intro-bulb--yellow" />
          <span className="site-intro-bulb site-intro-bulb--green" />
        </div>
      </div>
    </div>
  );
}
