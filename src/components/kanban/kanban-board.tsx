"use client";

import { ArrowRightLeft } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useCallback, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { stageIcon } from "@/components/stage-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cardSpring, enterTransition, exitTransition } from "@/lib/motion";
import { daysInStage, formatStageAge, groupByStage, type PipelineCard } from "@/lib/pipeline";
import {
  APPLICATION_STAGES,
  type ApplicationStage,
  STAGE_LABELS,
} from "@/lib/validation/application";
import { moveApplicationStageAction } from "@/server/actions/applications";

type Move = { id: string; stage: ApplicationStage };

type KanbanBoardProps = {
  orgSlug: string;
  cards: PipelineCard[];
  /** Server timestamp so "days in stage" renders identically on server and client. */
  now: number;
};

const STAGE_SET = new Set<string>(APPLICATION_STAGES);

/**
 * Finds the stage column under a pointer position, ignoring the card being dragged
 * (it sits on top of the stack and belongs to its original column).
 */
function stageAtPoint(event: MouseEvent | TouchEvent | PointerEvent): ApplicationStage | null {
  if (typeof document === "undefined" || !("elementsFromPoint" in document)) return null;
  const point = "changedTouches" in event ? event.changedTouches[0] : event;
  if (!point) return null;
  for (const element of document.elementsFromPoint(point.clientX, point.clientY)) {
    if (element.closest("[data-dragging='true']")) continue;
    const column = element.closest<HTMLElement>("[data-stage]");
    const stage = column?.dataset.stage;
    if (stage && STAGE_SET.has(stage)) return stage as ApplicationStage;
  }
  return null;
}

/**
 * Compact Kanban (ADR-014, ADR-021). Two ways to move a card, both ending in the same
 * Server Action with an optimistic update and a live-region announcement:
 *  - the per-card "Move to stage" menu (keyboard and screen-reader path), and
 *  - pointer drag onto another column (Phase 3 enhancement; columns highlight on hover).
 * Card movement between columns animates through Motion's shared layout.
 */
export function KanbanBoard({ orgSlug, cards, now }: KanbanBoardProps) {
  const [optimisticCards, applyMove] = useOptimistic(cards, (state: PipelineCard[], move: Move) =>
    state.map((card) =>
      card.id === move.id
        ? { ...card, stage: move.stage, stageChangedAt: new Date(now).toISOString() }
        : card,
    ),
  );
  const [, startTransition] = useTransition();
  const [announcement, setAnnouncement] = useState("");
  const [dropTarget, setDropTarget] = useState<ApplicationStage | null>(null);
  const groups = groupByStage(optimisticCards);

  const move = useCallback(
    (card: PipelineCard, stage: ApplicationStage) => {
      if (card.stage === stage) return;
      startTransition(async () => {
        applyMove({ id: card.id, stage });
        const result = await moveApplicationStageAction(orgSlug, {
          applicationId: card.id,
          stage,
        });
        if (result.status === "error") {
          setAnnouncement(`Could not move ${card.candidateName}: ${result.message}`);
          toast.error(result.message);
          return;
        }
        const text = `Moved ${card.candidateName} to ${STAGE_LABELS[stage]}`;
        setAnnouncement(text);
        toast.success(text);
      });
    },
    [applyMove, orgSlug],
  );

  const handleDragOver = useCallback((stage: ApplicationStage | null) => {
    setDropTarget((current) => (current === stage ? current : stage));
  }, []);

  return (
    <LayoutGroup>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        <div className="flex min-w-max gap-3" role="list" aria-label="Pipeline stages">
          {APPLICATION_STAGES.map((stage) => {
            const Icon = stageIcon(stage);
            const column = groups[stage];
            return (
              <section
                key={stage}
                role="listitem"
                aria-labelledby={`stage-${stage}`}
                data-stage={stage}
                className={cn(
                  "flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40 transition-colors duration-150 sm:w-72",
                  dropTarget === stage && "border-primary bg-accent/60",
                )}
              >
                <header className="flex items-center gap-2 px-3 py-2">
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <h2 id={`stage-${stage}`} className="text-sm font-semibold">
                    {STAGE_LABELS[stage]}
                  </h2>
                  <span
                    className="ml-auto rounded-full bg-background px-2 text-xs tabular-nums text-muted-foreground"
                    aria-label={`${column.length} in ${STAGE_LABELS[stage]}`}
                  >
                    {column.length}
                  </span>
                </header>
                <ul className="flex min-h-24 flex-col gap-2 px-2 pb-2">
                  <AnimatePresence initial={false}>
                    {column.map((card) => (
                      <KanbanCard
                        key={card.id}
                        card={card}
                        orgSlug={orgSlug}
                        now={now}
                        onMove={move}
                        onDragOver={handleDragOver}
                      />
                    ))}
                  </AnimatePresence>
                  {column.length === 0 ? (
                    <li className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                      No candidates
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </LayoutGroup>
  );
}

function KanbanCard({
  card,
  orgSlug,
  now,
  onMove,
  onDragOver,
}: {
  card: PipelineCard;
  orgSlug: string;
  now: number;
  onMove: (card: PipelineCard, stage: ApplicationStage) => void;
  onDragOver: (stage: ApplicationStage | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const age = formatStageAge(daysInStage(card.stageChangedAt, now));

  return (
    <motion.li
      layout
      layoutId={card.id}
      data-card-id={card.id}
      data-dragging={dragging ? "true" : undefined}
      drag
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.15}
      whileDrag={{ scale: 1.03, zIndex: 20 }}
      onDragStart={() => setDragging(true)}
      onDrag={(event) => onDragOver(stageAtPoint(event))}
      onDragEnd={(event) => {
        const target = stageAtPoint(event);
        setDragging(false);
        onDragOver(null);
        if (target && target !== card.stage) onMove(card, target);
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitTransition }}
      transition={{ ...enterTransition, layout: cardSpring }}
      className={cn(
        "cursor-grab touch-pan-y rounded-md border bg-card p-3 shadow-xs active:cursor-grabbing",
        dragging && "shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/o/${orgSlug}/candidates/${card.candidateId}`}
            className="block truncate text-sm font-medium underline-offset-4 hover:underline"
          >
            {card.candidateName}
          </Link>
          {card.candidateHeadline ? (
            <p className="truncate text-xs text-muted-foreground">{card.candidateHeadline}</p>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={`Move ${card.candidateName} to another stage`}
            >
              <ArrowRightLeft aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
            {APPLICATION_STAGES.filter((stage) => stage !== card.stage).map((stage) => (
              <DropdownMenuItem key={stage} onSelect={() => onMove(card, stage)}>
                {STAGE_LABELS[stage]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/o/${orgSlug}/jobs/${card.jobId}`}>Open job</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <Link
          href={`/o/${orgSlug}/jobs/${card.jobId}`}
          className="truncate underline-offset-4 hover:underline"
        >
          {card.jobTitle}
        </Link>
        <span className="shrink-0" title="Time in current stage">
          {age}
        </span>
      </div>
    </motion.li>
  );
}
