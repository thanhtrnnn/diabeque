import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SurveyClassifier } from "@/components/product/survey-classifier";
import { featuresFixture, json, status3Result } from "@/test/survey-fixtures";

afterEach(() => vi.unstubAllGlobals());

function stubBackend(result = status3Result) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => (url === "/api/classify/features" ? json(featuresFixture) : json(result)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const classifyBodies = (fetchMock: ReturnType<typeof stubBackend>) =>
  fetchMock.mock.calls.filter(([url]) => url === "/api/classify").map(([, init]) => JSON.parse(String(init?.body)));

describe("SurveyClassifier form", () => {
  it("renders each field as the control its kind and options call for", async () => {
    stubBackend();
    render(<SurveyClassifier />);

    expect(await screen.findByRole("checkbox", { name: "Huyết áp cao" })).not.toBeChecked();
    const bmi = screen.getByRole("spinbutton", { name: "Chỉ số khối cơ thể (BMI)" });
    expect(bmi).toHaveAttribute("min", "10");
    expect(bmi).toHaveAttribute("max", "100");
    const age = screen.getByRole("combobox", { name: "Nhóm tuổi" });
    expect(within(age).getAllByRole("option").map((o) => o.textContent)).toEqual(["Để trống (dùng trung vị)", "55-59", "60-64", "65-69"]);
    const sex = screen.getByRole("combobox", { name: "Giới tính" });
    expect(within(sex).getAllByRole("option").map((o) => [o.getAttribute("value"), o.textContent])).toEqual([["", "Để trống (dùng trung vị)"], ["0", "Nữ"], ["1", "Nam"]]);
  });

  it("fills the example profile, classifies it and shows label, probabilities, caveat and the chat hand-off", async () => {
    const fetchMock = stubBackend();
    const user = userEvent.setup();
    render(<SurveyClassifier />);

    await user.click(await screen.findByRole("button", { name: "Hồ sơ minh họa" }));
    expect(screen.getByRole("spinbutton", { name: "Chỉ số khối cơ thể (BMI)" })).toHaveValue(40);
    expect(screen.getByRole("combobox", { name: "Nhóm tuổi" })).toHaveValue("9");
    expect(screen.getByRole("checkbox", { name: "Huyết áp cao" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Phân loại hồ sơ" }));

    expect(await screen.findByRole("heading", { name: "Báo cáo mắc đái tháo đường" })).toBeVisible();
    expect(classifyBodies(fetchMock)).toEqual([{ task: "status3", features: { HighBP: 1, BMI: 40, GenHlth: 4, Sex: 0, Age: 9 } }]);
    const probabilities = screen.getByRole("list", { name: "Xác suất đã hiệu chỉnh theo từng nhóm" });
    expect(within(probabilities).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Không báo cáo mắc bệnh6,2%",
      "Tiền đái tháo đường30,2%",
      "Báo cáo mắc đái tháo đường63,6%",
    ]);
    expect(screen.getByText("Kết quả dựa trên khảo sát tự báo cáo BRFSS, không phải chẩn đoán. Hãy hỏi ý kiến bác sĩ.")).toBeVisible();
    const link = screen.getByRole("link", { name: /Tra cứu theo chủ đề này/ });
    const url = new URL(link.getAttribute("href") ?? "", "http://localhost");
    expect([url.pathname, url.searchParams.get("topic"), url.searchParams.get("q")]).toEqual([
      "/app/chat", "diabetes_general", "Người bệnh đái tháo đường nên ăn uống và sinh hoạt thế nào?",
    ]);
  });

  it("switches to the type 1 / type 2 task, clears the old result and submits that task", async () => {
    const fetchMock = stubBackend({ label: 2, label_name: "Type 2", probs: { "1": 0.2, "2": 0.8 }, topic: "type2" });
    const user = userEvent.setup();
    render(<SurveyClassifier />);

    await user.click(await screen.findByRole("button", { name: "Phân loại hồ sơ" }));
    await screen.findByRole("heading", { name: "Type 2" });
    await user.click(screen.getByRole("tab", { name: "Type 1 / Type 2" }));

    expect(screen.queryByRole("heading", { name: "Type 2" })).toBeNull();
    expect(screen.getByText(/Chỉ dành cho người đã báo cáo mắc bệnh/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Phân loại hồ sơ" }));
    await waitFor(() => expect(classifyBodies(fetchMock).map((b) => b.task)).toEqual(["status3", "diabtype"]));
    expect(await screen.findByRole("link", { name: /Tra cứu theo chủ đề này/ })).toHaveAttribute("href", expect.stringContaining("topic=type2"));
  });

  it("shows the backend failure instead of a result", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/classify/features" ? json(featuresFixture) : json({ detail: "BMI=500 outside [10, 100]" }, 500))));
    const user = userEvent.setup();
    render(<SurveyClassifier />);
    await user.click(await screen.findByRole("button", { name: "Phân loại hồ sơ" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("BMI=500 outside [10, 100]");
  });
});
