"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/forms/fields";
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

type ConfirmActionDialogProps = {
  /** A bound Server Action; receives the dialog form's data. */
  action: (formData: FormData) => Promise<void>;
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel?: string;
  /** Hidden inputs the action needs (for example returnTo). */
  children?: React.ReactNode;
};

/** Confirmation step for destructive actions (docs/DESIGN.md §6, "confirmation-dialogs"). */
export function ConfirmActionDialog({
  action,
  triggerLabel,
  title,
  description,
  confirmLabel = "Delete",
  children,
}: ConfirmActionDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form action={action}>
          {children}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Working…">
              {confirmLabel}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
