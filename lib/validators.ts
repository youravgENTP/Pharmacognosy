import { z } from "zod";
import type { CollectionDocument, StudyItem } from "@/lib/db/schema";

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
    z.object({
      id: z.string(),
      type: z.literal("image"),
      mediaAssetId: z.string().uuid(),
      size: z.enum(["small", "medium", "large", "full"]),
      widthPercent: z.number().min(15).max(100).optional(),
      xPercent: z.number().min(0).max(85).optional(),
      yPx: z.number().optional(),
      anchorItemId: z.string().optional(),
      anchorSide: z.enum(["before", "after"]).optional(),
      align: z.enum(["left", "center", "right"]).optional(),
    }),
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

const richTextSchema = z.object({ text: z.string(), html: z.string().max(100000).optional() });
const tableRangeSchema = z.object({ startRow: z.number().int().nonnegative(), startColumn: z.number().int().nonnegative(), endRow: z.number().int().nonnegative(), endColumn: z.number().int().nonnegative() });
const tableCellSchema = z.object({ id: z.string(), text: z.string(), html: z.string().max(100000).optional(), bold: z.boolean().optional(), italic: z.boolean().optional(), strikethrough: z.boolean().optional(), highlight: z.string().max(20).optional(), textColor: z.string().max(20).optional(), horizontal: z.enum(["left", "center", "right"]).optional(), vertical: z.enum(["top", "middle", "bottom"]).optional(), wrap: z.boolean().optional() });
export const collectionBlockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string(), type: z.literal("text"), content: richTextSchema }),
  z.object({ id: z.string(), type: z.literal("heading"), level: z.union([z.literal(1), z.literal(2), z.literal(3)]), content: richTextSchema }),
  z.object({ id: z.string(), type: z.literal("hierarchy"), mode: z.enum(["hierarchy4", "hierarchy3"]).optional(), items: z.array(studyItemSchema), blocks: z.array(z.any()).optional() }),
  z.object({ id: z.string(), type: z.literal("image"), mediaAssetId: z.union([uuidSchema, z.literal("")]), widthPercent: z.number().min(15).max(100), align: z.enum(["left", "center", "right"]) }),
  z.object({ id: z.string(), type: z.literal("table"), rows: z.number().int().min(1).max(500), columns: z.number().int().min(1).max(100), cells: z.record(z.string(), tableCellSchema), rowSizes: z.array(z.number().min(24).max(500)), columnSizes: z.array(z.number().min(48).max(800)), mergedRanges: z.array(tableRangeSchema) }),
]);
export const collectionDocumentSchema: z.ZodType<CollectionDocument> = z.object({ version: z.literal(1), blocks: z.array(collectionBlockSchema).max(1000) }) as never;
export const collectionCreateSchema = z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(500).nullable().optional() });
export const collectionPatchSchema = collectionCreateSchema.partial().refine((value) => Object.keys(value).length > 0);
export const collectionDocumentPatchSchema = z.object({ document: collectionDocumentSchema, revision: z.number().int().nonnegative() });

export const conceptOwnerTypeSchema = z.enum(["drug", "collection"]);
export const conceptTargetTypeSchema = z.enum(["drug_identifier", "study_item", "collection_text", "collection_heading", "collection_hierarchy_item", "table_cell", "table_cell_text", "image"]);
export const conceptTargetRefSchema = z.object({ key: z.string().optional(), sectionId: z.string().optional(), itemId: z.string().optional(), blockId: z.string().optional(), cellId: z.string().optional(), mediaAssetId: uuidSchema.optional(), originIndex: z.number().int().nonnegative().optional(), relationId: z.string().optional() });
export const conceptAnchorCreateSchema = z.object({ ownerType: conceptOwnerTypeSchema, ownerId: uuidSchema, targetType: conceptTargetTypeSchema, targetRef: conceptTargetRefSchema, startOffset: z.number().int().nonnegative().nullable().optional(), endOffset: z.number().int().nonnegative().nullable().optional(), snapshotText: z.string().nullable().optional(), assetVersion: z.string().nullable().optional() }).refine((value) => value.startOffset == null || value.endOffset == null || value.endOffset > value.startOffset, { message: "Anchor range must not be empty" });
export const conceptAnchorPatchSchema = z.object({ startOffset: z.number().int().nonnegative().nullable().optional(), endOffset: z.number().int().nonnegative().nullable().optional(), snapshotText: z.string().nullable().optional(), assetVersion: z.string().nullable().optional(), status: z.enum(["healthy", "updated", "broken", "historical"]).optional(), refreshSnapshots: z.boolean().optional() }).refine((value) => Object.keys(value).length > 0);
export const conceptConnectionCreateSchema = z.object({ anchorAId: uuidSchema, anchorBId: uuidSchema }).refine((value) => value.anchorAId !== value.anchorBId, { message: "An anchor cannot connect to itself" });
export const conceptConnectionPatchSchema = z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), action: z.enum(["accept-a", "accept-b", "historical-a", "historical-b", "reassign-a", "reassign-b"]).optional(), replacementAnchorId: uuidSchema.optional() }).refine((value) => Object.keys(value).length > 0);

export const familyCreateSchema = z.object({
  koreanName: z.string().trim().min(1).max(100),
  scientificName: z.string().trim().min(1).max(160),
  acceptedScientificName: z.string().trim().max(160).nullable().optional(),
});

export const familyPatchSchema = familyCreateSchema.partial().extend({
  summary: z.array(studyItemSchema).optional(),
  summaryBlocks: z.array(z.discriminatedUnion("type", [
    z.object({ id: z.string(), type: z.literal("items"), items: z.array(studyItemSchema) }),
      z.object({
        id: z.string(),
        type: z.literal("image"),
        mediaAssetId: z.string().uuid(),
        size: z.enum(["small", "medium", "large", "full"]),
        widthPercent: z.number().min(15).max(100).optional(),
        xPercent: z.number().min(0).max(85).optional(),
        yPx: z.number().optional(),
        anchorItemId: z.string().optional(),
        anchorSide: z.enum(["before", "after"]).optional(),
        align: z.enum(["left", "center", "right"]).optional(),
      }),
  ])).optional(),
}).refine((value) => Object.keys(value).length > 0);
