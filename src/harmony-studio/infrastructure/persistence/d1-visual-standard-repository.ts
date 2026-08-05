import type { VisualStandard, VisualStandardRepository } from "../../application/ports/visual-standard-repository.ts";
import type { VisualShotType } from "../../application/ports/visual-reference-repository.ts";
import type { D1DatabasePort } from "./d1-types.ts";

type Row = { id:string; category:string; shot_type:VisualShotType; version:number; purpose:string; specification_json:string; source_reference_ids_json:string };

export class D1VisualStandardRepository implements VisualStandardRepository {
  constructor(private readonly db:D1DatabasePort) {}
  async findPublished(category:string,shotType:VisualShotType) {
    const row=await this.db.prepare("SELECT id, category, shot_type, version, purpose, specification_json, source_reference_ids_json FROM studio_visual_standard_versions WHERE category = ? AND shot_type = ? AND status = 'published' ORDER BY version DESC LIMIT 1").bind(category,shotType).first<Row>();
    return row?{id:row.id,category:row.category,shotType:row.shot_type,version:row.version,purpose:row.purpose,specification:JSON.parse(row.specification_json),sourceReferenceIds:JSON.parse(row.source_reference_ids_json)}:null;
  }
}
