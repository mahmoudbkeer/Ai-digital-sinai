export type SafeErrorLog = {
  event: "http_error";
  requestId: string;
  method: string;
  path: string;
  status: number;
  error: string;
};

export type StructuredEvent = {
  event: string;
  requestId?: string;
  tenantId?: string | null;
  actorUserId?: string | null;
  resourceType?: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  at?: string;
};

export function createSafeErrorLog(input: Omit<SafeErrorLog, "event">): SafeErrorLog {
  return { event: "http_error", ...input, error: input.error.slice(0, 200) };
}

export function emitStructuredEvent(input: StructuredEvent): void {
  const event = {
    ...input,
    metadata: input.metadata ?? {},
    at: input.at ?? new Date().toISOString(),
  };
  process.stdout.write(`${JSON.stringify(event)}\n`);
}
