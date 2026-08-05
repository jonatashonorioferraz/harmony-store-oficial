import type { VisualShotType } from "./visual-reference-repository.ts";

export type VisualStandard = {
  id: string;
  category: string;
  shotType: VisualShotType;
  version: number;
  purpose: string;
  specification: {
    composition: string;
    lighting: string;
    background: string;
    palette: string;
    typography: string;
    requiredElements: string[];
    forbiddenElements: string[];
    approvalChecklist: string[];
  };
  sourceReferenceIds: string[];
};

export interface VisualStandardRepository {
  findPublished(category: string, shotType: VisualShotType): Promise<VisualStandard | null>;
}
