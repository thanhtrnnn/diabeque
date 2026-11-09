import { describe, expect, it } from "vitest";

import { chatHref, fieldControl, formatPercent, profileToValues, toFeatures } from "@/lib/survey";

const parsed = (topic: string) => {
  const url = new URL(chatHref(topic), "http://localhost");
  return [url.pathname, url.searchParams.get("q")];
};

describe("chatHref", () => {
  it.each([
    ["prevention", "Làm thế nào để phòng ngừa đái tháo đường?"],
    ["prediabetes", "Người bị tiền đái tháo đường nên làm gì?"],
    ["diabetes_general", "Người bệnh đái tháo đường nên ăn uống và sinh hoạt thế nào?"],
    ["type1", "Người bệnh đái tháo đường type 1 cần lưu ý gì?"],
    ["type2", "Người bệnh đái tháo đường type 2 cần lưu ý gì?"],
  ])("maps topic %s to the chat route with its preset question", (topic, question) => {
    expect(parsed(topic)).toEqual(["/app/chat", question]);
  });

  it("falls back to the bare chat route for an unknown topic", () => {
    expect(chatHref("unknown")).toBe("/app/chat");
  });
});

describe("form values", () => {
  const field = (name: string, kind: "binary" | "number" | "ordinal", options?: Array<{ value: number; label_vi: string }>) =>
    ({ name, label_vi: name, kind, min: 0, max: 1, options });
  const fields = [field("BMI", "number"), field("Age", "ordinal", [{ value: 9, label_vi: "60-64" }]), field("HighBP", "binary"), field("Smoker", "binary"), field("Sex", "binary", [{ value: 0, label_vi: "Nữ" }])];

  it("drops blank number and select fields so the backend imputes the median, sends untouched toggles as 0, and ignores unknown names", () => {
    expect(toFeatures({ BMI: "40", Age: "", HighBP: "1", Sex: " ", Bogus: "7" }, fields)).toEqual({ BMI: 40, HighBP: 1, Smoker: 0 });
  });

  it("turns the example profile into form strings", () => {
    expect(profileToValues({ BMI: 40, Age: 9 })).toEqual({ BMI: "40", Age: "9" });
  });

  it("chooses a select for fields with options, even binary ones, a toggle for plain binaries and a number input otherwise", () => {
    const base = { label_vi: "x", min: 0, max: 1 };
    expect(fieldControl({ ...base, name: "Sex", kind: "binary", options: [{ value: 0, label_vi: "Nữ" }] })).toBe("select");
    expect(fieldControl({ ...base, name: "HighBP", kind: "binary" })).toBe("toggle");
    expect(fieldControl({ ...base, name: "BMI", kind: "number" })).toBe("number");
  });

  it("formats a probability as a Vietnamese percentage with one decimal", () => {
    expect(formatPercent(0.6364511847496033)).toBe("63,6%");
    expect(formatPercent(0.06188202649354935)).toBe("6,2%");
  });
});
