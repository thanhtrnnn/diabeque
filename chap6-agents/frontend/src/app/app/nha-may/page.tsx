// STUB (Task 10 manual check). Task 12 replaces this file with the real page, HUD and character sheet.
import { Baloo_2, Be_Vietnam_Pro } from "next/font/google";

import { DevStub } from "./dev-stub";

import type { Metadata } from "next";

const display = Baloo_2({ variable: "--font-factory-display", subsets: ["latin", "vietnamese"], weight: ["600", "700"], display: "swap" });
const text = Be_Vietnam_Pro({ variable: "--font-factory-text", subsets: ["latin", "vietnamese"], weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = { title: "Nhà máy" };

export default function FactoryStubPage() {
  return (
    <div className={`${display.variable} ${text.variable}`} style={{ width: "100vw", height: "100vh" }}>
      <DevStub />
    </div>
  );
}
