import { KnowledgeGraph } from "@/components/product/knowledge-graph";
import { PageHeading } from "@/components/product/page-heading";
import { ProductShell } from "@/components/product/product-shell";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Đồ thị tri thức" };

const DEFAULT_NODE = "dtd_chung";

export default async function GraphPage({ searchParams }: PageProps<"/app/do-thi">) {
  const { node } = await searchParams;
  return (
    <ProductShell current="graph">
      <div className="app-page">
        <PageHeading title="Đồ thị tri thức" description="Xem các nút lân cận của một bệnh, khuyến nghị, đoạn nguồn và tài liệu trên đồ thị KB_diabet. Bấm một nút để chuyển tâm sang nút đó." />
        <KnowledgeGraph key={typeof node === "string" ? node : DEFAULT_NODE} initialNode={typeof node === "string" && node ? node : DEFAULT_NODE} />
      </div>
    </ProductShell>
  );
}
