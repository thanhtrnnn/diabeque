import { ChatCenteredTextIcon, ClipboardTextIcon, GraphIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { NavigationFeedback } from "@/components/product/navigation-feedback";
import { ProductHydrationGate } from "@/components/product/product-hydration-gate";
import { ProductMark } from "@/components/product/product-mark";

import styles from "./product-shell.module.css";

export type ProductSection = "chat" | "graph" | "classify";

const NAV: Array<{ key: ProductSection; href: string; label: string; mobileLabel: string; icon: typeof GraphIcon }> = [
  { key: "chat", href: "/app/chat", label: "Hỏi đáp", mobileLabel: "Hỏi đáp", icon: ChatCenteredTextIcon },
  { key: "graph", href: "/app/do-thi", label: "Đồ thị tri thức", mobileLabel: "Đồ thị", icon: GraphIcon },
  { key: "classify", href: "/app/phan-loai", label: "Phân loại khảo sát", mobileLabel: "Khảo sát", icon: ClipboardTextIcon },
];

const NAV_LABEL = "Điều hướng chính";

export function ProductShell({ current, children }: { current: ProductSection; children: React.ReactNode }) {
  const navigation = NAV.map(({ key, href, label, icon: Icon }) => (
    <Link key={key} href={href} aria-label={label} aria-current={current === key ? "page" : undefined}>
      <span className="product-nav__icon"><Icon weight="bold" aria-hidden="true" /></span>
      <span className="product-nav__label">{label}</span>
      <span className="product-nav__tablet-label" aria-hidden="true">{label}</span>
    </Link>
  ));
  const mobileNavigation = NAV.map(({ key, href, label, mobileLabel, icon: Icon }) => (
    <Link key={key} href={href} aria-label={label} aria-current={current === key ? "page" : undefined}>
      <Icon weight="bold" aria-hidden="true" />
      <span className="product-mobile-nav__label">{mobileLabel}</span>
    </Link>
  ));

  return (
    <ProductHydrationGate>
      <div className={`product-page product-page--app ${styles.page}`}>
        <a className="skip-link" href="#main-content">Tới nội dung chính</a>
        <header className={`${styles.header} product-header`}>
          <div className="product-header__brand">
            <Link href="/app/chat"><ProductMark /></Link>
            <span className="product-header__portal"><i aria-hidden="true" />Tra cứu y tế</span>
          </div>
        </header>
        <NavigationFeedback />
        <div className={styles.workspace}>
          <aside className={styles.rail}>
            <nav aria-label={NAV_LABEL}>{navigation}</nav>
          </aside>
          <nav className={styles.tabletNav} aria-label={NAV_LABEL}>{navigation}</nav>
          <div className={styles.content}>
            <main id="main-content" className={`product-main ${styles.main}`}>{children}</main>
          </div>
        </div>
        <nav className={styles.mobileNav} aria-label={`${NAV_LABEL} trên mobile`}>{mobileNavigation}</nav>
      </div>
    </ProductHydrationGate>
  );
}
