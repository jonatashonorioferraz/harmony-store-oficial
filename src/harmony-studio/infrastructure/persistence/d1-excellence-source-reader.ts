import type { ExcellenceApproval, ExcellenceCandidate, ExcellenceSourceReader } from "../../application/ports/excellence-source-reader.ts";
import type { D1DatabasePort } from "./d1-types.ts";

type CandidateRow = { id: string; project_id: string; artifact_type: ExcellenceCandidate["artifactType"]; status: string };
type ApprovalRow = { id: string; candidate_id: string; decision: string; reviewer_role: string; reasons_json: string };

export class D1ExcellenceSourceReader implements ExcellenceSourceReader {
  private readonly db: D1DatabasePort;
  constructor(db: D1DatabasePort) { this.db = db; }
  async findCandidate(candidateId: string) { const row = await this.db.prepare("SELECT id, project_id, artifact_type, status FROM studio_artifact_candidates WHERE id = ?").bind(candidateId).first<CandidateRow>(); return row ? { id: row.id, projectId: row.project_id, artifactType: row.artifact_type, status: row.status } : null; }
  async findLatestApproval(candidateId: string): Promise<ExcellenceApproval | null> { const row = await this.db.prepare("SELECT id, candidate_id, decision, reviewer_role, reasons_json FROM studio_review_decisions WHERE candidate_id = ? AND decision = 'approved' ORDER BY created_at DESC LIMIT 1").bind(candidateId).first<ApprovalRow>(); return row ? { id: row.id, candidateId: row.candidate_id, decision: row.decision, reviewerRole: row.reviewer_role, reasons: JSON.parse(row.reasons_json) } : null; }
}
