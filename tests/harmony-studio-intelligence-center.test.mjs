import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { IntelligenceCenter } from "../src/harmony-studio/application/intelligence/intelligence-center.ts";
import { InMemoryAgentKnowledgeRepository } from "../src/harmony-studio/infrastructure/intelligence/in-memory-agent-knowledge-repository.ts";
import { DEFAULT_AGENT_KNOWLEDGE } from "../src/harmony-studio/intelligence/catalog/default-agents.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("intelligence center separates domain, application port and infrastructure", async () => {
  const [domain, service, port, repository] = await Promise.all([
    read("src/harmony-studio/domain/intelligence/agent-knowledge.ts"),
    read("src/harmony-studio/application/intelligence/intelligence-center.ts"),
    read("src/harmony-studio/application/ports/agent-knowledge-repository.ts"),
    read("src/harmony-studio/infrastructure/intelligence/in-memory-agent-knowledge-repository.ts"),
  ]);
  assert.match(domain, /status: KnowledgeStatus/);
  assert.match(domain, /Only a draft can be published/);
  assert.match(service, /class IntelligenceCenter/);
  assert.match(service, /archiveVersion\(current\)/);
  assert.match(port, /interface AgentKnowledgeRepository/);
  assert.match(repository, /class InMemoryAgentKnowledgeRepository/);
  assert.doesNotMatch(domain, /openai|fetch\(|cloudflare|react/i);
});

test("catalog defines all eight agents with isolated contracts and quality rules", async () => {
  const catalog = await read("src/harmony-studio/intelligence/catalog/default-agents.ts");
  for (const role of ["triage", "visual-analyst", "marketplace-strategist", "copywriter", "art-director", "virtual-photographer", "compliance-reviewer", "quality-director"]) assert.match(catalog, new RegExp(`\\"${role}\\"`));
  assert.match(catalog, /allowedContext/);
  assert.match(catalog, /forbiddenContext/);
  assert.match(catalog, /qualityChecklist/);
  assert.match(catalog, /inputContract/);
  assert.match(catalog, /outputContract/);
  assert.doesNotMatch(catalog, /OPENAI_API_KEY|api\.openai\.com/);
});

test("creates, publishes, retrieves and supersedes immutable knowledge versions without AI", async () => {
  const center = new IntelligenceCenter(new InMemoryAgentKnowledgeRepository());
  const firstDraft = await center.createDraft({ agentRole: "triage", content: DEFAULT_AGENT_KNOWLEDGE.triage, changeReason: "Initial senior standard", createdBy: "phase-2-test" });
  assert.equal(firstDraft.status, "draft");
  assert.equal(firstDraft.version, 1);
  const firstPublished = await center.publish(firstDraft.id);
  assert.equal((await center.getPublished("triage")).id, firstPublished.id);

  const secondDraft = await center.createDraft({ agentRole: "triage", content: { ...DEFAULT_AGENT_KNOWLEDGE.triage, mission: "Validate inputs and cost readiness." }, changeReason: "Add cost readiness", createdBy: "phase-2-test" });
  assert.equal(secondDraft.version, 2);
  const secondPublished = await center.publish(secondDraft.id);
  assert.equal((await center.getPublished("triage")).id, secondPublished.id);
  const history = await center.history("triage");
  assert.equal(history.find((item) => item.id === firstPublished.id)?.status, "archived");
  assert.equal(history.find((item) => item.id === secondPublished.id)?.status, "published");
});
