import { createHmac, timingSafeEqual } from "node:crypto";

export type CommandIdentity = { userId: string; workspaceId: string };

function digest(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function signCommandContext(identity: CommandIdentity, secret: string) {
  return digest(`${identity.userId}:${identity.workspaceId}`, secret);
}

export function verifyCommandContext(identity: Partial<CommandIdentity>, signature: string | undefined, secret: string | undefined) {
  if (!secret || typeof identity.userId !== "string" || !identity.userId || typeof identity.workspaceId !== "string" || !identity.workspaceId || typeof signature !== "string" || !signature) return false;
  const expected = signCommandContext(identity as CommandIdentity, secret);
  const provided = Buffer.from(signature, "utf8");
  const actual = Buffer.from(expected, "utf8");
  return provided.length === actual.length && timingSafeEqual(provided, actual);
}
