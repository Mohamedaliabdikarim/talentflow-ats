export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b pb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed bg-card/40 px-6 py-12 text-center">
      <p className="text-base font-medium">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card p-5 shadow-xs transition-all duration-200 group-hover:border-primary/40 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      {/* Quiet accent that warms on hover; purely decorative. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
      />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

/** Re-exported so every view keeps one import path; the formatter itself lives in src/lib. */
export { formatDateTime } from "@/lib/format-date";
