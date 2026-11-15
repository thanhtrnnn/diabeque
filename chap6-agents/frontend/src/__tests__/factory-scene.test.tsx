import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FactoryScene } from "@/components/factory/scene";
import { initialRunState } from "@/lib/factory/run-state";

describe("FactoryScene without WebGL", () => {
  it("shows the Vietnamese fallback with a link to the architecture page", async () => {
    // jsdom has no WebGLRenderingContext and canvas.getContext returns null.
    expect(typeof (window as { WebGLRenderingContext?: unknown }).WebGLRenderingContext).toBe("undefined");
    render(<FactoryScene state={initialRunState()} selected={null} onSelect={vi.fn()} reducedMotion={false} />);

    expect(await screen.findByText(/Trình duyệt không hỗ trợ WebGL/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kiến trúc/ })).toHaveAttribute("href", "/app/kien-truc");
  });
});
