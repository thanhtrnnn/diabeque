import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useStickToBottom } from "@/lib/stick-to-bottom";

function Harness() {
  const { ref, pinned, scrollToBottom } = useStickToBottom(true);
  return (
    <>
      <div data-testid="scroller" ref={ref}><p>nội dung</p></div>
      <span data-testid="pinned">{String(pinned)}</span>
      <button type="button" onClick={() => scrollToBottom()}>Xuống cuối</button>
    </>
  );
}

/** jsdom has no layout, so the scroll geometry has to be declared. */
function withGeometry(node: HTMLElement, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(node, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(node, "clientHeight", { value: clientHeight, configurable: true });
}

describe("stick to bottom", () => {
  it("stops following once the reader scrolls away, and resumes on request", () => {
    render(<Harness />);
    const scroller = screen.getByTestId("scroller");
    withGeometry(scroller, { scrollHeight: 1000, clientHeight: 400 });

    // At the bottom: following is on.
    scroller.scrollTop = 600;
    fireEvent.scroll(scroller);
    expect(screen.getByTestId("pinned")).toHaveTextContent("true");

    // Reader scrolls up to re-read something — dragging them back down mid
    // sentence is worse than not following at all.
    scroller.scrollTop = 120;
    fireEvent.scroll(scroller);
    expect(screen.getByTestId("pinned")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "Xuống cuối" }));
    expect(screen.getByTestId("pinned")).toHaveTextContent("true");
    expect(scroller.scrollTop).toBe(1000);
  });

  it("treats a small gap from the bottom as still following", () => {
    render(<Harness />);
    const scroller = screen.getByTestId("scroller");
    withGeometry(scroller, { scrollHeight: 1000, clientHeight: 400 });

    // 40px short of the end — a rounding gap, not a deliberate scroll away.
    scroller.scrollTop = 560;
    fireEvent.scroll(scroller);
    expect(screen.getByTestId("pinned")).toHaveTextContent("true");
  });

  it("notices it is no longer at the bottom when content grows underneath it", async () => {
    render(<Harness />);
    const scroller = screen.getByTestId("scroller");
    withGeometry(scroller, { scrollHeight: 200, clientHeight: 200 });
    fireEvent.scroll(scroller);
    expect(screen.getByTestId("pinned")).toHaveTextContent("true");

    // Opening a conversation makes the content far taller while nobody scrolls.
    // Deriving "are we following" from scroll events alone left this stale, so
    // the view sat at the top still believing it was at the bottom and the way
    // back to the latest answer never appeared.
    withGeometry(scroller, { scrollHeight: 2400, clientHeight: 200 });
    fireEvent.scroll(scroller);
    expect(screen.getByTestId("pinned")).toHaveTextContent("false");
  });
});
