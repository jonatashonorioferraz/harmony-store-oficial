import type { ExcellenceArtifactType, ExcellenceItem } from "../../domain/excellence/excellence-item.ts";

export type ExcellenceSearch = { artifactType?: ExcellenceArtifactType; marketplace?: string; productCategory?: string; agentRole?: string; limit?: number };
export interface ExcellenceLibraryRepository {
  save(item: ExcellenceItem): Promise<void>;
  findById(id: string): Promise<ExcellenceItem | null>;
  findByCandidateId(candidateId: string): Promise<ExcellenceItem | null>;
  searchActive(filters: ExcellenceSearch): Promise<ExcellenceItem[]>;
}
