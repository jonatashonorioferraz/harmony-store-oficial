export type AuditEvent = { id: string; projectId: string | null; actorId: string; eventType: string; entityType: string; entityId: string; before: unknown; after: unknown; metadata: unknown; createdAt: string };
export interface AuditEventRepository { append(event: AuditEvent): Promise<void>; listByProject(projectId: string): Promise<AuditEvent[]>; }
