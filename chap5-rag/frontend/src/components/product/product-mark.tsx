export const PRODUCT_NAME = "Tra cứu Đái tháo đường";
export const PRODUCT_SHORT = "ĐTĐ";

export function ProductMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "product-mark product-mark--compact" : "product-mark"}>
      <span aria-hidden="true">{PRODUCT_SHORT}</span>
      <strong>{PRODUCT_NAME}</strong>
    </span>
  );
}
