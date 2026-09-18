import { z } from "zod";

const itemSchema: z.ZodType<{ text: string; children?: { text: string; children?: unknown[] }[] }> = z.lazy(() =>
  z.object({ text: z.string().min(1), children: z.array(itemSchema).optional() }),
) as never;

export const importDrugSchema = z.object({
  koreanName: z.string().min(1),
  latinName: z.string().optional(),
  origin: z.string().optional(),
  scientificName: z.string().optional(),
  family: z.object({ koreanName: z.string().optional(), scientificName: z.string().min(1) }).optional(),
  medicinalPart: z.string().optional(),
  category: z.string().min(1),
  importance: z.enum(["중요", "중간", "비중요"]).default("중간"),
  sections: z.array(z.object({ title: z.string().min(1), items: z.array(itemSchema) })).default([]),
});

export const pharmacognosyImportV1Schema = z.object({
  schema: z.literal("pharmacognosy.import"),
  version: z.literal(1),
  drugs: z.array(importDrugSchema).min(1),
});

export type PharmacognosyImportV1 = z.infer<typeof pharmacognosyImportV1Schema>;
export const importExample: PharmacognosyImportV1 = {
  schema: "pharmacognosy.import",
  version: 1,
  drugs: [{
    koreanName: "진피",
    latinName: "Citri Unshius Pericarpium",
    category: "과실류",
    origin: "귤나무의 잘 익은 열매껍질",
    scientificName: "Citrus unshiu",
    importance: "중간",
    sections: [{ title: "성분", items: [{ text: "Flavonoid", children: [{ text: "Hesperidin (정량성분)" }] }] }],
  }],
};
