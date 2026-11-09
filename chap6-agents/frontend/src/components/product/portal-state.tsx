"use client";

import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  FileSearchIcon,
  HourglassMediumIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useId } from "react";

interface StatePanelProps {
  tone: "error" | "neutral" | "loading";
  title: string;
  description?: string;
  alert?: React.ReactNode;
  actions?: React.ReactNode;
  embedded?: boolean;
}

export function StatePanel({ tone, title, description, alert, actions, embedded = false }: StatePanelProps) {
  const Icon = tone === "error" ? WarningCircleIcon : tone === "loading" ? HourglassMediumIcon : FileSearchIcon;
  const titleId = useId();
  const Root = embedded ? "section" : "main";
  const Heading = embedded ? "h2" : "h1";

  return (
    <Root
      className={`product-state-v3 product-state-v3--${tone}${embedded ? " product-state-v3--embedded" : ""}`}
      aria-labelledby={titleId}
      aria-busy={tone === "loading" || undefined}
    >
      <Icon weight={tone === "error" ? "fill" : "bold"} aria-hidden="true" />
      <div className="product-state-v3__heading">
        <Heading id={titleId}>{title}</Heading>
        {description && <p className="product-state-v3__copy">{description}</p>}
      </div>
      {alert}
      {actions && <div className="product-state-v3__actions">{actions}</div>}
    </Root>
  );
}

export function PortalError({ reset, homeHref }: { reset: () => void; homeHref: string }) {
  return (
    <StatePanel
      tone="error"
      title="Trang tạm thời bị gián đoạn"
      alert={<div className="product-state-v3__alert" role="alert">
        <strong>Dịch vụ tạm thời chưa phản hồi</strong>
        <p>Dữ liệu đã nhập trên trình duyệt chưa được gửi đến hệ thống. Đề nghị tải lại trang để tiếp tục.</p>
      </div>}
      actions={<>
        <button className="product-state-v3__button product-state-v3__button--primary" type="button" onClick={reset}>
          <ArrowClockwiseIcon aria-hidden="true" />
          Thử lại
        </button>
        <Link className="product-state-v3__button product-state-v3__button--secondary" href={homeHref}>
          <ArrowLeftIcon aria-hidden="true" />
          Về trang hỏi đáp
        </Link>
      </>}
    />
  );
}

export function PortalNotFound({
  title = "Không tìm thấy nội dung",
  description = "Đường dẫn có thể đã thay đổi hoặc nội dung không còn khả dụng.",
  href = "/app/chat",
  label = "Về trang chính",
  embedded = false,
}: {
  title?: string;
  description?: string;
  href?: string;
  label?: string;
  embedded?: boolean;
}) {
  return (
    <StatePanel
      tone="neutral"
      title={title}
      description={description}
      embedded={embedded}
      actions={<Link className="product-state-v3__button product-state-v3__button--primary" href={href}><ArrowLeftIcon aria-hidden="true" />{label}</Link>}
    />
  );
}

export function PortalLoading() {
  return (
    <StatePanel
      tone="loading"
      title="Đang tải"
      description="Hệ thống đang chuẩn bị dữ liệu cần thiết."
      alert={<div className="product-state-v3__skeleton" role="status" aria-live="polite" aria-label="Đang tải dữ liệu"><span /><span /><span /></div>}
    />
  );
}
