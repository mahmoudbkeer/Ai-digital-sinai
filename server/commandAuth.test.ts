import { describe, expect, it } from "vitest";
import { signCommandContext, verifyCommandContext } from "./commandAuth";

const secret = "test-command-context-secret";
const identity = { userId: "user-a", workspaceId: "workspace-a" };

describe("command context verification", () => {
  it("rejects missing identity, signature, or secret", () => {
    expect(verifyCommandContext({}, undefined, secret)).toBe(false);
    expect(verifyCommandContext(identity, undefined, secret)).toBe(false);
    expect(verifyCommandContext(identity, signCommandContext(identity, secret), undefined)).toBe(false);
  });

  it("rejects a signature from another workspace or user", () => {
    const signature = signCommandContext(identity, secret);
    expect(verifyCommandContext({ userId: "user-b", workspaceId: "workspace-a" }, signature, secret)).toBe(false);
    expect(verifyCommandContext({ userId: "user-a", workspaceId: "workspace-b" }, signature, secret)).toBe(false);
  });

  it("accepts only the exact signed context", () => {
    const signature = signCommandContext(identity, secret);
    expect(verifyCommandContext(identity, signature, secret)).toBe(true);
  });
});
