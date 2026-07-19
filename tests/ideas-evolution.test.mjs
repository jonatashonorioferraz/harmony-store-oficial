import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const migration = await readFile(new URL('../supabase/migrations/20260719160512_ideas_and_evolution.sql', import.meta.url), 'utf8');
const intelligence = await readFile(new URL('../web/intelligence.js', import.meta.url), 'utf8');
const intelligenceCss = await readFile(new URL('../web/intelligence.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../web/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../web/styles.css', import.meta.url), 'utf8');

test('ideas are admin-only, audited and protected by RLS', () => {
  assert.match(migration, /create table if not exists public\.improvement_ideas/i);
  assert.match(migration, /create table if not exists public\.improvement_idea_events/i);
  assert.match(migration, /alter table public\.improvement_ideas enable row level security/i);
  assert.match(migration, /improvement idea: admin read[\s\S]*private\.is_admin/i);
  assert.match(migration, /improvement idea: admin insert[\s\S]*created_by = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /protect_improvement_idea_owner/i);
  assert.match(migration, /record_improvement_idea_event/i);
  assert.match(migration, /improvement_idea\.' \|\| v_event/i);
  assert.doesNotMatch(migration, /grant[^;]*delete[^;]*improvement_ideas/i);
});

test('idea screenshots use a private, limited storage bucket', () => {
  assert.match(migration, /'idea-attachments','idea-attachments',false,3145728/i);
  assert.match(migration, /array\['image\/jpeg','image\/png','image\/webp'\]/i);
  assert.match(migration, /idea attachments: admin read[\s\S]*private\.is_admin/i);
  assert.match(migration, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/i);
});

test('intelligence includes the complete Ideas and Evolution workflow', () => {
  assert.match(intelligence, /Ideias e Evolução/);
  assert.match(intelligence, /Registrar ideia/);
  assert.match(intelligence, /improvement_ideas\?select=\*/);
  assert.match(intelligence, /improvement_idea_events\?select=\*/);
  assert.match(intelligence, /Preparar para o Codex/);
  assert.match(intelligence, /Analise esta proposta de melhoria para o Harmony Store/);
  assert.match(intelligence, /https:\/\/chatgpt\.com\/codex/);
  assert.match(intelligence, /uploadIdeaAttachment/);
  assert.match(intelligence, /image\/jpeg,image\/png,image\/webp/);
  assert.match(intelligenceCss, /\.idea-grid/);
  assert.match(intelligenceCss, /@media\(max-width:720px\)[^{]*\{\.idea-hero/);
});

test('admin request separation displays responsive product photos', () => {
  assert.match(app, /function requestItemVisual/);
  assert.match(app, /data-request-product-photo/);
  assert.match(app, /bindRequestProductPhotos\(\)/);
  assert.match(app, /request-item-copy/);
  assert.match(styles, /\.request-item-photo/);
  assert.match(styles, /@media\(max-width:720px\)[^{]*\{\.item-editor\{grid-template-columns:58px minmax\(0,1fr\)/);
});

test('Preparing an idea generates the complete Codex request', () => {
  const context = {
    window: {},
    document: { body: {}, querySelector: () => null, querySelectorAll: () => [] },
    MutationObserver: class { observe() {} },
    S: { profile: null, requests: [], products: [], team: [] },
    console,
    Date,
    Map,
    Set,
    Math,
    Number,
    String,
    Object,
    Intl,
  };
  vm.runInNewContext(intelligence, context);
  const prompt = context.window.HarmonyIntelligence.buildIdeaPrompt({
    protocol: 7,
    title: 'Fotos na separação',
    area: 'requests',
    priority: 'high',
    status: 'new',
    description: 'Mostrar a imagem de cada matéria-prima.',
    problem: 'Facilitar a identificação durante a separação.',
    review_notes: '',
  });
  assert.match(prompt, /IDEIA #0007 — Fotos na separação/);
  assert.match(prompt, /Mostrar a imagem de cada matéria-prima/);
  assert.match(prompt, /segurança, banco de dados, experiência no celular/);
  assert.match(prompt, /Só implemente depois da aprovação do plano/);
});
