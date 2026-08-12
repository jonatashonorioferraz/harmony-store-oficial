import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const [sql,actorIndex,validation,js,pdfHelper,css,index,worker,help,manual,technical,pdfCorrection,reissueTechnical,backup,recovery,pkg,qrcode]=await Promise.all([
  readFile(new URL('supabase/migrations/20260811133000_production_inventory_thermal_labels.sql',root),'utf8'),
  readFile(new URL('supabase/migrations/20260811150000_production_inventory_label_print_actor_index.sql',root),'utf8'),
  readFile(new URL('supabase/validation/20260811133000_production_inventory_thermal_labels.sql',root),'utf8'),
  readFile(new URL('production-inventory.js',root),'utf8'),
  readFile(new URL('thermal-label-pdf.js',root),'utf8'),
  readFile(new URL('production-inventory.css',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('service-worker.js',root),'utf8'),
  readFile(new URL('help-center.js',root),'utf8'),
  readFile(new URL('docs/manual/MANUAL-DO-APLICATIVO.md',root),'utf8'),
  readFile(new URL('docs/technical/ETIQUETAS-TERMICAS-INVENTARIO-V25.70.md',root),'utf8'),
  readFile(new URL('docs/technical/CORRECAO-PDF-ETIQUETA-V25.71.md',root),'utf8'),
  readFile(new URL('docs/technical/REEMISSAO-ETIQUETAS-CAIXAS-V25.72.md',root),'utf8'),
  readFile(new URL('scripts/create-api-backup.mjs',root),'utf8'),
  readFile(new URL('scripts/execute-api-recovery.mjs',root),'utf8'),
  readFile(new URL('package.json',root),'utf8'),
  readFile(new URL('vendor/qrcode-generator-2.0.4.js',root),'utf8'),
]);

test('migração cria pré-cadastro, confirmação e auditoria sem renumerar caixas',()=>{
  assert.match(sql,/add column if not exists label_status text not null default 'applied'/);
  assert.match(sql,/add column if not exists label_token uuid not null default gen_random_uuid\(\)/);
  assert.match(sql,/create table if not exists public\.production_inventory_label_prints/);
  assert.match(sql,/create or replace function public\.create_production_inventory_entry_v3/);
  assert.match(sql,/p_quantity,0,v_actor,p_box_number,'pending'/);
  assert.match(sql,/create or replace function public\.confirm_production_inventory_label_applied/);
  assert.match(sql,/label_status='applied',label_applied_at=now\(\),label_applied_by=v_actor/);
  assert.match(sql,/production_inventory\.box_label_applied/);
  assert.match(sql,/create or replace function public\.cancel_pending_production_inventory_label/);
  assert.match(sql,/production_inventory\.box_label_cancelled/);
  assert.doesNotMatch(sql,/restart\s+(identity|with)|setval\s*\(/i);
  assert.doesNotMatch(sql,/delete from public\.production_inventory_entries/i);
});

test('banco impede saldo e movimentação antes da etiqueta física',()=>{
  assert.match(sql,/label_status='pending' and current_quantity=0/);
  assert.match(sql,/label_status='cancelled' and current_quantity=0/);
  assert.match(sql,/production_inventory_label_state_guard/);
  assert.match(sql,/production_inventory_movement_label_guard/);
  assert.match(sql,/A caixa só pode movimentar estoque depois que a etiqueta for confirmada/);
  assert.match(sql,/where e\.label_status='applied' and e\.current_quantity>0 and e\.transferred_at is null/);
});

test('RPCs e tabela de impressão seguem segurança do Supabase',()=>{
  assert.match(sql,/alter table public\.production_inventory_label_prints enable row level security/);
  assert.match(sql,/revoke all privileges on table public\.production_inventory_label_prints from public,anon,authenticated/);
  assert.match(sql,/security definer\s+set search_path = ''/g);
  for(const name of ['create_production_inventory_entry_v3','confirm_production_inventory_label_applied','record_production_inventory_label_print','cancel_pending_production_inventory_label','list_pending_production_inventory_labels','get_production_inventory_box_by_label_token','list_production_inventory_entries_v4']){
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}`));
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}[\\s\\S]*to authenticated,service_role`));
  }
  assert.match(validation,/estados_invalidos/);
  assert.match(sql,/production_inventory_label_prints_entry_idx/);
  assert.match(actorIndex,/production_inventory_label_prints_printed_by_idx/);
  assert.match(actorIndex,/\(printed_by,printed_at desc\)/);
});

