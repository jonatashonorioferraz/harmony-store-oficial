import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth.ts";
import { bindings, runtime } from "../shared.ts";
import { ensureDefaultAgentKnowledge } from "../../../../src/harmony-studio/application/intelligence/bootstrap-agent-knowledge.ts";
import { StartStudioWorkflow } from "../../../../src/harmony-studio/application/workflows/start-studio-workflow.ts";
import { D1AdProjectRepository } from "../../../../src/harmony-studio/infrastructure/persistence/d1-ad-project-repository.ts";
import { D1AuditEventRepository } from "../../../../src/harmony-studio/infrastructure/persistence/d1-audit-event-repository.ts";
import { D1ProductSnapshotRepository } from "../../../../src/harmony-studio/infrastructure/persistence/d1-product-snapshot-repository.ts";
import { D1SourceAssetRepository } from "../../../../src/harmony-studio/infrastructure/persistence/d1-source-asset-repository.ts";
export const runtime = "edge";
export async function POST(request: Request) { try { const user = await getChatGPTUser(); if (!user) return NextResponse.json({ error: "Faça login para continuar" }, { status: 401 }); const form = await request.formData(); const images = form.getAll("images").filter((item): item is File => item instanceof File); if (images.length !== 4 || images.some((file) => !["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 10_000_000)) return NextResponse.json({ error: "Envie quatro imagens JPG, PNG ou WebP de até 10 MB" }, { status: 400 }); const facts = JSON.parse(String(form.get("product") ?? "{}")); const core = runtime(); await ensureDefaultAgentKnowledge(core.knowledge, user.id); const service = new StartStudioWorkflow({ projects: new D1AdProjectRepository(core.db), audit: new D1AuditEventRepository(core.db), snapshots: new D1ProductSnapshotRepository(core.db), assetMetadata: new D1SourceAssetRepository(core.db), storage: core.storage, orchestrator: core.orchestrator }); return NextResponse.json(await service.execute({ ownerId: user.id, facts, images })); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao iniciar o trabalho" }, { status: 500 }); } }
