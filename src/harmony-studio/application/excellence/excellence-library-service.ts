import type { AuditEventRepository } from "../ports/audit-event-repository.ts";
import type { ExcellenceLibraryRepository, ExcellenceSearch } from "../ports/excellence-library-repository.ts";
import type { ExcellenceSourceReader } from "../ports/excellence-source-reader.ts";
import { createExcellenceItem, retireExcellenceItem } from "../../domain/excellence/excellence-item.ts";

export class ExcellenceLibraryService {
  private readonly library: ExcellenceLibraryRepository;
  private readonly sources: ExcellenceSourceReader;
  private readonly audit: AuditEventRepository;
  constructor(library: ExcellenceLibraryRepository, sources: ExcellenceSourceReader, audit: AuditEventRepository) { this.library = library; this.sources = sources; this.audit = audit; }

  async curate(input: { id: string; candidateId: string; marketplace: string; productCategory: string; agentRole: string; context: Record<string, unknown>; decisions: string[]; approvalReason: string; tags: string[]; actorId: string; auditId: string; now?: string }) {
    if (await this.library.findByCandidateId(input.candidateId)) throw new Error("Candidate is already in the Excellence Library");
    const candidate = await this.sources.findCandidate(input.candidateId);
    if (!candidate || candidate.status !== "approved") throw new Error("Only an approved candidate can enter the Excellence Library");
    const approval = await this.sources.findLatestApproval(input.candidateId);
    if (!approval || approval.decision !== "approved") throw new Error("An approved review decision is required");
    const item = createExcellenceItem({ id: input.id, projectId: candidate.projectId, candidateId: input.candidateId, reviewDecisionId: approval.id, artifactType: candidate.artifactType, marketplace: input.marketplace, productCategory: input.productCategory, agentRole: input.agentRole, context: input.context, decisions: input.decisions, approvalReason: input.approvalReason || approval.reasons.join("; "), tags: input.tags, createdBy: input.actorId, now: input.now });
    await this.library.save(item);
    await this.audit.append({ id: input.auditId, projectId: item.projectId, actorId: input.actorId, eventType: "excellence.item_curated", entityType: "excellence_item", entityId: item.id, before: null, after: item, metadata: { candidateId: item.candidateId, reviewDecisionId: item.reviewDecisionId }, createdAt: item.createdAt });
    return item;
  }

  async retire(input: { id: string; actorId: string; auditId: string; now?: string }) {
    const current = await this.library.findById(input.id);
    if (!current) throw new Error("Excellence item not found");
    const retired = retireExcellenceItem(current, input.now);
    await this.library.save(retired);
    await this.audit.append({ id: input.auditId, projectId: retired.projectId, actorId: input.actorId, eventType: "excellence.item_retired", entityType: "excellence_item", entityId: retired.id, before: current, after: retired, metadata: null, createdAt: input.now ?? new Date().toISOString() });
    return retired;
  }

  search(filters: ExcellenceSearch) { return this.library.searchActive(filters); }
}
