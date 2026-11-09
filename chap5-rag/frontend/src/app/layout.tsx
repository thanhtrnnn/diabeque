import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-v3-body",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

const NAME = "Tra cứu Đái tháo đường";

export const metadata: Metadata = {
  title: { default: NAME, template: `%s · ${NAME}` },
  description:
    "Hỏi đáp về đái tháo đường dựa trên đồ thị tri thức. Mỗi câu trả lời kèm đoạn nguồn y tế có thể mở để đối chiếu.",
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
