export const EXCELLENCE_ARTIFACT_TYPES = ["title", "description", "image", "package"] as const;
export type ExcellenceArtifactType = (typeof EXCELLENCE_ARTIFACT_TYPES)[number];
export type ExcellenceStatus = "active" | "retired";

export type ExcellenceItem = {
  id: string;
  projectId: string;
  candidateId: string;
  reviewDecisionId: string;
  artifactType: ExcellenceArtifactType;
  marketplace: string;
  productCategory: string;
  agentRole: string;
  context: Record<string, unknown>;
  decisions: string[];
  approvalReason: string;
  tags: string[];
  status: ExcellenceStatus;
  createdBy: string;
  createdAt: string;
  retiredAt: string | null;
};

export function createExcellenceItem(input: Omit<ExcellenceItem, "status" | "createdAt" | "retiredAt"> & { now?: string }): ExcellenceItem {
  if (!input.approvalReason.trim()) throw new Error("approvalReason is required");
  if (!input.marketplace.trim() || !input.productCategory.trim() || !input.agentRole.trim()) throw new Error("marketplace, productCategory and agentRole are required");
  if (!input.decisions.length || input.decisions.some((decision) => !decision.trim())) throw new Error("decisions must explain the approved choices");
  return { id: input.id, projectId: input.projectId, candidateId: input.candidateId, reviewDecisionId: input.reviewDecisionId, artifactType: input.artifactType, marketplace: input.marketplace.trim(), productCategory: input.productCategory.trim(), agentRole: input.agentRole.trim(), context: structuredClone(input.context), approvalReason: input.approvalReason.trim(), decisions: [...input.decisions], tags: [...new Set(input.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))], createdBy: input.createdBy, status: "active", createdAt: input.now ?? new Date().toISOString(), retiredAt: null };
}

export function retireExcellenceItem(item: ExcellenceItem, now = new Date().toISOString()): ExcellenceItem {
  if (item.status !== "active") throw new Error("Only an active excellence item can be retired");
  return { ...item, status: "retired", retiredAt: now };
}
