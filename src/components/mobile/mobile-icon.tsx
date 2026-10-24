import type { ReactNode } from "react";

const shapes: Record<string, ReactNode> = {
  progress: <><path d="M4 20V12h3v8M11 20V7h3v13M18 20V3h3v17"/></>,
  target: <><circle cx="11" cy="13" r="9"/><circle cx="11" cy="13" r="5"/><path d="m11 13 10-10M16 3h5v5"/></>,
  home: <><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></>,
  training: <><path d="m12 3 10 5-10 5L2 8Z"/><path d="M6 10v7l6 4 6-4v-7M22 8v9"/></>,
  exam: <><rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2h6v4H9zM9 11h6M9 15h6M9 19h3"/></>,
  signals: <><path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3v.1"/></>,
  road: <path d="m7 3-4 18M17 3l4 18M12 3v4m0 3v4m0 3v4"/>,
  car: <><path d="m5 8 2-5h10l2 5M4 8h16v11H4zM4 13h16M7 19v2m10-2v2M7 11h1m8 0h1"/></>,
  safety: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/></>,
  licence: <><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M5 16v-1c0-3 6-3 6 0v1m3-6h5m-5 4h5"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>, back: <path d="M20 12H4m6-6-6 6 6 6"/>, chevron: <path d="m9 5 7 7-7 7"/>,
  delete: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>,
  divieto: <><circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/></>,
  obbligo: <><circle cx="12" cy="12" r="9"/><path d="M12 18V6m-4 4 4-4 4 4"/></>,
  precedenza: <path d="M2 3h20L12 21Z"/>, markings: <path d="M3 4h18M3 9h18M3 14h18M3 19h18"/>,
  lights: <><rect x="7" y="2" width="10" height="20" rx="2"/><circle cx="12" cy="6" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="18" r="1"/></>,
  info: <><rect x="3" y="3" width="18" height="18"/><path d="M12 11v6m0-10v.1"/></>,
};
const topicIcons: Record<string, string> = { "4056": "signals", "4149": "divieto", "4185": "obbligo", "4193": "precedenza", "4236": "markings", "4266": "lights", "4326": "info", "4348": "signals", "4373": "licence" };
export function MobileIcon({ name, topicCode }: { name: string; topicCode?: string }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[(topicCode && topicIcons[topicCode]) || name] ?? shapes.training}</svg>;
}
