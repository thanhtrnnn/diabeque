import type { Metadata } from "next";

import { ExamPrep } from "@/components/product/exam-prep";
import { PageHeading } from "@/components/product/page-heading";
import { ProductShell } from "@/components/product/product-shell";

export const metadata: Metadata = { title: "Ôn vấn đáp" };

export default function ExamPrepPage() {
  return (
    <ProductShell current="exam">
      <div className="app-page">
        <PageHeading
          title="Cẩm nang ôn vấn đáp"
          description="Bộ câu hỏi Intelligent System Development được trả lời bằng khái niệm, công thức và ví dụ gắn với phần code thực tế của Diabeque."
        />
        <ExamPrep />
      </div>
    </ProductShell>
  );
}
