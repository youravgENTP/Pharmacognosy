import { z } from "zod";
import type { StudyItem } from "@/lib/db/schema";

export const uuidSchema = z.string().uuid();
export const drugPatchSchema = z.object({
  koreanName: z.string().min(1).max(100).optional(),
  latinName: z.string().max(200).nullable().optional(),
  origin: z.string().nullable().optional(),
  origins: z.array(z.object({ nameKo: z.string().nullable(), scientificName: z.string().nullable() })).optional(),
  scientificName: z.string().max(250).nullable().optional(),
  medicinalPart: z.string().max(200).nullable().optional(),
  familyId: z.string().uuid().nullable().optional(),
  importance: z.enum(["중요", "중간", "비중요"]).optional(),
  sections: z.array(z.object({
    id: z.string(), title: z.string(), fieldDefinitionId: z.string().uuid().optional(), items: z.array(z.any()),
    blocks: z.array(z.discriminatedUnion("type", [
      z.object({ id: z.string(), type: z.literal("items"), items: z.array(z.any()) }),
      z.object({ id: z.string(), type: z.literal("image"), mediaAssetId: z.string().uuid(), size: z.enum(["small", "medium", "large", "full"]), widthPercent: z.number().min(15).max(100).optional(), xPercent: z.number().min(0).max(85).optional(), align: z.enum(["left", "center", "right"]).optional() }),
    ])).optional(),
  })).optional(),
});

export const studyItemSchema: z.ZodType<StudyItem> = z.lazy(() => z.object({
  id: z.string(),
  text: z.string(),
  html: z.string().max(20000).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  highlight: z.boolean().optional(),
  linkedConstituentId: z.string().optional(),
  children: z.array(studyItemSchema).optional(),
})) as never;

export const familyCreateSchema = z.object({
  koreanName: z.string().trim().min(1).max(100),
  scientificName: z.string().trim().min(1).max(160),
  acceptedScientificName: z.string().trim().max(160).nullable().optional(),
});

export const familyPatchSchema = familyCreateSchema.partial().extend({
  summary: z.array(studyItemSchema).optional(),
  summaryBlocks: z.array(z.discriminatedUnion("type", [
    z.object({ id: z.string(), type: z.literal("items"), items: z.array(studyItemSchema) }),
    z.object({ id: z.string(), type: z.literal("image"), mediaAssetId: z.string().uuid(), size: z.enum(["small", "medium", "large", "full"]), widthPercent: z.number().min(15).max(100).optional(), xPercent: z.number().min(0).max(85).optional(), align: z.enum(["left", "center", "right"]).optional() }),
  ])).optional(),
}).refine((value) => Object.keys(value).length > 0);
