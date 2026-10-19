"use client";

import { Plus } from "lucide-react";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type ActionState, idleState } from "@/lib/action-state";
import { addToPipelineAction } from "@/server/actions/applications";
import { FormError, SubmitButton } from "./fields";

type Option = { id: string; label: string };

type AddToPipelineDialogProps = {
  orgSlug: string;
  /** The side that is already known (the job on a job page, the candidate on a candidate page). */
  fixed: { name: "jobId" | "candidateId"; value: string };
  /** The side the user picks. Options exclude existing applications. */
  choose: { name: "jobId" | "candidateId"; label: string; options: Option[]; emptyText: string };
  triggerLabel: string;
  title: string;
  description: string;
};

/** Creates an application (candidate ↔ job) from either detail page. */
export function AddToPipelineDialog({
  orgSlug,
  fixed,
  choose,
  triggerLabel,
  title,
  description,
}: AddToPipelineDialogProps) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const action = useMemo(() => addToPipelineAction.bind(null, orgSlug), [orgSlug]);
  const handleDone = useCallback((message?: string) => {
    toast.success(message ?? "Added to the pipeline");
    setOpen(false);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((key) => key + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {choose.options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{choose.emptyText}</p>
        ) : (
          <AddForm
            key={formKey}
            action={action}
            fixed={fixed}
            choose={choose}
            onDone={handleDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddForm({
  action,
  fixed,
  choose,
  onDone,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  fixed: AddToPipelineDialogProps["fixed"];
  choose: AddToPipelineDialogProps["choose"];
  onDone: (message?: string) => void;
}) {
  const [state, formAction] = useActionState(action, idleState);
  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name={fixed.name} value={fixed.value} />
      <FormError message={state.status === "error" ? state.message : undefined} />
      <div className="space-y-1.5">
        <Label htmlFor={choose.name}>{choose.label}</Label>
        <Select name={choose.name} defaultValue={choose.options[0]?.id}>
          <SelectTrigger id={choose.name} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choose.options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <SubmitButton pendingLabel="Adding…">Add to pipeline</SubmitButton>
      </DialogFooter>
    </form>
  );
}
