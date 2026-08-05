import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../../chatgpt-auth.ts";
import { assertWorkflowOwner, bindings, workflowStatus } from "../shared.ts";
export const runtime = "edge";
export async function GET(request: Request) { try { const user = await getChatGPTUser(); if (!user) return NextResponse.json({ error: "Faça login para continuar" }, { status: 401 }); const id = new URL(request.url).searchParams.get("id"); if (!id) return NextResponse.json({ error: "Trabalho inválido" }, { status: 400 }); const { db } = bindings(); await assertWorkflowOwner(db, id, user.id); return NextResponse.json(await workflowStatus(db, id)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao recuperar o trabalho" }, { status: 500 }); } }
