import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import { cn } from "cn";

/**
 * Renders a candidate-supplied URL (LinkedIn, GitHub) as a safe link: new tab, no opener
 * or referrer, and the host was validated when the value was stored.
 */
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline",
        className,
      )}
    >
      {children}
      <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
