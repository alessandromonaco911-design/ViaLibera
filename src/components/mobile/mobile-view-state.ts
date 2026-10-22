export const sections = ["home", "training", "exam"] as const;
export type MobileSection = typeof sections[number];
export interface MobileView {
  section: MobileSection; group: string | null; topicId: string | null; page: number; count: number; sessions: boolean;
}

export function readMobileView(fallback: MobileSection, topicId?: string): MobileView {
  const url = new URL(window.location.href);
  const section: MobileSection = url.pathname.startsWith("/allenamento") ? "training" : url.searchParams.get("sezione") === "esame" || url.hash === "#inizia" ? "exam" : url.pathname === "/" ? "home" : fallback;
  const count = Number(url.searchParams.get("domande"));
  const page = Number(url.searchParams.get("pagina"));
  return { section, group: url.searchParams.get("gruppo"), topicId: url.pathname.startsWith("/allenamento/argomento/") ? url.pathname.match(/^\/allenamento\/argomento\/([^/]+)$/)?.[1] ?? topicId ?? null : null,
    page: Number.isFinite(page) ? Math.max(0, Math.floor(page) - 1) : 0, count: [10, 20, 30].includes(count) ? count : 10,
    sessions: section === "home" && url.searchParams.get("sessioni") === "1" };
}

export function mobileViewUrl(view: MobileView): string {
  if (view.section === "home") return view.sessions ? "/?sessioni=1" : "/";
  if (view.section === "exam") return "/?sezione=esame";
  const query = new URLSearchParams();
  if (view.group) query.set("gruppo", view.group);
  if (view.page) query.set("pagina", String(view.page + 1));
  if (view.topicId) query.set("domande", String(view.count));
  const route = view.topicId ? `/allenamento/argomento/${encodeURIComponent(view.topicId)}` : "/allenamento";
  return route + (query.size ? `?${query}` : "");
}
