import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/chat" }));

import { ProductShell } from "@/components/product/product-shell";

describe("ProductShell", () => {
  it("offers exactly the six sections, marking the current one", () => {
    render(<ProductShell current="graph"><p>nội dung</p></ProductShell>);
    const rail = screen.getAllByRole("navigation", { name: "Điều hướng chính" })[0];
    const links = within(rail).getAllByRole("link");
    expect(links.map((link) => [link.getAttribute("aria-label"), link.getAttribute("href")])).toEqual([
      ["Hỏi đáp", "/app/chat"],
      ["Kiến trúc", "/app/kien-truc"],
      ["Nhà máy", "/app/nha-may"],
      ["Đồ thị tri thức", "/app/do-thi"],
      ["Phân loại khảo sát", "/app/phan-loai"],
      ["Ôn vấn đáp", "/app/on-tap"],
    ]);
    expect(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.getAttribute("aria-label"))).toEqual(["Đồ thị tri thức"]);
  });

  it("marks the architecture page as current", () => {
    render(<ProductShell current="architecture"><p>nội dung</p></ProductShell>);
    const rail = screen.getAllByRole("navigation", { name: "Điều hướng chính" })[0];
    expect(within(rail).getByRole("link", { name: "Kiến trúc" })).toHaveAttribute("aria-current", "page");
  });

  it("links the factory from the rail and the mobile bar, marking it current", () => {
    render(<ProductShell current="factory"><p>nội dung</p></ProductShell>);
    const rail = screen.getAllByRole("navigation", { name: "Điều hướng chính" })[0];
    expect(within(rail).getByRole("link", { name: "Nhà máy" })).toHaveAttribute("href", "/app/nha-may");
    expect(within(rail).getByRole("link", { name: "Nhà máy" })).toHaveAttribute("aria-current", "page");
    // The mobile bar is display:none at jsdom's default width; it is still in the tree.
    const mobile = document.querySelector("nav[aria-label='Điều hướng chính trên mobile']");
    expect(mobile?.querySelector("a[aria-label='Nhà máy']")).toHaveAttribute("href", "/app/nha-may");
  });

  it("brands the product and has no account or login controls", () => {
    render(<ProductShell current="chat"><p>nội dung</p></ProductShell>);
    expect(screen.getByText("Diabeque")).toBeVisible();
    expect(screen.getByText("Trợ lý đa agent sàng lọc và tư vấn đái tháo đường")).toBeVisible();
    const mark = document.querySelector("img[src*='diabeque-mark']");
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute("alt", "");
    expect(screen.queryByText(/đăng (nhập|xuất)/i)).toBeNull();
    expect(screen.getByRole("main")).toHaveTextContent("nội dung");
  });
});
