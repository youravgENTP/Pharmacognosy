import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export type ImportanceLevel = "중요" | "중간" | "비중요";
export type OriginPlant = { nameKo: string | null; scientificName: string | null };
export type FieldInputMode = "hierarchy4" | "hierarchy3" | "text";
export type StudyItem = { id: string; text: string; html?: string; bold?: boolean; italic?: boolean; highlight?: boolean; linkedConstituentId?: string; children?: StudyItem[] };
export type ImageDisplaySize = "small" | "medium" | "large" | "full";
export type StudyBlock = { id: string; type: "items"; items: StudyItem[] } | { id: string; type: "image"; mediaAssetId: string; size: ImageDisplaySize; widthPercent?: number; xPercent?: number; yPx?: number; align?: "left" | "center" | "right" };
export type StudySection = { id: string; title: string; fieldDefinitionId?: string; items: StudyItem[]; blocks?: StudyBlock[] };

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const families = pgTable("families", {
  id: uuid("id").defaultRandom().primaryKey(),
  koreanName: text("korean_name").notNull(),
  scientificName: text("scientific_name").notNull(),
  acceptedScientificName: text("accepted_scientific_name"),
  summary: jsonb("summary").$type<StudyItem[]>().notNull().default([]),
  summaryBlocks: jsonb("summary_blocks").$type<StudyBlock[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("families_scientific_name_idx").on(t.scientificName)]);

export const crudeDrugs = pgTable("crude_drugs", {
  id: uuid("id").defaultRandom().primaryKey(),
  catalogIndex: integer("catalog_index").unique(),
  referenceIndex: integer("reference_index").unique(),
  koreanName: text("korean_name").notNull(),
  latinName: text("latin_name"),
  origin: text("origin"),
  origins: jsonb("origins").$type<OriginPlant[]>().notNull().default([]),
  scientificName: text("scientific_name"),
  medicinalPart: text("medicinal_part"),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  familyId: uuid("family_id").references(() => families.id, { onDelete: "set null" }),
  importance: text("importance").$type<ImportanceLevel>().notNull().default("중간"),
  sections: jsonb("sections").$type<StudySection[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("crude_drugs_category_idx").on(t.categoryId), uniqueIndex("crude_drugs_korean_name_idx").on(t.koreanName)]);

export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  blobUrl: text("blob_url").notNull(),
  blobPathname: text("blob_pathname").notNull().unique(),
  originalFilename: text("original_filename"),
  sizeBytes: integer("size_bytes").notNull(),
  mimeType: text("mime_type").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const fieldDefinitions = pgTable("field_definitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  kind: text("kind").$type<"default" | "custom">().notNull().default("custom"),
  inputMode: text("input_mode").$type<FieldInputMode>().notNull().default("hierarchy4"),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const relationshipTypes = pgTable("relationship_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
});

export const crudeDrugRelationships = pgTable("crude_drug_relationships", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").notNull().references(() => crudeDrugs.id, { onDelete: "cascade" }),
  targetId: uuid("target_id").notNull().references(() => crudeDrugs.id, { onDelete: "cascade" }),
  typeId: uuid("type_id").notNull().references(() => relationshipTypes.id),
  notes: text("notes"),
});

export const constituents = pgTable("constituents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
});

export const constituentTaxa = pgTable("constituent_taxa", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("class"),
  description: text("description"),
  hidden: boolean("hidden").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("constituent_taxa_name_kind_idx").on(t.name, t.kind)]);

export const constituentTaxonEdges = pgTable("constituent_taxon_edges", {
  parentId: uuid("parent_id").notNull().references(() => constituentTaxa.id, { onDelete: "cascade" }),
  childId: uuid("child_id").notNull().references(() => constituentTaxa.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.parentId, t.childId] })]);

export const constituentMemberships = pgTable("constituent_memberships", {
  constituentId: uuid("constituent_id").notNull().references(() => constituents.id, { onDelete: "cascade" }),
  taxonId: uuid("taxon_id").notNull().references(() => constituentTaxa.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.constituentId, t.taxonId] })]);

export const crudeDrugConstituents = pgTable("crude_drug_constituents", {
  crudeDrugId: uuid("crude_drug_id").notNull().references(() => crudeDrugs.id, { onDelete: "cascade" }),
  constituentId: uuid("constituent_id").notNull().references(() => constituents.id, { onDelete: "cascade" }),
  notes: text("notes"),
}, (t) => [primaryKey({ columns: [t.crudeDrugId, t.constituentId] })]);

export const collections = pgTable("collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  kind: text("kind").notNull().default("manual"),
  rule: jsonb("rule"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const collectionMembers = pgTable("collection_members", {
  collectionId: uuid("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  crudeDrugId: uuid("crude_drug_id").notNull().references(() => crudeDrugs.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  notes: text("notes"),
}, (t) => [primaryKey({ columns: [t.collectionId, t.crudeDrugId] })]);

export const decks = pgTable("decks", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const wordCards = pgTable("word_cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  deckId: uuid("deck_id").notNull().references(() => decks.id, { onDelete: "cascade" }),
  front: text("front").notNull(),
  back: text("back").notNull(),
  crudeDrugId: uuid("crude_drug_id").references(() => crudeDrugs.id, { onDelete: "set null" }),
  collectionId: uuid("collection_id").references(() => collections.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const categoryRelations = relations(categories, ({ many }) => ({ crudeDrugs: many(crudeDrugs) }));
export const familyRelations = relations(families, ({ many }) => ({ crudeDrugs: many(crudeDrugs) }));
export const crudeDrugRelations = relations(crudeDrugs, ({ one, many }) => ({
  category: one(categories, { fields: [crudeDrugs.categoryId], references: [categories.id] }),
  family: one(families, { fields: [crudeDrugs.familyId], references: [families.id] }),
  collectionMembers: many(collectionMembers),
}));
export const collectionRelations = relations(collections, ({ many }) => ({ members: many(collectionMembers) }));
export const memberRelations = relations(collectionMembers, ({ one }) => ({
  collection: one(collections, { fields: [collectionMembers.collectionId], references: [collections.id] }),
  crudeDrug: one(crudeDrugs, { fields: [collectionMembers.crudeDrugId], references: [crudeDrugs.id] }),
}));
