import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const studioAdProjects = sqliteTable("studio_ad_projects", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), name: text("name").notNull(),
  marketplace: text("marketplace").notNull(), status: text("status", { enum: ["draft", "ready", "running", "review_required", "approved", "exported"] }).notNull(),
  activeWorkflowRunId: text("active_workflow_run_id"), ...timestamps,
}, (table) => [index("studio_projects_owner_status_idx").on(table.ownerId, table.status)]);

export const studioProductSnapshots = sqliteTable("studio_product_snapshots", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => studioAdProjects.id, { onDelete: "cascade" }),
  version: integer("version").notNull(), factsJson: text("facts_json").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("studio_snapshots_project_version_unique").on(table.projectId, table.version)]);

export const studioSourceAssets = sqliteTable("studio_source_assets", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => studioAdProjects.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["source", "candidate", "approved", "export"] }).notNull(), storageKey: text("storage_key").notNull(),
  contentType: text("content_type").notNull(), sizeBytes: integer("size_bytes").notNull(), sha256: text("sha256").notNull(), originalName: text("original_name"), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("studio_assets_storage_key_unique").on(table.storageKey), index("studio_assets_project_kind_idx").on(table.projectId, table.kind)]);

export const studioWorkflowRuns = sqliteTable("studio_workflow_runs", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => studioAdProjects.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "running", "review_required", "succeeded", "failed", "cancelled"] }).notNull(),
  configurationJson: text("configuration_json").notNull(), startedAt: text("started_at"), completedAt: text("completed_at"), ...timestamps,
}, (table) => [index("studio_workflows_project_status_idx").on(table.projectId, table.status)]);

export const studioStageRuns = sqliteTable("studio_stage_runs", {
  id: text("id").primaryKey(), workflowRunId: text("workflow_run_id").notNull().references(() => studioWorkflowRuns.id, { onDelete: "cascade" }),
  stageKey: text("stage_key").notNull(), attempt: integer("attempt").notNull(), status: text("status", { enum: ["pending", "running", "succeeded", "failed", "blocked", "cancelled"] }).notNull(),
  idempotencyKey: text("idempotency_key").notNull(), agentRole: text("agent_role"), knowledgeVersionId: text("knowledge_version_id"),
  inputHash: text("input_hash"), outputJson: text("output_json"), errorJson: text("error_json"), usageJson: text("usage_json"), startedAt: text("started_at"), completedAt: text("completed_at"), ...timestamps,
}, (table) => [uniqueIndex("studio_stage_idempotency_unique").on(table.idempotencyKey), uniqueIndex("studio_stage_attempt_unique").on(table.workflowRunId, table.stageKey, table.attempt), index("studio_stage_workflow_status_idx").on(table.workflowRunId, table.status)]);

export const studioAgentKnowledgeVersions = sqliteTable("studio_agent_knowledge_versions", {
  id: text("id").primaryKey(), agentRole: text("agent_role").notNull(), version: integer("version").notNull(), status: text("status", { enum: ["draft", "published", "archived"] }).notNull(),
  contentJson: text("content_json").notNull(), changeReason: text("change_reason").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(), publishedAt: text("published_at"), archivedAt: text("archived_at"),
}, (table) => [uniqueIndex("studio_knowledge_role_version_unique").on(table.agentRole, table.version), index("studio_knowledge_role_status_idx").on(table.agentRole, table.status)]);

export const studioArtifactCandidates = sqliteTable("studio_artifact_candidates", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => studioAdProjects.id, { onDelete: "cascade" }), stageRunId: text("stage_run_id").notNull().references(() => studioStageRuns.id),
  artifactType: text("artifact_type", { enum: ["title", "description", "image", "package"] }).notNull(), status: text("status", { enum: ["candidate", "pending_review", "approved", "rejected", "superseded"] }).notNull(),
  textContent: text("text_content"), assetId: text("asset_id").references(() => studioSourceAssets.id), metadataJson: text("metadata_json").notNull(), ...timestamps,
}, (table) => [index("studio_candidates_project_status_idx").on(table.projectId, table.status)]);