test('QR é opaco, local e protegido pela mesma permissão do módulo',()=>{
  assert.match(sql,/where e\.label_token=p_label_token and e\.label_status<>'cancelled'/);
  assert.match(sql,/private\.can_manage_production_inventory\(\)/g);
  assert.match(js,/url\.searchParams\.set\('inventoryBox',entry\.label_token\)/);
  assert.doesNotMatch(js,/api\.qrserver|chart\.googleapis|quickchart/i);
  assert.match(qrcode,/Copyright \(c\) 2009 Kazuhiko Arase/);
  assert.match(qrcode,/Licensed under the MIT license/);
});

test('interface produz etiqueta paisagem 150 x 100 responsiva com logotipo e foto oficial',()=>{
  assert.match(js,/LABEL_WIDTH=1200,LABEL_HEIGHT=800,LABEL_TEMPLATE='150x100-landscape-v2'/);
  assert.match(js,/canvas\.dataset\.labelTemplate=LABEL_TEMPLATE/);
  assert.match(js,/loadImage\('logo\.jpg\?v=25\.70'\)/);
  assert.match(js,/drawThermalProductPhoto/);
  assert.match(js,/imageUrl\(path\),true/);
  assert.match(js,/@page\{size:150mm 100mm;margin:0\}/);
  assert.match(js,/Baixar PNG/);
  assert.match(js,/Gerar PDF 150 × 100/);
  assert.match(js,/Imprimir etiqueta/);
  assert.match(js,/Confirmar etiqueta aplicada/);
  assert.match(css,/production-inventory-label-preview canvas/);
  assert.match(css,/production-inventory-label-printing/);
  assert.match(css,/width:150mm!important;height:100mm!important/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/@media\(max-width:480px\)/);
});

test('PDF térmico é binário, local e possui uma única página física 150 x 100',()=>{
  assert.match(pdfHelper,/\/Type \/Pages \/Kids \[3 0 R\] \/Count 1/);
  assert.match(pdfHelper,/\/MediaBox \[0 0 \$\{pageWidth\} \$\{pageHeight\}\]/);
  assert.match(pdfHelper,/new Blob\(\[pdf\],\{type:'application\/pdf'\}\)/);
  assert.match(js,/createPdfBlobFromCanvas\(canvas,\{widthMm:150,heightMm:100/);
  assert.match(index,/thermal-label-pdf\.js\?v=25\.71/);
  assert.match(pdfCorrection,/425,1969 × 283,4646 pontos/);
});

test('caixas disponíveis permitem gerar ou reimprimir a mesma etiqueta com auditoria',()=>{
  assert.match(js,/data-inventory-reissue-label/);
  assert.match(js,/Gerar \/ reimprimir etiqueta/);
  assert.match(js,/function labelReissueModal\(entry,modelId,colorId\)/);
  assert.match(js,/Caixa anterior ao sistema de etiquetas/);
  assert.match(js,/Etiqueta danificada/);
  assert.match(js,/Motivo registrado:/);
  assert.match(js,/recordLabelOutput\(entry,format,reissueReason=null\)/);
  assert.match(js,/p_reason:reissueReason\.trim\(\)/);
  assert.match(js,/O código permanente e o QR Code serão preservados\. Nenhum saldo ou movimento será alterado\./);
  assert.doesNotMatch(js,/labelReissueModal[\s\S]{0,2500}create_production_inventory_entry_v3/);
  assert.match(reissueTechnical,/## Invariantes preservadas/);
  assert.match(reissueTechnical,/não é recriado/);
});

test('pendências são retomáveis e não entram no contador',()=>{
  assert.match(js,/rpc\('list_pending_production_inventory_labels'/);
  assert.match(js,/pendingLabelsPanel\(\)/);
  assert.match(js,/O saldo só entra no inventário depois que a etiqueta física for aplicada e confirmada/);
  assert.match(sql,/where e\.label_status='pending'/);
  assert.match(sql,/where e\.label_status='applied' and e\.current_quantity>0 and e\.transferred_at is null/);
});

test('PWA, ajuda, documentação e continuidade incluem a nova função',()=>{
  assert.match(index,/vendor\/qrcode-generator-2\.0\.4\.js\?v=2\.0\.4/);
  assert.match(index,/production-inventory\.css\?v=25\.72/);
  assert.match(index,/production-inventory\.js\?v=25\.73/);
  assert.match(worker,/harmony-store-v25-76/);
  assert.match(worker,/vendor\/qrcode-generator-2\.0\.4\.js\?v=2\.0\.4/);
  assert.match(help,/Gerar etiqueta 150 × 100/);
  assert.match(manual,/Etiquetas pendentes/);
  assert.match(technical,/label_token/);
  assert.match(backup,/'production_inventory_label_prints'/);
  assert.match(recovery,/production_inventory_label_prints: \['protocol'\]/);
  assert.equal(JSON.parse(pkg).version,'25.76.0');
});
