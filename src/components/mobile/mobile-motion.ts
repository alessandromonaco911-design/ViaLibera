import type { MobileView } from "./mobile-view-state";
import { sections } from "./mobile-view-state";

interface Options {
  viewport: HTMLElement; track: HTMLElement; snapshotClass: string;
  view: () => MobileView; commit: (view: MobileView) => void; busy: () => boolean;
}

/** Owns only transforms and inert snapshots. React continues to own every interactive view. */
export function createMobileMotion({ viewport, track, snapshotClass, view, commit, busy }: Options) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let animations: Animation[] = [], snapshot: HTMLElement | null = null, queued: (() => void) | null = null, generation = 0;
  let gesture: { id: number; x: number; y: number; axis: "x" | "y" | null; offset: number; samples: { x: number; t: number }[] } | null = null;
  let suppressUntil = 0;
  const translate = (x: number) => `translate3d(${x}px,0,0)`;
  const origin = () => -sections.indexOf(view().section) * viewport.clientWidth;
  function clean() {
    generation++; queued = null; animations.forEach(a => a.cancel()); animations = [];
    snapshot?.remove(); snapshot = null; track.style.removeProperty("transform");
    viewport.querySelectorAll<HTMLElement>("[data-motion-pane]").forEach(el => { el.style.removeProperty("transform"); el.removeAttribute("data-motion-pane"); });
    delete viewport.dataset.moving;
  }
  function run(element: HTMLElement, from: number, to: number, duration: number, velocity?: number, outgoing?: { node: HTMLElement; from: number; to: number }) {
    if (reduced.matches) { clean(); return; }
    const token = ++generation;
    viewport.dataset.moving = "true";
    const frames = (start: number, end: number) => velocity === undefined
      ? [{ transform: translate(start) }, { transform: translate(end) }]
      : Array.from({ length: 33 }, (_, i) => {
        const t = i / 32 * duration / 1000, delta = start - end, omega = 24;
        return { transform: translate(i === 32 ? end : end + (delta + (velocity * 1000 + omega * delta) * t) * Math.exp(-omega * t)), offset: i / 32 };
      });
    const options = { duration, easing: velocity === undefined ? "cubic-bezier(.25,1,.5,1)" : "linear", fill: "both" as const };
    const incoming = element.animate(frames(from, to), options);
    animations = [incoming];
    if (outgoing) animations.push(outgoing.node.animate(frames(outgoing.from, outgoing.to), options));
    void incoming.finished.then(() => { if (token !== generation) return; const next = queued; clean(); next?.(); }, () => {});
  }
  function focusHeading() {
    const heading = viewport.querySelector<HTMLElement>('[data-active="true"] h1, [data-active="true"] h2');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
  function go(next: MobileView) {
    if (busy()) return;
    const current = view();
    if (next.section === "progress" && current.section === "progress" && next.progressDetail !== current.progressDetail) {
      clean(); commit(next); focusHeading(); return;
    }
    if (next.section === current.section && next.group === current.group && next.topicId === current.topicId && next.page === current.page && next.sessions === current.sessions) {
      queued = null; if (next.count !== current.count) commit(next); return;
    }
    if (animations.length) { queued = () => go(next); return; }
    const previous = view();
    const full = next.section !== previous.section;
    const direction = full ? Math.sign(sections.indexOf(next.section) - sections.indexOf(previous.section))
      : next.sessions && !previous.sessions || next.topicId && !previous.topicId || next.group && !previous.group || next.page > previous.page ? 1 : -1;
    const width = viewport.clientWidth, oldOrigin = origin();
    const focusInside = viewport.contains(document.activeElement);
    clean();
    if (!full && !reduced.matches) {
      const active = viewport.querySelector<HTMLElement>('[data-active="true"]');
      if (active) {
        snapshot = active.cloneNode(true) as HTMLElement;
        snapshot.className += ` ${snapshotClass}`;
        snapshot.inert = true; snapshot.setAttribute("aria-hidden", "true");
        for (const node of [snapshot, ...snapshot.querySelectorAll<HTMLElement>("*")]) {
          node.removeAttribute("id");
          for (const name of node.getAttributeNames()) if (name.startsWith("data-")) node.removeAttribute(name);
        }
        viewport.appendChild(snapshot);
      }
    }
    commit(next);
    if (focusInside) focusHeading();
    if (full) run(track, oldOrigin, origin(), 300);
    else {
      const active = viewport.querySelector<HTMLElement>('[data-active="true"]');
      if (active) { active.dataset.motionPane = "true"; run(active, direction * width, 0, 220, undefined, snapshot ? { node: snapshot, from: 0, to: -direction * width } : undefined); }
    }
  }
  function cancel() {
    const g = gesture; gesture = null;
    if (g?.axis === "x") { suppressUntil = performance.now() + 100; run(track, origin() + g.offset, origin(), 340, 0); }
  }
  function down(e: PointerEvent) {
    if (e.button > 0 || busy()) return;
    if (gesture) { cancel(); return; }
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, offset: 0, samples: [{ x: e.clientX, t: performance.now() }] };
  }
  function move(e: PointerEvent) {
    const g = gesture; if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      g.axis = Math.abs(dx) > Math.abs(dy) * 1.25 ? "x" : "y";
      if (g.axis === "x") { clean(); try { viewport.setPointerCapture(e.pointerId); } catch {} }
    }
    if (g.axis !== "x") return;
    const width = viewport.clientWidth, index = sections.indexOf(view().section), target = index + (dx < 0 ? 1 : -1);
    g.offset = target >= 0 && target < sections.length ? Math.max(-width, Math.min(width, dx)) : dx * width * .24 / (width + .24 * Math.abs(dx));
    if (!reduced.matches) { track.style.transform = translate(origin() + g.offset); viewport.dataset.moving = "true"; }
    const now = performance.now(); g.samples.push({ x: e.clientX, t: now }); g.samples = g.samples.filter(sample => now - sample.t <= 100);
  }
  function up(e: PointerEvent) {
    const g = gesture; if (!g || g.id !== e.pointerId) return;
    if (!g.axis) move(e); gesture = null;
    if (g.axis !== "x") return;
    suppressUntil = performance.now() + 300;
    const dx = e.clientX - g.x, velocity = (e.clientX - g.samples[0].x) / Math.max(16, performance.now() - g.samples[0].t);
    const width = viewport.clientWidth, index = sections.indexOf(view().section), target = index + (dx < 0 ? 1 : -1);
    const from = origin() + g.offset;
    if (target >= 0 && target < sections.length && (Math.abs(dx) > width * .22 || Math.abs(dx) > 32 && Math.abs(velocity) > .45 && Math.sign(velocity) === Math.sign(dx))) {
      commit({ ...view(), section: sections[target] });
    }
    run(track, from, origin(), 400, velocity);
    try { if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId); } catch {}
  }
  const lost = (e: PointerEvent) => { if (e.target === viewport && !viewport.hasPointerCapture(e.pointerId) && gesture?.id === e.pointerId) cancel(); };
  const captureClick = (e: MouseEvent) => { if (performance.now() < suppressUntil) { e.preventDefault(); e.stopImmediatePropagation(); } };
  const reset = () => { gesture = null; clean(); };
  viewport.addEventListener("pointerdown", down); viewport.addEventListener("pointermove", move); viewport.addEventListener("pointerup", up);
  viewport.addEventListener("pointercancel", cancel); viewport.addEventListener("lostpointercapture", lost); viewport.addEventListener("click", captureClick, true);
  window.addEventListener("blur", cancel); window.addEventListener("resize", reset); reduced.addEventListener("change", reset);
  return { go, reset, destroy() {
    reset(); viewport.removeEventListener("pointerdown", down); viewport.removeEventListener("pointermove", move); viewport.removeEventListener("pointerup", up);
    viewport.removeEventListener("pointercancel", cancel); viewport.removeEventListener("lostpointercapture", lost); viewport.removeEventListener("click", captureClick, true);
    window.removeEventListener("blur", cancel); window.removeEventListener("resize", reset); reduced.removeEventListener("change", reset);
  } };
}
