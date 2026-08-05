import type { VisualReference, VisualReferenceRepository, VisualShotType } from "../../application/ports/visual-reference-repository.ts";
import type { D1DatabasePort } from "./d1-types.ts";

type Row = { id: string; title: string; shot_type: VisualShotType; transfer_mode: VisualReference["transferMode"]; guidance: string; never_do_json: string; analysis_json:string|null };
export class D1VisualReferenceRepository implements VisualReferenceRepository {
  constructor(private readonly db: D1DatabasePort) {}
  async search(input: { category: string; modelName: string; shotType: VisualShotType; limit?: number; preferredId?: string }) {
    const limit = Math.min(Math.max(input.limit ?? 2, 1), 3);
    if (input.preferredId) { const preferred = await this.db.prepare("SELECT id, title, shot_type, transfer_mode, guidance, never_do_json, analysis_json FROM studio_visual_references WHERE id = ? AND shot_type = ? AND status = 'active' AND analysis_status = 'approved'").bind(input.preferredId, input.shotType).first<Row>(); return preferred ? [{ id: preferred.id, title: preferred.title, shotType: preferred.shot_type, transferMode: preferred.transfer_mode, guidance: preferred.guidance, neverDo: JSON.parse(preferred.never_do_json), analysis:preferred.analysis_json?JSON.parse(preferred.analysis_json):null }] : []; }
    const result = await this.db.prepare(`SELECT id, title, shot_type, transfer_mode, guidance, never_do_json, analysis_json
      FROM studio_visual_references
      WHERE status = 'active' AND analysis_status = 'approved' AND shot_type = ? AND (
        (scope = 'model' AND category = ? AND lower(model_name) = lower(?)) OR
        (scope = 'category' AND category = ?) OR scope = 'global'
      )
      ORDER BY CASE scope WHEN 'model' THEN 1 WHEN 'category' THEN 2 ELSE 3 END, created_at DESC LIMIT ?`)
      .bind(input.shotType, input.category, input.modelName, input.category, limit).all<Row>();
    return (result.results ?? []).map((row) => ({ id: row.id, title: row.title, shotType: row.shot_type, transferMode: row.transfer_mode, guidance: row.guidance, neverDo: JSON.parse(row.never_do_json), analysis:row.analysis_json?JSON.parse(row.analysis_json):null }));
  }
}
