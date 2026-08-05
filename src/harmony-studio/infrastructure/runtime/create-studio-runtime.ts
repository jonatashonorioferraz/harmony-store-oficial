import { WorkflowOrchestrator } from "../../application/orchestration/workflow-orchestrator.ts";
import { D1AgentKnowledgeRepository } from "../persistence/d1-agent-knowledge-repository.ts";
import { D1AuditEventRepository } from "../persistence/d1-audit-event-repository.ts";
import { D1ExcellenceLibraryRepository } from "../persistence/d1-excellence-library-repository.ts";
import { D1OrchestrationRepository } from "../persistence/d1-orchestration-repository.ts";
import { D1UsageBudget } from "../persistence/d1-usage-budget.ts";
import { D1VisualReferenceRepository } from "../persistence/d1-visual-reference-repository.ts";
import { OpenAIHttpClient } from "../openai/openai-http-client.ts";
import { OpenAIStageExecutor } from "../openai/openai-stage-executor.ts";
import { R2AssetStorage, type R2BucketPort } from "../storage/r2-asset-storage.ts";
import { D1R2GeneratedAssetSink } from "../storage/d1-r2-generated-asset-sink.ts";
import { D1R2SourceAssetReader } from "../storage/d1-r2-source-asset-reader.ts";
import type { D1DatabasePort } from "../persistence/d1-types.ts";

export function createStudioRuntime(input: { db: D1DatabasePort; bucket: R2BucketPort; apiKey: string }) {
  const storage = new R2AssetStorage(input.bucket); const knowledge = new D1AgentKnowledgeRepository(input.db); const audit = new D1AuditEventRepository(input.db); const repository = new D1OrchestrationRepository(input.db);
  const executor = new OpenAIStageExecutor({ client: new OpenAIHttpClient({ apiKey: input.apiKey }), budget: new D1UsageBudget(input.db), assets: new D1R2GeneratedAssetSink(input.db, storage), sourceAssets: new D1R2SourceAssetReader(input.db, storage) });
  return { storage, knowledge, audit, repository, orchestrator: new WorkflowOrchestrator({ repository, knowledge, excellence: new D1ExcellenceLibraryRepository(input.db), executor, audit, visualReferences: new D1VisualReferenceRepository(input.db) }) };
}
