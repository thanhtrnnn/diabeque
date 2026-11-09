import { PageHeading } from "@/components/product/page-heading";
import { ProductShell } from "@/components/product/product-shell";
import { SurveyClassifier } from "@/components/product/survey-classifier";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Phân loại khảo sát" };

export default function ClassifyPage() {
  return (
    <ProductShell current="classify">
      <div className="app-page">
        <PageHeading title="Phân loại khảo sát" description="Nhập hồ sơ khảo sát để dự đoán nhóm tình trạng, rồi tra cứu theo chủ đề tương ứng." />
        <SurveyClassifier />
      </div>
    </ProductShell>
  );
}
