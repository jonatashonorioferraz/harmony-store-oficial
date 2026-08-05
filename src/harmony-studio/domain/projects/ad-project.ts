export type AdProjectStatus = "draft" | "ready" | "running" | "review_required" | "approved" | "exported";
export type AdProject = { id: string; ownerId: string; name: string; marketplace: string; status: AdProjectStatus; activeWorkflowRunId: string | null; createdAt: string; updatedAt: string };
export type CreateAdProjectInput = { id?: string; ownerId: string; name: string; marketplace: string };

export function createAdProject(input: CreateAdProjectInput, now: Date | string = new Date()): AdProject {
  if (!input.ownerId.trim() || !input.name.trim() || !input.marketplace.trim()) throw new Error("Owner, name and marketplace are required");
  const timestamp = typeof now === "string" ? now : now.toISOString();
  return { id: input.id ?? crypto.randomUUID(), ownerId: input.ownerId, name: input.name.trim(), marketplace: input.marketplace.trim(), status: "draft", activeWorkflowRunId: null, createdAt: timestamp, updatedAt: timestamp };
}
