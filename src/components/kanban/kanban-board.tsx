"use client";

import { ArrowRightLeft } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
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

/**
 * Compact Kanban (ADR-014). Moving a card is a menu action (keyboard and screen-reader
 * friendly) that updates optimistically and persists through a Server Action; the change
 * is announced in a live region. Pointer drag-and-drop is a Phase 3 enhancement on top of
 * the same action. Card movement between columns animates through Motion's shared layout.
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
  const groups = groupByStage(optimisticCards);

  function move(card: PipelineCard, stage: ApplicationStage) {
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
  }

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
                className="flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40"
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
}: {
  card: PipelineCard;
  orgSlug: string;
  now: number;
  onMove: (card: PipelineCard, stage: ApplicationStage) => void;
}) {
  const age = formatStageAge(daysInStage(card.stageChangedAt, now));
  return (
    <motion.li
      layout
      layoutId={card.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitTransition }}
      transition={{ ...enterTransition, layout: cardSpring }}
      className="rounded-md border bg-card p-3 shadow-xs"
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
