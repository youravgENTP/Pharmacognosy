import { authorizeApi } from "@/lib/auth/permissions";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createReferenceDrug } from "@/lib/data/reference-drug";
import { formatDrugIndex } from "@/lib/drug-index";

export async function POST(request: Request) { const authError = await authorizeApi("editor"); if (authError) return authError;
  try {
    const payload = await request.json().catch(() => null);
    const parsed = z.object({ koreanName: z.string().trim().min(1).max(100) }).safeParse(payload);
    if (!parsed.success) return NextResponse.json({ error: "올바른 생약명을 입력해 주세요." }, { status: 400 });
    const result = await createReferenceDrug(parsed.data.koreanName);
    return NextResponse.json({ ...result.drug, displayIndex: formatDrugIndex(result.drug.catalogIndex, result.drug.referenceIndex), created: result.created }, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error("Failed to create reference drug", error);
    return NextResponse.json({ error: "참고 생약을 추가하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
