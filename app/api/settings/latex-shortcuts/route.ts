import { authorizeApi } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatexShortcuts, saveLatexShortcuts } from "@/lib/data/latex-shortcuts";

const shortcutSchema = z.object({ command: z.string().trim().min(1).max(80).transform((value) => value.replace(/^[\\₩]+/, "")), replacement: z.string().min(1).max(80) });

export async function GET() { const authError = await authorizeApi("user"); if (authError) return authError; return NextResponse.json(await getLatexShortcuts()); }

export async function POST(request: Request) { const authError = await authorizeApi("editor"); if (authError) return authError;
  const parsed = shortcutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "명령어와 변환 결과를 입력해 주세요." }, { status: 400 });
  const shortcuts = await getLatexShortcuts();
  if (shortcuts.some((item) => item.command === parsed.data.command)) return NextResponse.json({ error: "이미 등록된 명령어입니다." }, { status: 409 });
  const created = { id: crypto.randomUUID(), ...parsed.data };
  await saveLatexShortcuts([...shortcuts, created]);
  return NextResponse.json(created, { status: 201 });
}
