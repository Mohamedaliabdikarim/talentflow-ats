import {
  BadgeCheck,
  CircleX,
  FileSignature,
  Inbox,
  type LucideIcon,
  MessagesSquare,
  Search,
} from "lucide-react";
import { cn } from "cn";
import { type ApplicationStage, STAGE_LABELS } from "@/lib/validation/application";

/**
 * Stage presentation (docs/DESIGN.md §2): each stage has a tint AND an icon AND a label,
 * so state is never conveyed by colour alone. Light pairs are 100/800 (≥ 7:1), dark pairs
 * 900/100.
 */
const STAGE_PRESENTATION: Record<ApplicationStage, { icon: LucideIcon; tone: string }> = {
  new: {
    icon: Inbox,
    tone: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-100",
  },
  screening: {
    icon: Search,
    tone: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100",
  },
  interview: {
    icon: MessagesSquare,
    tone: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-100",
  },
  offer: {
    icon: FileSignature,
    tone: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  },
  hired: {
    icon: BadgeCheck,
    tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  },
  rejected: {
    icon: CircleX,
    tone: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100",
  },
};

export function stageIcon(stage: ApplicationStage): LucideIcon {
  return STAGE_PRESENTATION[stage].icon;
}

export function StageBadge({ stage, className }: { stage: ApplicationStage; className?: string }) {
  const { icon: Icon, tone } = STAGE_PRESENTATION[stage];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {STAGE_LABELS[stage]}
    </span>
  );
}
