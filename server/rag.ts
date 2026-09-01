export type RagChunk = {
  tenantId: string;
  documentId: string;
  chunkId: string;
  content: string;
  permissionScope?: string[];
  embeddingRef?: string | null;
};
export type EmbeddingProvider = {
  status: "configured" | "requires_setup";
  embed(input: { tenantId: string; texts: string[] }): Promise<{ status: "READY" | "REQUIRES_SETUP"; refs?: string[] }>;
};
export function chunkDocument(content: string, maxChars = 1200): string[] {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let offset = 0; offset < normalized.length; offset += maxChars) {
    const chunk = normalized.slice(offset, offset + maxChars).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}
export function resolveEmbeddingProvider(): EmbeddingProvider {
  const configured = Boolean(process.env.EMBEDDING_PROVIDER_API_URL?.trim() && process.env.EMBEDDING_PROVIDER_API_KEY?.trim());
  return {
    status: configured ? "configured" : "requires_setup",
    async embed() { return configured ? { status: "READY", refs: [] } : { status: "REQUIRES_SETUP" }; },
  };
}
export function filterTenantChunks(chunks: RagChunk[], tenantId: string, permissions: Set<string>): RagChunk[] {
  return chunks.filter(chunk => chunk.tenantId === tenantId && (!chunk.permissionScope?.length || chunk.permissionScope.some(permission => permissions.has(permission))));
}
