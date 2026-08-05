import type { ExcellenceArtifactType } from "../../domain/excellence/excellence-item.ts";

export type ExcellenceCandidate = { id: string; projectId: string; artifactType: ExcellenceArtifactType; status: string };
export type ExcellenceApproval = { id: string; candidateId: string; decision: string; reviewerRole: string; reasons: string[] };
export interface ExcellenceSourceReader {
  findCandidate(candidateId: string): Promise<ExcellenceCandidate | null>;
  findLatestApproval(candidateId: string): Promise<ExcellenceApproval | null>;
}
