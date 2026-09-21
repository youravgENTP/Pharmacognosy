import { authorizeApi } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatexShortcuts, saveLatexShortcuts } from "@/lib/data/latex-shortcuts";

const patchSchema = z.object({ command: z.string().trim().min(1).max(80).transform((value) => value.replace(/^[\\₩]+/, "")), replacement: z.string().min(1).max(80) }).partial().refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "수정할 값을 확인해 주세요." }, { status: 400 });
  const shortcuts = await getLatexShortcuts(); const current = shortcuts.find((item) => item.id === id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = { ...current, ...parsed.data };
  if (shortcuts.some((item) => item.id !== id && item.command === updated.command)) return NextResponse.json({ error: "이미 등록된 명령어입니다." }, { status: 409 });
  await saveLatexShortcuts(shortcuts.map((item) => item.id === id ? updated : item));
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const { id } = await params; const shortcuts = await getLatexShortcuts();
  if (!shortcuts.some((item) => item.id === id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await saveLatexShortcuts(shortcuts.filter((item) => item.id !== id));
  return new Response(null, { status: 204 });
}
