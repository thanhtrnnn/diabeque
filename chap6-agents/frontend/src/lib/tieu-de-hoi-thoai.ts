/** Tiêu đề hội thoại rút gọn từ câu hỏi đầu tiên, tính tại trình duyệt. */

const DAI_TOI_DA = 60;

/** Chữ mở đầu không mang thông tin — bỏ đi thì 60 ký tự còn lại nói được nhiều hơn. */
const MO_DAU_THUA =
  /^\s*(cho\s+tôi\s+hỏi|xin\s+hỏi|hỏi\s+về|tôi\s+muốn\s+hỏi|tôi\s+muốn|làm\s+ơn|vui\s+lòng|bạn\s+ơi|anh\s+ơi|chị\s+ơi)[\s,:]*/iu;

/** Ký tự bị cắt ở HAI đầu, giống `str.strip(" ?.!,:；;")` của Python. */
const RIA = /^[\s?.!,:；;]+|[\s?.!,:；;]+$/gu;

export function rutGonTieuDe(cauHoi: string | null | undefined): string {
  const tho = (cauHoi ?? "").split(/\s+/u).join(" ").replace(MO_DAU_THUA, "").replace(RIA, "");
  if (!tho) return "Hội thoại mới";
  if (tho.length <= DAI_TOI_DA) return tho;
  // Cắt ở ranh giới TỪ, không cắt giữa chữ — "Mức giảm trừ gia cảnh" đọc như lỗi.
  const cat = tho.slice(0, DAI_TOI_DA).split(" ").slice(0, -1).join(" ");
  return `${(cat || tho.slice(0, DAI_TOI_DA)).replace(/[\s,;]+$/u, "")}…`;
}
