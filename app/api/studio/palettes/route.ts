import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth.ts";
import { bindings } from "../shared.ts";
export const runtime = "edge";
export async function GET(request: Request) { const user = await getChatGPTUser(); if (!user) return NextResponse.json({ error: "Faça login para continuar" }, { status: 401 }); const category = new URL(request.url).searchParams.get("category")?.trim(); if (!category) return NextResponse.json({ palettes: [] }); const result = await bindings().db.prepare("SELECT id, category, palette_name, version, options_json FROM studio_category_palette_versions WHERE category = ? AND status = 'active' ORDER BY palette_name").bind(category).all<any>(); return NextResponse.json({ palettes: (result.results ?? []).map((row) => ({ id: row.id, category: row.category, name: row.palette_name, version: row.version, options: JSON.parse(row.options_json) })) }); }
