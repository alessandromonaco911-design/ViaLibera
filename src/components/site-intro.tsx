"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { INTRO_STORAGE_KEY, shouldShowIntro } from "@/lib/intro";

/**
 * First-visit site intro (session-scoped).
 *
 * A brief, branded animation on the very first page load of the browser
 * session: the VIA LIBERA logo travels down a minimal editorial "road",
 * stops at a red traffic light, the light turns green and the logo exits,
 * revealing the homepage. Runs once per browser session (sessionStorage,
 * never localStorage), skipped under prefers-reduced-motion, pure CSS.
 *
 * Development replay: `?intro=1` (NODE_ENV=development only) forces the
 * intro even when the session flag is set, without clearing the flag.
 */

const INTRO_EXIT_MS = 2050;
/** when the overlay is removed from the DOM (ms) */
const INTRO_TOTAL_MS = 2350;

export function SiteIntro() {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [replayDev, setReplayDev] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useLayoutEffect(() => {
    let seen = false;
    let reduce = false;
    let replay = false;
    try {
      seen = window.sessionStorage.getItem(INTRO_STORAGE_KEY) === "1";
    } catch {
      /* storage unavailable: treat as first visit */
    }
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* no matchMedia */
    }
    try {
      replay = new URLSearchParams(window.location.search).get("intro") === "1";
    } catch {
      /* ignore */
    }

    const isDev = process.env.NODE_ENV === "development";
    const show = shouldShowIntro({ seen, reduce, isDev, replay });
    if (!show) return;

    // dev replay marker (restores CSS animation durations under reduced motion)
    if (isDev && replay) {
      setReplayDev(true);
    }

    // mark the session flag only on a genuine first visit; a dev replay
    // never removes or overwrites the existing flag
    if (!seen) {
      try {
        window.sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    setVisible(true);
    timers.current.push(setTimeout(() => setExiting(true), INTRO_EXIT_MS));
    timers.current.push(setTimeout(() => setVisible(false), INTRO_TOTAL_MS));

    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`${exiting ? "site-intro-overlay site-intro-overlay--exit" : "site-intro-overlay"}${replayDev ? " site-intro-overlay--dev-replay" : ""}`}
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
