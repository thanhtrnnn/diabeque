import Image from "next/image";

export const PRODUCT_NAME = "Diabeque";
export const PRODUCT_TAGLINE = "Trợ lý đa agent sàng lọc và tư vấn đái tháo đường";
export const PRODUCT_MARK_SRC = "/diabeque-mark.svg";

/** Beret whose stalk is a blood drop. Decorative: the wordmark next to it is the accessible name. */
export function ProductLogo({ className, size }: { className?: string; size: number }) {
  return <Image className={className} src={PRODUCT_MARK_SRC} alt="" width={size} height={size} unoptimized />;
}

export function ProductMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "product-mark product-mark--compact" : "product-mark"}>
      <ProductLogo size={40} />
      <strong>{PRODUCT_NAME}</strong>
    </span>
  );
}
