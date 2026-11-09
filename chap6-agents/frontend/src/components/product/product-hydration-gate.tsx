export function ProductHydrationGate({ children }: { children: React.ReactNode }) {
  /*
   * Workspace content is server-rendered and already has its own loading/error
   * states. Hiding the entire page until React hydrates turns a fast document
   * response into an inert splash screen, delays keyboard access, and makes
   * every route feel slower. Keep the legacy class as a stable styling/test
   * hook, but render the actual content immediately.
   */
  return <div className="product-v3-hydration is-ready">{children}</div>;
}