export const studioReviewDecisions = sqliteTable("studio_review_decisions", {
  id: text("id").primaryKey(), candidateId: text("candidate_id").notNull().references(() => studioArtifactCandidates.id, { onDelete: "cascade" }),
  reviewerRole: text("reviewer_role").notNull(), decision: text("decision", { enum: ["approved", "rejected", "changes_requested"] }).notNull(), score: integer("score"), reasonsJson: text("reasons_json").notNull(),
  knowledgeVersionId: text("knowledge_version_id"), decidedBy: text("decided_by").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("studio_reviews_candidate_idx").on(table.candidateId)]);

export const studioAuditEvents = sqliteTable("studio_audit_events", {
  id: text("id").primaryKey(), projectId: text("project_id").references(() => studioAdProjects.id, { onDelete: "cascade" }), actorId: text("actor_id").notNull(),
  eventType: text("event_type").notNull(), entityType: text("entity_type").notNull(), entityId: text("entity_id").notNull(), beforeJson: text("before_json"), afterJson: text("after_json"), metadataJson: text("metadata_json"), createdAt: text("created_at").notNull(),
}, (table) => [index("studio_audit_project_created_idx").on(table.projectId, table.createdAt), index("studio_audit_entity_idx").on(table.entityType, table.entityId)]);

export const studioExcellenceItems = sqliteTable("studio_excellence_items", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => studioAdProjects.id, { onDelete: "cascade" }),
  candidateId: text("candidate_id").notNull().references(() => studioArtifactCandidates.id), reviewDecisionId: text("review_decision_id").notNull().references(() => studioReviewDecisions.id),
  artifactType: text("artifact_type", { enum: ["title", "description", "image", "package"] }).notNull(), marketplace: text("marketplace").notNull(),
  productCategory: text("product_category").notNull(), agentRole: text("agent_role").notNull(), contextJson: text("context_json").notNull(),
  decisionsJson: text("decisions_json").notNull(), approvalReason: text("approval_reason").notNull(), tagsJson: text("tags_json").notNull(),
  status: text("status", { enum: ["active", "retired"] }).notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(), retiredAt: text("retired_at"),
}, (table) => [
  uniqueIndex("studio_excellence_candidate_unique").on(table.candidateId),
  index("studio_excellence_type_marketplace_idx").on(table.artifactType, table.marketplace, table.status),
  index("studio_excellence_category_status_idx").on(table.productCategory, table.status),
]);

export const studioUsageLedger = sqliteTable("studio_usage_ledger", {
  id: text("id").primaryKey(), projectId: text("project_id").notNull().references(() => studioAdProjects.id, { onDelete: "cascade" }),
  workflowRunId: text("workflow_run_id").notNull().references(() => studioWorkflowRuns.id, { onDelete: "cascade" }), idempotencyKey: text("idempotency_key").notNull(),
  reservedUsdMicros: integer("reserved_usd_micros").notNull(), actualUsdMicros: integer("actual_usd_micros"), usageJson: text("usage_json"),
  status: text("status", { enum: ["reserved", "recorded", "released"] }).notNull(), ...timestamps,
}, (table) => [uniqueIndex("studio_usage_idempotency_unique").on(table.idempotencyKey), index("studio_usage_project_status_idx").on(table.projectId, table.status)]);

export const studioConfigurationVersions = sqliteTable("studio_configuration_versions", {
  id: text("id").primaryKey(), key: text("key").notNull(), version: integer("version").notNull(),
  valueJson: text("value_json").notNull(), status: text("status", { enum: ["active", "superseded"] }).notNull(),
  changeReason: text("change_reason").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("studio_configuration_key_version_unique").on(table.key, table.version), index("studio_configuration_key_status_idx").on(table.key, table.status)]);

export const studioCategoryPaletteVersions = sqliteTable("studio_category_palette_versions", {
  id: text("id").primaryKey(), category: text("category").notNull(), paletteName: text("palette_name").notNull(), version: integer("version").notNull(),
  optionsJson: text("options_json").notNull(), status: text("status", { enum: ["active", "superseded", "retired"] }).notNull(),
  changeReason: text("change_reason").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [uniqueIndex("studio_palette_category_name_version_unique").on(table.category, table.paletteName, table.version), index("studio_palette_category_status_idx").on(table.category, table.status)]);
