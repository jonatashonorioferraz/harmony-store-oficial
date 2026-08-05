export const AGENT_ROLES = [
  "triage",
  "visual-analyst",
  "marketplace-strategist",
  "copywriter",
  "art-director",
  "virtual-photographer",
  "compliance-reviewer",
  "quality-director",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];
export type KnowledgeStatus = "draft" | "published" | "archived";

export type AgentExample = {
  id: string;
  title: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  approvalReason: string;
};

export type AgentKnowledgeContent = {
  mission: string;
  allowedContext: string[];
  forbiddenContext: string[];
  mandatoryRules: string[];
  bestPractices: string[];
  neverDo: string[];
  qualityChecklist: string[];
  inputContract: Record<string, string>;
  outputContract: Record<string, string>;
  approvedExamples: AgentExample[];
};

export type AgentKnowledgeVersion = {
  id: string;
  agentRole: AgentRole;
  version: number;
  status: KnowledgeStatus;
  content: AgentKnowledgeContent;
  changeReason: string;
  createdBy: string;
  createdAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
};

export type CreateAgentDraftInput = {
  agentRole: AgentRole;
  content: AgentKnowledgeContent;
  changeReason: string;
  createdBy: string;
};

export function assertValidKnowledge(content: AgentKnowledgeContent) {
  const requiredText = [["mission", content.mission]] as const;
  for (const [field, value] of requiredText) if (!value.trim()) throw new Error(`${field} is required`);

  const requiredLists: Array<[string, string[]]> = [
    ["allowedContext", content.allowedContext],
    ["mandatoryRules", content.mandatoryRules],
    ["neverDo", content.neverDo],
    ["qualityChecklist", content.qualityChecklist],
  ];
  for (const [field, values] of requiredLists) if (!values.length || values.some((value) => !value.trim())) throw new Error(`${field} must contain valid entries`);
  if (!Object.keys(content.inputContract).length) throw new Error("inputContract is required");
  if (!Object.keys(content.outputContract).length) throw new Error("outputContract is required");
}

export function createDraftVersion(input: CreateAgentDraftInput, version: number, now = new Date()): AgentKnowledgeVersion {
  assertValidKnowledge(input.content);
  if (!input.changeReason.trim()) throw new Error("changeReason is required");
  if (!input.createdBy.trim()) throw new Error("createdBy is required");
  return {
    id: crypto.randomUUID(), agentRole: input.agentRole, version, status: "draft",
    content: structuredClone(input.content), changeReason: input.changeReason.trim(), createdBy: input.createdBy,
    createdAt: now.toISOString(), publishedAt: null, archivedAt: null,
  };
}

export function publishVersion(draft: AgentKnowledgeVersion, now = new Date()): AgentKnowledgeVersion {
  if (draft.status !== "draft") throw new Error("Only a draft can be published");
  assertValidKnowledge(draft.content);
  return { ...structuredClone(draft), status: "published", publishedAt: now.toISOString() };
}

export function archiveVersion(version: AgentKnowledgeVersion, now = new Date()): AgentKnowledgeVersion {
  if (version.status !== "published") throw new Error("Only a published version can be archived");
  return { ...structuredClone(version), status: "archived", archivedAt: now.toISOString() };
}
