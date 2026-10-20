/**
 * Result shape shared by every Server Action used with React's useActionState.
 * Expected failures (validation, authorization, conflicts) are returned, never thrown,
 * so forms can render them inline; unexpected errors become a generic message.
 */
export type ActionState<TData = undefined> =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
      /** Submitted text values, echoed back so a form can repopulate after a failed submit. */
      values?: Record<string, string>;
    }
  | { status: "success"; message?: string; data: TData };

export const idleState: ActionState<never> = { status: "idle" };

export function errorState(
  message: string,
  fieldErrors?: Record<string, string[]>,
  values?: Record<string, string>,
): ActionState<never> {
  return { status: "error", message, fieldErrors, values };
}

/** Flattens Zod issues into { field: [messages] } for inline rendering. */
export function fieldErrorsFromIssues(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_form";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}
