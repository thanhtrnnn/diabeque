import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/chat" }));

import { NavigationFeedback } from "@/components/product/navigation-feedback";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("NavigationFeedback", () => {
  it("stops its temporary progress cue when a navigation does not complete", () => {
    vi.useFakeTimers();
    const { container } = render(<NavigationFeedback />);
    const link = document.createElement("a");
    link.href = "/app/chat";
    link.textContent = "Mở trao đổi";
    link.addEventListener("click", (event) => event.preventDefault());
    document.body.append(link);

    // Let the mount/path effect finish before testing a new navigation.
    act(() => vi.runOnlyPendingTimers());
    fireEvent.click(link);
    expect(container.querySelector(".navigation-progress")).toHaveClass("is-active");

    act(() => vi.advanceTimersByTime(1_400));
    expect(container.querySelector(".navigation-progress")).not.toHaveClass("is-active");
  });
});
