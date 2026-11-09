import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/chat" }));

import { ProductShell } from "@/components/product/product-shell";

describe("ProductShell", () => {
  it("offers exactly the three sections, marking the current one", () => {
    render(<ProductShell current="graph"><p>nội dung</p></ProductShell>);
    const rail = screen.getAllByRole("navigation", { name: "Điều hướng chính" })[0];
    const links = within(rail).getAllByRole("link");
    expect(links.map((link) => [link.getAttribute("aria-label"), link.getAttribute("href")])).toEqual([
      ["Hỏi đáp", "/app/chat"],
      ["Đồ thị tri thức", "/app/do-thi"],
      ["Phân loại khảo sát", "/app/phan-loai"],
    ]);
    expect(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.getAttribute("aria-label"))).toEqual(["Đồ thị tri thức"]);
  });

  it("brands the product and has no account or login controls", () => {
    render(<ProductShell current="chat"><p>nội dung</p></ProductShell>);
    expect(screen.getByText("Tra cứu Đái tháo đường")).toBeVisible();
    expect(screen.getByText("ĐTĐ")).toBeInTheDocument();
    expect(screen.queryByText(/đăng (nhập|xuất)/i)).toBeNull();
    expect(screen.getByRole("main")).toHaveTextContent("nội dung");
  });
});
