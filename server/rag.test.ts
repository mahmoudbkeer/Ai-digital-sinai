import { afterEach, describe, expect, it, vi } from "vitest";
import { chunkDocument, filterTenantChunks, resolveEmbeddingProvider } from "./rag";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
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
  it("calls the configured embedding provider and validates returned refs", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER_API_URL", "https://embedding.example.test/v1/embed");
    vi.stubEnv("EMBEDDING_PROVIDER_API_KEY", "embedding-test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ refs: ["vec-1", "vec-2"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = resolveEmbeddingProvider();
    await expect(provider.embed({ tenantId: "tenant-a", texts: ["one", "two"] })).resolves.toEqual({ status: "READY", refs: ["vec-1", "vec-2"] });
    expect(fetchMock).toHaveBeenCalledWith("https://embedding.example.test/v1/embed", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ authorization: "Bearer embedding-test-key", "x-tenant-scope": "tenant-a" }), body: JSON.stringify({ tenantId: "tenant-a", texts: ["one", "two"] }) }));
  });
  it("does not report READY when the embedding provider returns malformed refs", async () => {
    vi.stubEnv("EMBEDDING_PROVIDER_API_URL", "https://embedding.example.test/v1/embed");
    vi.stubEnv("EMBEDDING_PROVIDER_API_KEY", "embedding-test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ refs: [] }), { status: 200 })));
    await expect(resolveEmbeddingProvider().embed({ tenantId: "tenant-a", texts: ["one"] })).resolves.toEqual({ status: "REQUIRES_SETUP" });
  });
});
