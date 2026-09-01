import { afterEach, describe, expect, it, vi } from "vitest";
import { chunkDocument, filterTenantChunks, resolveEmbeddingProvider } from "./rag";
afterEach(() => vi.unstubAllEnvs());
describe("RAG pipeline contracts", () => {
  it("chunks documents deterministically", () => {
    expect(chunkDocument("  one   two three  ", 7)).toEqual(["one two", "three"]);
    expect(chunkDocument("   ")).toEqual([]);
  });
  it("filters tenant and permission scope before retrieval", () => {
    const chunks = [
      { tenantId: "a", documentId: "d1", chunkId: "c1", content: "a", permissionScope: ["inventory.read"] },
      { tenantId: "b", documentId: "d2", chunkId: "c2", content: "b" },
      { tenantId: "a", documentId: "d3", chunkId: "c3", content: "secret", permissionScope: ["admin.manage"] },
    ];
    expect(filterTenantChunks(chunks, "a", new Set(["inventory.read"]))).toHaveLength(1);
  });
  it("does not fabricate embeddings without provider credentials", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER_API_URL", "");
    vi.stubEnv("EMBEDDING_PROVIDER_API_KEY", "");
    const provider = resolveEmbeddingProvider();
    expect(provider.status).toBe("requires_setup");
    await expect(provider.embed({ tenantId: "a", texts: ["content"] })).resolves.toEqual({ status: "REQUIRES_SETUP" });
  });
});
