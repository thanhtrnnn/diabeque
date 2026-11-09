import type { ReactNode } from "react";

import styles from "./page-heading.module.css";

interface PageHeadingProps {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  variant?: "standard" | "dashboard";
  className?: string;
}

export function PageHeading({ title, description, meta, actions, variant = "standard", className }: PageHeadingProps) {
  return (
    <header
      className={`${styles.heading}${variant === "dashboard" ? ` ${styles.dashboard}` : ""}${className ? ` ${className}` : ""}`}
      data-variant={variant}
    >
      <div className={styles.copy}>
        {meta && variant === "dashboard" ? <div className={styles.meta}>{meta}</div> : null}
        <h1>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
        {meta && variant !== "dashboard" ? <div className={styles.meta}>{meta}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
