/** The post-login router only redirects; give the brief wait a visible state (ADR-042). */
export default function AppRouterLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6">
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Opening your workspace…
      </p>
    </main>
  );
}
