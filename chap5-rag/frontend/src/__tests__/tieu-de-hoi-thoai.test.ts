import { describe, expect, it } from "vitest";

import { rutGonTieuDe } from "@/lib/tieu-de-hoi-thoai";

describe("rutGonTieuDe", () => {
  it("câu ngắn giữ nguyên, chỉ bỏ dấu hỏi cuối", () => {
    expect(rutGonTieuDe("Người bị tiền đái tháo đường nên ăn gì?")).toBe(
      "Người bị tiền đái tháo đường nên ăn gì",
    );
  });

  it("bỏ chữ mở đầu không mang thông tin", () => {
    expect(rutGonTieuDe("Cho tôi hỏi chỉ số HbA1c bình thường là bao nhiêu?")).toBe(
      "chỉ số HbA1c bình thường là bao nhiêu",
    );
    expect(rutGonTieuDe("Xin hỏi: metformin dùng khi nào?")).toBe("metformin dùng khi nào");
  });

  it("câu dài cắt ở ranh giới TỪ và đóng bằng dấu ba chấm", () => {
    const ra = rutGonTieuDe(
      "Bệnh nhân đái tháo đường type 2 đang dùng metformin liều thấp, gần đây đường huyết lúc đói tăng thì nên làm gì",
    );
    expect(ra.endsWith("…")).toBe(true);
    expect(ra.length).toBeLessThanOrEqual(61);
    // Không được cắt giữa một chữ.
    expect(ra.slice(0, -1).endsWith(" ")).toBe(false);
    expect(ra).toBe("Bệnh nhân đái tháo đường type 2 đang dùng metformin liều…");
  });

  it("gộp khoảng trắng thừa và xuống dòng thành một dấu cách", () => {
    expect(rutGonTieuDe("  đường   huyết\nlà gì  ")).toBe("đường huyết là gì");
  });

  it("rỗng, chỉ dấu câu, null đều trả về nhãn hội thoại mới", () => {
    expect(rutGonTieuDe("")).toBe("Hội thoại mới");
    expect(rutGonTieuDe("   ")).toBe("Hội thoại mới");
    expect(rutGonTieuDe("???")).toBe("Hội thoại mới");
    expect(rutGonTieuDe(null)).toBe("Hội thoại mới");
    expect(rutGonTieuDe(undefined)).toBe("Hội thoại mới");
  });
});
