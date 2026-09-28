import { z } from "zod";

export type ImportItem = {
  text: string;
  html?: string;
  bold?: boolean;
  italic?: boolean;
  highlight?: boolean;
  children?: ImportItem[];
};

export const importItemSchema: z.ZodType<ImportItem> = z.lazy(() => z.object({
  text: z.string().trim().min(1),
  html: z.string().max(20000).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  highlight: z.boolean().optional(),
  children: z.array(importItemSchema).optional(),
})) as z.ZodType<ImportItem>;

export const importSectionSchema = z.object({
  field: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  items: z.array(importItemSchema),
}).refine((section) => Boolean(section.field || section.title), { message: "field 또는 title이 필요합니다." });

export const importRelationshipSchema = z.object({
  targetKoreanName: z.string().trim().min(1),
  type: z.string().trim().min(1),
  notes: z.string().trim().nullable().optional(),
});

export const importDrugSchema = z.object({
  koreanName: z.string().trim().min(1),
  latinName: z.string().trim().nullable().optional(),
  origin: z.string().trim().nullable().optional(),
  origins: z.array(z.object({ nameKo: z.string().trim().nullable(), scientificName: z.string().trim().nullable() })).optional(),
  scientificName: z.string().trim().nullable().optional(),
  family: z.object({ koreanName: z.string().trim().optional(), scientificName: z.string().trim().min(1) }).nullable().optional(),
  medicinalPart: z.string().trim().nullable().optional(),
  category: z.string().trim().min(1),
  importance: z.enum(["중요", "중간", "비중요"]).optional(),
  sections: z.array(importSectionSchema).optional(),
  relationships: z.array(importRelationshipSchema).optional(),
  identityTerms: z.array(z.string().trim().min(1)).optional(),
  mnemonic: z.object({ items: z.array(importItemSchema) }).optional(),
});

export const pharmacognosyImportV1Schema = z.object({
  schema: z.literal("pharmacognosy.import"),
  version: z.literal(1),
  drugs: z.array(importDrugSchema).min(1),
}).superRefine((value, context) => {
  const seen = new Map<string, number>();
  value.drugs.forEach((drug, index) => {
    const key = drug.koreanName.trim().normalize("NFC");
    const first = seen.get(key);
    if (first !== undefined) context.addIssue({ code: "custom", path: ["drugs", index, "koreanName"], message: `같은 파일의 drugs.${first}.koreanName과 중복됩니다.` });
    else seen.set(key, index);
  });
});

export type ImportDrug = z.infer<typeof importDrugSchema>;
export type PharmacognosyImportV1 = z.infer<typeof pharmacognosyImportV1Schema>;
export const importExample: PharmacognosyImportV1 = {
  schema: "pharmacognosy.import",
  version: 1,
  drugs: [{
    koreanName: "진피",
    latinName: "Citri Unshius Pericarpium",
    category: "과실류",
    origin: "귤나무의 잘 익은 열매껍질",
    origins: [{ nameKo: "귤나무", scientificName: "Citrus unshiu" }],
    scientificName: "Citrus unshiu",
    family: { koreanName: "운향과", scientificName: "Rutaceae" },
    importance: "중간",
    sections: [{ field: "성분", title: "성분", items: [{ text: "Flavonoid", children: [{ text: "Hesperidin (정량성분)" }] }] }],
    relationships: [{ targetKoreanName: "청피", type: "연관생약", notes: null }],
    mnemonic: { items: [] },
  }],
};
