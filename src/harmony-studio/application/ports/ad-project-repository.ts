import type { AdProject } from "../../domain/projects/ad-project.ts";

export interface AdProjectRepository {
  save(project: AdProject): Promise<void>;
  findById(id: string): Promise<AdProject | null>;
  listByOwner(ownerId: string): Promise<AdProject[]>;
}
