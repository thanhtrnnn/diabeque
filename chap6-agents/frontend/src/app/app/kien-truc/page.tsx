import { ArchitectureView } from "@/components/product/architecture-view";
import { PageHeading } from "@/components/product/page-heading";
import { ProductShell } from "@/components/product/product-shell";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kiến trúc" };

export default function ArchitecturePage() {
  return (
    <ProductShell current="architecture">
      <div className="app-page">
        <PageHeading
          title="Kiến trúc đa agent"
          description="Mô hình giám sát: một agent điều phối chọn nhánh, các agent chuyên trách làm việc trên một trạng thái chung của hội thoại, và hai lớp an toàn kiểm tra tin nhắn trước khi xử lý và câu trả lời trước khi gửi đi."
        />
        <ArchitectureView />
      </div>
    </ProductShell>
  );
}
