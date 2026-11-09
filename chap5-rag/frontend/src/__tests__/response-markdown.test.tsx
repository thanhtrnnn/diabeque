import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { citationMarker, ResponseMarkdown } from "@/components/product/response-markdown";

describe("ResponseMarkdown", () => {
  it("renders paragraphs, bold, italic and inline code", () => {
    const { container } = render(<ResponseMarkdown content={"Insulin giúp **hạ đường huyết**, xem *HbA1c* và `mg/dL`.\n\nĐoạn hai."} />);
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("hạ đường huyết");
    expect(container.querySelector("em")?.textContent).toBe("HbA1c");
    expect(container.querySelector("code")?.textContent).toBe("mg/dL");
  });

  it("builds bullet and numbered lists and keeps list kinds apart", () => {
    const { container } = render(<ResponseMarkdown content={"- Rau xanh\n- Ngũ cốc nguyên hạt\n1. Đo đường huyết\n2) Ghi lại kết quả"} />);
    expect([...container.querySelectorAll("ul > li")].map((li) => li.textContent)).toEqual(["Rau xanh", "Ngũ cốc nguyên hạt"]);
    expect([...container.querySelectorAll("ol > li")].map((li) => li.textContent)).toEqual(["Đo đường huyết", "Ghi lại kết quả"]);
  });

  it("renders headings", () => {
    render(<ResponseMarkdown content={"## Chế độ ăn\nNên ăn đủ chất."} />);
    expect(screen.getByRole("heading", { name: "Chế độ ăn" })).toBeVisible();
  });

  it("links only http(s) URLs", () => {
    const { container } = render(<ResponseMarkdown content={"[WHO](https://who.int) và [bẫy](javascript:alert(1))"} />);
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://who.int/");
    expect(container.textContent).toContain("[bẫy](javascript:alert(1))");
  });

  it("leaves unfinished markers literal while text is still streaming", () => {
    const { container } = render(<ResponseMarkdown content="Nên **uống đủ" />);
    expect(container.textContent).toBe("Nên **uống đủ");
  });

  it("renders citation markers in place, inside paragraphs, list items and bold text", () => {
    const chip = (label: number, key: string) => <button type="button" key={key}>[{label}]</button>;
    const content = `Nên ăn rau ${citationMarker(1)}. Còn **đạm nạc ${citationMarker(2)}** nữa.\n\n- Cá ${citationMarker(1)}\n- Trứng`;
    const { container } = render(<ResponseMarkdown content={content} renderCitation={chip} />);
    const [first] = container.querySelectorAll("p");
    expect(first.textContent).toBe("Nên ăn rau [1]. Còn đạm nạc [2] nữa.");
    expect(first.querySelectorAll("button")).toHaveLength(2);
    expect(first.querySelector("strong button")?.textContent).toBe("[2]");
    const items = container.querySelectorAll("li");
    expect(items[0].querySelector("button")?.textContent).toBe("[1]");
    expect(items[1].querySelector("button")).toBeNull();
  });

  it("keeps text before and after a citation in one paragraph", () => {
    const { container } = render(<ResponseMarkdown content={`A ${citationMarker(1)}. B ${citationMarker(2)}.`} renderCitation={(n, key) => <b key={key}>{n}</b>} />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });

  it("leaves markers literal when no renderer is given", () => {
    const { container } = render(<ResponseMarkdown content={`A ${citationMarker(1)}`} />);
    expect(container.querySelector("p")?.textContent).toContain("\uE000");
  });
});
