import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const drugPatchSchema = z.object({
  koreanName: z.string().min(1).max(100).optional(),
  latinName: z.string().max(200).nullable().optional(),
  origin: z.string().nullable().optional(),
  scientificName: z.string().max(250).nullable().optional(),
  medicinalPart: z.string().max(200).nullable().optional(),
  importance: z.enum(["중요", "중간", "비중요", "연관"]).optional(),
  sections: z.array(z.object({ id: z.string(), title: z.string(), fieldDefinitionId: z.string().uuid().optional(), items: z.array(z.any()) })).optional(),
});
