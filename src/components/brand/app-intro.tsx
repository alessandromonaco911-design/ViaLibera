"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Brand } from "./brand";
import styles from "./app-intro.module.css";

const playedKey = "vialibera:intro:traffic-light:v1";

/** Installed-app opening only; persistent layout keeps route changes and warm resumes instant. */
export function AppIntro({ children }: { children: ReactNode }) {
  const [playing, setPlaying] = useState(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    try { return !sessionStorage.getItem(playedKey); } catch { return true; }
  });
  useEffect(() => {
    if (!playing) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    try { sessionStorage.setItem(playedKey, "1"); } catch { /* Component lifetime still prevents navigation replays. */ }
    const finish = () => setPlaying(false);
    const timeout = window.setTimeout(finish, 1700);
    const onMotionChange = () => { if (reduced.matches) finish(); };
    const onVisibility = () => { if (document.hidden) finish(); };
    reduced.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timeout);
      reduced.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing]);

  return <>
    <div inert={playing} data-intro-content>{children}</div>
    {playing && <div className={styles.intro} data-app-intro onAnimationEnd={event => {
      if (event.target === event.currentTarget) setPlaying(false);
    }}>
      <div className={styles.content}>
        <div className={styles.logo}><Brand /></div>
        <svg className={styles.scene} viewBox="0 0 400 230" fill="none" aria-hidden="true">
          <path d="M0 195H400V226H0Z" fill="#111111" />
          <path d="M16 211H48M78 211H110M140 211H172M202 211H234M264 211H296M326 211H358M388 211H400" stroke="#f4f0e8" strokeWidth="4" strokeLinecap="round" />
          <path d="M306 195V225" stroke="#f4f0e8" strokeWidth="6" />
          <path d="M328 178V195" stroke="#111111" strokeWidth="7" />
          <rect x="307" y="64" width="42" height="114" rx="20" fill="#111111" />
          <circle cx="328" cy="86" r="12" fill="#444" />
          <circle data-intro-light="red" className={styles.red} cx="328" cy="86" r="12" fill="#f06467" />
          <circle cx="328" cy="121" r="12" fill="#444" />
          <circle cx="328" cy="156" r="12" fill="#444" />
          <circle data-intro-light="green" className={styles.green} cx="328" cy="156" r="12" fill="#bee3c2" />
          <g data-intro-car className={styles.car}>
            <g className={styles.body}>
              <path d="M102 169L115 138Q121 128 135 128H159Q170 128 179 139L197 159L211 163Q221 167 221 178V185H98V179Q98 173 102 169Z" fill="#a8def3" stroke="#111111" strokeWidth="4" strokeLinejoin="round" />
              <path d="M115 154L123 137H140V155ZM147 137H159Q166 137 171 145L179 155H147Z" fill="#ffe99a" stroke="#111111" strokeWidth="3" strokeLinejoin="round" />
              <path d="M101 174H108M211 174H219" stroke="#f4f0e8" strokeWidth="5" strokeLinecap="round" />
            </g>
            <circle cx="126" cy="184" r="13" fill="#111111" /><circle cx="126" cy="184" r="6" fill="#f4f0e8" />
            <circle cx="196" cy="184" r="13" fill="#111111" /><circle cx="196" cy="184" r="6" fill="#f4f0e8" />
          </g>
        </svg>
        <span className={styles.caption}>Rosso. Un attimo… verde!</span>
      </div>
      <button type="button" className={styles.skip} onClick={() => setPlaying(false)}>Entra subito →</button>
    </div>}
  </>;
}
