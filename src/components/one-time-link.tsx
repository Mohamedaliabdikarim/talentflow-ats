"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Displays an invitation link exactly once (ADR-007). The value only lives in this
 * component's props; it is never persisted, logged or shown again after navigation.
 */
export function OneTimeLink({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Share this link privately with the person. It works once and expires according to the
          project&apos;s email OTP setting. It will not be shown again.
        </p>
        <div className="flex gap-2">
          <Input
            readOnly
            value={url}
            aria-label="Invitation link"
            onFocus={(event) => event.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button type="button" variant="outline" onClick={copy} aria-live="polite">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
