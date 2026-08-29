const sectorPrefixes: Record<string, string> = {
  retail: "retail",
  food: "food",
  "home-services": "home",
  crafts: "crafts",
  agriculture: "agri",
  fishing: "fishing",
  transport: "transport",
  tourism: "tourism",
  education: "education",
  health: "health",
  "real-estate": "estate",
  construction: "construction",
  jobs: "jobs",
  community: "community",
};

const moduleNames = new Set(["catalog", "orders", "insights"]);
const operationNames = new Set(["publish", "visibility", "queue", "status", "report", "alerts"]);

export function isValidCommand(input: { sectorId?: unknown; moduleId?: unknown; operationId?: unknown }) {
  const { sectorId, moduleId, operationId } = input;
  if (typeof sectorId !== "string" || typeof moduleId !== "string" || typeof operationId !== "string") return false;
  const prefix = sectorPrefixes[sectorId];
  if (!prefix) return false;
  if (!moduleId.startsWith(`${prefix}-`) || !moduleNames.has(moduleId.slice(prefix.length + 1))) return false;
  if (!operationId.startsWith(`${prefix}-`) || !operationNames.has(operationId.slice(prefix.length + 1))) return false;
  return true;
}
