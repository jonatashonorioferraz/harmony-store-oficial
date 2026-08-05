import type { WorkflowOrchestrator } from "../orchestration/workflow-orchestrator.ts";
import type { AdProjectRepository } from "../ports/ad-project-repository.ts";
import type { AuditEventRepository } from "../ports/audit-event-repository.ts";
import type { ProductSnapshotRepository } from "../ports/product-snapshot-repository.ts";
import type { SourceAssetRepository } from "../ports/source-asset-repository.ts";
import type { AssetStorage } from "../ports/asset-storage.ts";
import { ProjectService } from "../projects/project-service.ts";
import { SourceAssetService } from "../assets/source-asset-service.ts";

export class StartStudioWorkflow {
  private readonly projects: AdProjectRepository; private readonly audit: AuditEventRepository; private readonly snapshots: ProductSnapshotRepository; private readonly assets: SourceAssetService; private readonly orchestrator: WorkflowOrchestrator;
  constructor(input: { projects: AdProjectRepository; audit: AuditEventRepository; snapshots: ProductSnapshotRepository; assetMetadata: SourceAssetRepository; storage: AssetStorage; orchestrator: WorkflowOrchestrator }) { this.projects = input.projects; this.audit = input.audit; this.snapshots = input.snapshots; this.assets = new SourceAssetService(input.storage, input.assetMetadata); this.orchestrator = input.orchestrator; }
  async execute(input: { ownerId: string; facts: Record<string, unknown>; images: File[] }) {
    if (input.images.length !== 4) throw new Error("Envie exatamente quatro fotos"); const timestamp = new Date().toISOString(); const projectId = crypto.randomUUID();
    await new ProjectService(this.projects, this.audit).create({ id: projectId, ownerId: input.ownerId, name: String(input.facts.product ?? "Novo anúncio"), marketplace: String(input.facts.marketplace ?? "Shopee"), actorId: input.ownerId, auditId: crypto.randomUUID(), now: timestamp });
    await this.snapshots.save({ id: crypto.randomUUID(), projectId, version: 1, facts: input.facts, createdBy: input.ownerId, createdAt: timestamp });
    const assets = []; for (const file of input.images) assets.push(await this.assets.store({ id: crypto.randomUUID(), projectId, kind: "source", originalName: file.name, contentType: file.type, body: await file.arrayBuffer(), now: timestamp }));
    const workflowId = crypto.randomUUID(); await this.orchestrator.start({ id: workflowId, projectId, initialData: { marketplace: input.facts.marketplace ?? "Shopee", productCategory: input.facts.productCategory ?? "mini-sabonetes", product: { declaredFacts: input.facts, approvedFacts: input.facts }, assetMetadata: assets, assets: assets.map((asset) => ({ id: asset.id, name: asset.originalName, contentType: asset.contentType })), marketplacePolicy: { titleLimit: 120, noUnprovenClaims: true }, brandRules: { name: "Harmony Store Oficial", style: "profissional, elegante e fiel" }, artifactMetadata: {} }, actorId: input.ownerId, auditId: crypto.randomUUID(), now: timestamp });
    return { projectId, workflowId };
  }
}
