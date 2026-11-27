/**
 * Server logs say what failed and never what was in it: an error message can quote the resume, a reply or an address
 * with a key in it. Only the error's type and any HTTP status are written.
 */
export function logFailure(label: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "unknown error";
  const status = (err as { status?: unknown } | null)?.status;
  console.error(`${label} failed: ${name}${typeof status === "number" ? ` (status ${status})` : ""}`);
}
