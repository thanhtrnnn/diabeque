import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Follow streaming content, but only while the reader is still at the bottom.
 *
 * The chat had no auto-scroll at all: a long answer grew below the fold and you
 * had to chase it by hand. The opposite mistake is worse — yanking the view down
 * while someone is reading further up — so following stops the moment the reader
 * scrolls away and resumes only when they come back or ask to.
 */
const NEAR_BOTTOM_PX = 96;

function scrollElementToBottom(node: HTMLElement, behavior: ScrollBehavior) {
  if (typeof node.scrollTo === "function") {
    node.scrollTo({ top: node.scrollHeight, behavior });
    return;
  }
  node.scrollTop = node.scrollHeight;
}

export function useStickToBottom(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);

  // The observer reads these without resubscribing on every change. Written in
  // an effect, not during render: a ref mutated while rendering is exactly the
  // kind of state React cannot see.
  const pinnedRef = useRef(pinned);
  const activeRef = useRef(active);
  useEffect(() => { pinnedRef.current = pinned; }, [pinned]);
  useEffect(() => { activeRef.current = active; }, [active]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const node = ref.current;
    if (!node) return;
    scrollElementToBottom(node, behavior);
    setPinned(true);
  }, []);

  /**
   * Bring an element to the top of the scrollport and KEEP following.
   *
   * Used when a question is sent: the reader wants to see what they just asked
   * at the top with the answer building underneath it.
   *
   * The first version of this turned following off, on the reasoning that the
   * reader is no longer at the bottom. That reasoning was wrong and it broke
   * the thing it was meant to serve: the answer then streamed off the bottom of
   * the screen with nothing chasing it. Anchoring is a deliberate move BY the
   * product, not the reader scrolling away, so it must not be read as "they
   * want to stay here". Only a scroll the reader performs turns following off.
   *
   * The two settle to the same place while the answer is short, because the
   * newest turn is a viewport tall: its top at the top of the scrollport is
   * also its bottom at the bottom. Once the answer outgrows that, following
   * keeps the tail visible, which is the point.
   */
  const anchorToTop = useCallback((node: HTMLElement | null) => {
    const container = ref.current;
    if (!container || !node) return;
    const top = container.scrollTop
      + node.getBoundingClientRect().top
      - container.getBoundingClientRect().top;
    if (typeof container.scrollTo === "function") container.scrollTo({ top, behavior: "smooth" });
    else container.scrollTop = top;
    setPinned(true);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    /**
     * Whether we are following is a fact about the CURRENT geometry, so it has
     * to be recomputed whenever the geometry changes — not only when the reader
     * scrolls. Deriving it from scroll events alone left it stale in the most
     * ordinary case there is: opening a conversation makes the content taller
     * while nobody scrolls, so the view sat at the top still believing it was
     * at the bottom, and the way back to the latest answer never appeared.
     */
    const measure = () => {
      const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
      setPinned(distance <= NEAR_BOTTOM_PX);
    };

    // A scroll the reader performed only ever ANSWERS the question "are we
    // following"; it must never trigger following, or scrolling up would be
    // undone the instant it happened.
    node.addEventListener("scroll", measure, { passive: true });
    measure();

    if (typeof ResizeObserver === "undefined") {
      return () => node.removeEventListener("scroll", measure);
    }
    // Content growing is the one case that may move the view — and only while
    // we are following. Catches growth no React state change reports: a late
    // calculation table, an image, a section opening, a conversation loading.
    const onResize = () => {
      if (pinnedRef.current && activeRef.current) scrollElementToBottom(node, "instant");
      measure();
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  return { ref, pinned, scrollToBottom, anchorToTop };
}
