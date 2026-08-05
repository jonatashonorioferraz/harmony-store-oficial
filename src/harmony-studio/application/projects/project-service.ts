import type { AdProjectRepository } from "../ports/ad-project-repository.ts";
import type { AuditEventRepository } from "../ports/audit-event-repository.ts";
import { createAdProject } from "../../domain/projects/ad-project.ts";

export class ProjectService {
  private readonly projects: AdProjectRepository;
  private readonly audit: AuditEventRepository;
  constructor(projects: AdProjectRepository, audit: AuditEventRepository) { this.projects = projects; this.audit = audit; }
  async create(input: { id: string; ownerId: string; name: string; marketplace: string; actorId: string; auditId: string; now?: string }) {
    const project = createAdProject(input, input.now);
    await this.projects.save(project);
    await this.audit.append({ id: input.auditId, projectId: project.id, actorId: input.actorId, eventType: "project.created", entityType: "ad_project", entityId: project.id, before: null, after: project, metadata: null, createdAt: project.createdAt });
    return project;
  }
}
