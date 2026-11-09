"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const NAVIGATION_FEEDBACK_MAX_MS = 1_400;

export function NavigationFeedback() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const fallbackTimer = useRef<number | null>(null);

  function clearFallbackTimer() {
    if (fallbackTimer.current === null) return;
    window.clearTimeout(fallbackTimer.current);
    fallbackTimer.current = null;
  }

  useEffect(() => {
    clearFallbackTimer();
    const frame = window.requestAnimationFrame(() => setActive(false));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => () => clearFallbackTimer(), []);

  useEffect(() => {
    function markNavigation(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (destination.origin !== current.origin || `${destination.pathname}${destination.search}` === `${current.pathname}${current.search}`) return;
      setActive(true);
      // A route update normally clears this immediately. If it cannot finish,
      // feedback must still end rather than leaving an infinite activity cue.
      clearFallbackTimer();
      fallbackTimer.current = window.setTimeout(() => {
        fallbackTimer.current = null;
        setActive(false);
      }, NAVIGATION_FEEDBACK_MAX_MS);
    }

    document.addEventListener("click", markNavigation, true);
    return () => document.removeEventListener("click", markNavigation, true);
  }, []);

  return <div className={active ? "navigation-progress is-active" : "navigation-progress"} aria-hidden="true"><span /></div>;
}
