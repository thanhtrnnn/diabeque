import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-v3-body",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const NAME = "Diabeque";
const TAGLINE = "Trợ lý đa agent sàng lọc và tư vấn đái tháo đường";

export const metadata: Metadata = {
  title: { default: NAME, template: `%s · ${NAME}` },
  description: `${TAGLINE}: kiểm an toàn, thu thập thông tin, ước lượng nguy cơ và tra cứu nguồn y tế có trích dẫn.`,
};

/* Chat is a task surface: when an on-screen keyboard opens, its layout
 * viewport must shrink with the visible area so the scrollport, not the whole
 * document, gives up space. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${manrope.variable} antialiased`}>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
