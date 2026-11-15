import { Baloo_2, Be_Vietnam_Pro } from "next/font/google";

import { FactoryView } from "@/components/factory/factory-view";
import { ProductShell } from "@/components/product/product-shell";

import type { Metadata } from "next";

const display = Baloo_2({ variable: "--font-factory-display", subsets: ["latin", "vietnamese"], weight: ["600", "700"], display: "swap" });
const text = Be_Vietnam_Pro({ variable: "--font-factory-text", subsets: ["latin", "vietnamese"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = { title: "Nhà máy" };

export default function FactoryPage() {
  return (
    <ProductShell current="factory">
      <div className={`${display.variable} ${text.variable}`}>
        <FactoryView />
      </div>
    </ProductShell>
  );
}
