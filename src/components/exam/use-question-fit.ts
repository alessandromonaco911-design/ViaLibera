"use client";

import { useLayoutEffect, useRef } from "react";

/** Fit actual glyphs, including bold reading cues, not just an estimated character width. */
export function useQuestionFit(statement: string, illustrated: boolean) {
  const layoutRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const layout = layoutRef.current;
    const title = titleRef.current;
    if (!layout || !title) return;
    let frame = 0;
    const fit = () => {
      if (window.innerWidth >= 1024) {
        title.style.removeProperty("font-size");
        return;
      }
      const card = layout.querySelector<HTMLElement>(".quiz-question")!;
      const position = layout.querySelector<HTMLElement>(".quiz-position")!;
      const landscape = window.innerWidth >= 560 && window.innerHeight <= 500;
      let available: number;
      if (landscape) {
        const response = layout.querySelector<HTMLElement>(".quiz-response")!;
        available = response.getBoundingClientRect().top - title.getBoundingClientRect().top - 8;
      } else {
        const style = getComputedStyle(card);
        const stage = layout.closest("main")!;
        const stageStyle = getComputedStyle(stage);
        const response = layout.querySelector<HTMLElement>(".quiz-response")!;
        const body = stage.clientHeight - parseFloat(stageStyle.paddingTop) - parseFloat(stageStyle.paddingBottom)
          - response.offsetHeight - 8 - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - position.offsetHeight - 8;
        // Preserve a useful image area; text-only questions can use most of the card.
        available = illustrated ? Math.min(body * .55, body - 64) : body * .85;
      }
      const width = title.clientWidth;
      if (width <= 0 || available <= 0) return;
      const minimum = landscape ? 16 : window.innerHeight <= 700 ? 18 : 20;
      const maximum = landscape ? 24 : illustrated
        ? Math.max(22, 34 - statement.length / 28)
        : Math.max(28, 48 - statement.length / 24);
      // Character count supplies the first estimate; actual line wrapping decides the final size.
      let low = minimum;
      let high = Math.min(maximum, Math.max(minimum, Math.sqrt(width * available / (Math.max(1, statement.length) * .5 * 1.3))));
      // Measure outside the flex/grid layout so its sizing cannot constrain the measurement.
      const measure = title.cloneNode(true) as HTMLElement;
      measure.removeAttribute("id");
      measure.setAttribute("aria-hidden", "true");
      const typography = getComputedStyle(title);
      Object.assign(measure.style, {
        position: "fixed", left: "-10000px", top: "0", visibility: "hidden",
        width: `${width}px`, maxWidth: "none", height: "auto", margin: "0",
        fontFamily: typography.fontFamily, fontWeight: typography.fontWeight,
        lineHeight: String(parseFloat(typography.lineHeight) / parseFloat(typography.fontSize)),
      });
      document.body.appendChild(measure);
      for (let i = 0; i < 9; i++) {
        const size = (low + high) / 2;
        measure.style.fontSize = `${size}px`;
        if (measure.getBoundingClientRect().height <= available && measure.scrollWidth <= width + 1) low = size;
        else high = size;
      }
      measure.remove();
      let finalSize = Math.floor(low * 10) / 10;
      title.style.fontSize = `${finalSize}px`;
      // Final guard in the real layout, after applying the candidate size.
      while (finalSize > minimum && title.getBoundingClientRect().height > available + 1) {
        finalSize = Math.max(minimum, finalSize - .5);
        title.style.fontSize = `${finalSize}px`;
      }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    const observer = new ResizeObserver(schedule);
    observer.observe(layout);
    const response = layout.querySelector(".quiz-response");
    if (response) observer.observe(response);
    window.addEventListener("resize", schedule);
    let active = true;
    void document.fonts.ready.then(() => { if (active) schedule(); });
    fit();
    return () => { active = false; cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule); };
  }, [statement, illustrated]);
  return { layoutRef, titleRef };
}
