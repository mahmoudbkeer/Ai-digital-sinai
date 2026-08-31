export type SafeErrorLog = {
  event: "http_error";
  requestId: string;
  method: string;
  path: string;
  status: number;
  error: string;
};

export function createSafeErrorLog(input: Omit<SafeErrorLog, "event">): SafeErrorLog {
  return { event: "http_error", ...input, error: input.error.slice(0, 200) };
}
