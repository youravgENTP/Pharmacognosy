import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export type ImportanceLevel = "중요" | "중간" | "비중요";
export type OriginPlant = { nameKo: string | null; scientificName: string | null };
export type FieldInputMode = "hierarchy4" | "hierarchy3" | "text";
export type StudyItem = { id: string; text: string; html?: string; bold?: boolean; italic?: boolean; highlight?: boolean; linkedConstituentId?: string; children?: StudyItem[] };
export type ImageDisplaySize = "small" | "medium" | "large" | "full";
export type StudyBlock = { id: string; type: "items"; items: StudyItem[] } | { id: string; type: "image"; mediaAssetId: string; size: ImageDisplaySize; widthPercent?: number; xPercent?: number; yPx?: number; anchorItemId?: string; anchorSide?: "before" | "after"; align?: "left" | "center" | "right" };
export type StudySection = { id: string; title: string; fieldDefinitionId?: string; items: StudyItem[]; blocks?: StudyBlock[] };
export type RichTextValue = { text: string; html?: string };
export type CollectionTextBlock = { id: string; type: "text"; content: RichTextValue };
export type CollectionHeadingBlock = { id: string; type: "heading"; level: 1 | 2 | 3; content: RichTextValue };
export type CollectionHierarchyBlock = { id: string; type: "hierarchy"; mode?: Exclude<FieldInputMode, "text">; items: StudyItem[]; blocks?: StudyBlock[] };
export type CollectionImageBlock = { id: string; type: "image"; mediaAssetId: string; widthPercent: number; align: "left" | "center" | "right" };
export type TableCell = { id: string; text: string; html?: string; bold?: boolean; italic?: boolean; strikethrough?: boolean; highlight?: string; textColor?: string; horizontal?: "left" | "center" | "right"; vertical?: "top" | "middle" | "bottom"; wrap?: boolean };
export type TableRange = { startRow: number; startColumn: number; endRow: number; endColumn: number };
export type CollectionTableBlock = { id: string; type: "table"; rows: number; columns: number; cells: Record<string, TableCell>; rowSizes: number[]; columnSizes: number[]; mergedRanges: TableRange[] };
export type CollectionBlock = CollectionTextBlock | CollectionHeadingBlock | CollectionHierarchyBlock | CollectionImageBlock | CollectionTableBlock;
export type CollectionDocument = { version: 1; blocks: CollectionBlock[] };
export type ConceptOwnerType = "drug" | "collection";
export type ConceptTargetType = "drug_identifier" | "study_item" | "collection_text" | "collection_heading" | "collection_hierarchy_item" | "table_cell" | "table_cell_text" | "image";
export type ConceptAnchorStatus = "healthy" | "updated" | "broken" | "historical";
export type ConceptAnchorTargetRef = { key?: string; sectionId?: string; itemId?: string; blockId?: string; cellId?: string; mediaAssetId?: string; originIndex?: number; relationId?: string };
export type UserRole = "admin" | "editor";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("session_user_id_idx").on(t.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("account_user_id_idx").on(t.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").$type<UserRole>().notNull().default("editor"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userInvitations = pgTable("user_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  invitedByUserId: text("invited_by_user_id").references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
}, (t) => [index("user_invitations_email_idx").on(t.email)]);

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

export const drugIdentityTerms = pgTable("drug_identity_terms", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("drug_identity_terms_name_idx").on(t.name)]);

export const crudeDrugIdentityTerms = pgTable("crude_drug_identity_terms", {
  crudeDrugId: uuid("crude_drug_id").notNull().references(() => crudeDrugs.id, { onDelete: "cascade" }),
  termId: uuid("term_id").notNull().references(() => drugIdentityTerms.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.crudeDrugId, t.termId] }), index("crude_drug_identity_terms_drug_idx").on(t.crudeDrugId)]);

export const userDrugMnemonics = pgTable("user_drug_mnemonics", {
  id: uuid("id").defaultRandom().primaryKey(),
  drugId: uuid("drug_id").notNull().references(() => crudeDrugs.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  items: jsonb("items").$type<StudyItem[]>().notNull().default([]),
  blocks: jsonb("blocks").$type<StudyBlock[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("user_drug_mnemonics_drug_user_idx").on(t.drugId, t.userId),
  index("user_drug_mnemonics_drug_idx").on(t.drugId),
  index("user_drug_mnemonics_user_idx").on(t.userId),
]);

export const userMnemonicPreferences = pgTable("user_mnemonic_preferences", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  drugId: uuid("drug_id").notNull().references(() => crudeDrugs.id, { onDelete: "cascade" }),
  preferredMnemonicUserId: text("preferred_mnemonic_user_id").references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.drugId] }), index("user_mnemonic_preferences_drug_idx").on(t.drugId)]);

export const legacyDrugMnemonics = pgTable("legacy_drug_mnemonics", {
  drugId: uuid("drug_id").primaryKey().references(() => crudeDrugs.id, { onDelete: "cascade" }),
  items: jsonb("items").$type<StudyItem[]>().notNull().default([]),
  blocks: jsonb("blocks").$type<StudyBlock[]>().notNull().default([]),
  migratedAt: timestamp("migrated_at", { withTimezone: true }).defaultNow().notNull(),
});

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

export const constituentTaxonMedia = pgTable("constituent_taxon_media", {
  id: uuid("id").defaultRandom().primaryKey(),
  taxonId: uuid("taxon_id").notNull().references(() => constituentTaxa.id, { onDelete: "cascade" }),
  mediaAssetId: uuid("media_asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  caption: text("caption"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("constituent_taxon_media_asset_idx").on(t.taxonId, t.mediaAssetId), index("constituent_taxon_media_taxon_idx").on(t.taxonId)]);

export const constituentMedia = pgTable("constituent_media", {
  id: uuid("id").defaultRandom().primaryKey(),
  constituentId: uuid("constituent_id").notNull().references(() => constituents.id, { onDelete: "cascade" }),
  mediaAssetId: uuid("media_asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  caption: text("caption"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("constituent_media_asset_idx").on(t.constituentId, t.mediaAssetId), index("constituent_media_constituent_idx").on(t.constituentId)]);

export const crudeDrugConstituents = pgTable("crude_drug_constituents", {
  crudeDrugId: uuid("crude_drug_id").notNull().references(() => crudeDrugs.id, { onDelete: "cascade" }),
  constituentId: uuid("constituent_id").notNull().references(() => constituents.id, { onDelete: "cascade" }),
  notes: text("notes"),
}, (t) => [primaryKey({ columns: [t.crudeDrugId, t.constituentId] })]);

export const collections = pgTable("collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  kind: text("kind").$type<"document" | "spreadsheet">().notNull().default("document"),
  rule: jsonb("rule"),
  document: jsonb("document").$type<CollectionDocument>().notNull().default({ version: 1, blocks: [] }),
  revision: integer("revision").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const collectionRevisions = pgTable("collection_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  collectionId: uuid("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  document: jsonb("document").$type<CollectionDocument>().notNull(),
  savedByUserId: text("saved_by_user_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("collection_revisions_collection_idx").on(t.collectionId),
  index("collection_revisions_collection_created_idx").on(t.collectionId, t.createdAt),
  uniqueIndex("collection_revisions_collection_revision_idx").on(t.collectionId, t.revision),
]);

export const conceptAnchors = pgTable("concept_anchors", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerType: text("owner_type").$type<ConceptOwnerType>().notNull(),
  ownerId: uuid("owner_id").notNull(),
  targetType: text("target_type").$type<ConceptTargetType>().notNull(),
  targetRef: jsonb("target_ref").$type<ConceptAnchorTargetRef>().notNull(),
  startOffset: integer("start_offset"),
  endOffset: integer("end_offset"),
  status: text("status").$type<ConceptAnchorStatus>().notNull().default("healthy"),
  snapshotText: text("snapshot_text"),
  snapshotHash: text("snapshot_hash"),
  assetVersion: text("asset_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("concept_anchors_owner_idx").on(t.ownerType, t.ownerId), index("concept_anchors_target_idx").on(t.targetType)]);

export const conceptConnections = pgTable("concept_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  anchorAId: uuid("anchor_a_id").notNull().references(() => conceptAnchors.id, { onDelete: "restrict" }),
  anchorBId: uuid("anchor_b_id").notNull().references(() => conceptAnchors.id, { onDelete: "restrict" }),
  color: text("color").notNull(),
  anchorASnapshot: jsonb("anchor_a_snapshot").$type<{ text?: string; hash?: string; assetVersion?: string }>().notNull(),
  anchorBSnapshot: jsonb("anchor_b_snapshot").$type<{ text?: string; hash?: string; assetVersion?: string }>().notNull(),
  historicalA: boolean("historical_a").notNull().default(false),
  historicalB: boolean("historical_b").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("concept_connections_edge_idx").on(t.anchorAId, t.anchorBId), index("concept_connections_anchor_a_idx").on(t.anchorAId), index("concept_connections_anchor_b_idx").on(t.anchorBId)]);

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
  mnemonics: many(userDrugMnemonics),
  mnemonicPreferences: many(userMnemonicPreferences),
  identityTerms: many(crudeDrugIdentityTerms),
}));
export const userMnemonicPreferenceRelations = relations(userMnemonicPreferences, ({ one }) => ({
  viewingUser: one(user, { fields: [userMnemonicPreferences.userId], references: [user.id], relationName: "mnemonicPreferenceViewer" }),
  drug: one(crudeDrugs, { fields: [userMnemonicPreferences.drugId], references: [crudeDrugs.id] }),
  preferredOwner: one(user, { fields: [userMnemonicPreferences.preferredMnemonicUserId], references: [user.id], relationName: "mnemonicPreferenceOwner" }),
}));
export const drugIdentityTermRelations = relations(drugIdentityTerms, ({ many }) => ({ drugs: many(crudeDrugIdentityTerms) }));
export const crudeDrugIdentityTermRelations = relations(crudeDrugIdentityTerms, ({ one }) => ({
  drug: one(crudeDrugs, { fields: [crudeDrugIdentityTerms.crudeDrugId], references: [crudeDrugs.id] }),
  term: one(drugIdentityTerms, { fields: [crudeDrugIdentityTerms.termId], references: [drugIdentityTerms.id] }),
}));
export const collectionRelations = relations(collections, ({ many }) => ({ members: many(collectionMembers), revisions: many(collectionRevisions) }));
export const collectionRevisionRelations = relations(collectionRevisions, ({ one }) => ({
  collection: one(collections, { fields: [collectionRevisions.collectionId], references: [collections.id] }),
  savedBy: one(user, { fields: [collectionRevisions.savedByUserId], references: [user.id] }),
}));
export const conceptAnchorRelations = relations(conceptAnchors, ({ many }) => ({ connectionsA: many(conceptConnections, { relationName: "anchorA" }), connectionsB: many(conceptConnections, { relationName: "anchorB" }) }));
export const conceptConnectionRelations = relations(conceptConnections, ({ one }) => ({ anchorA: one(conceptAnchors, { fields: [conceptConnections.anchorAId], references: [conceptAnchors.id], relationName: "anchorA" }), anchorB: one(conceptAnchors, { fields: [conceptConnections.anchorBId], references: [conceptAnchors.id], relationName: "anchorB" }) }));
export const memberRelations = relations(collectionMembers, ({ one }) => ({
  collection: one(collections, { fields: [collectionMembers.collectionId], references: [collections.id] }),
  crudeDrug: one(crudeDrugs, { fields: [collectionMembers.crudeDrugId], references: [crudeDrugs.id] }),
}));
export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  profile: one(userProfiles, { fields: [user.id], references: [userProfiles.userId] }),
  invitations: many(userInvitations),
  drugMnemonics: many(userDrugMnemonics),
}));
export const sessionRelations = relations(session, ({ one }) => ({ user: one(user, { fields: [session.userId], references: [user.id] }) }));
export const accountRelations = relations(account, ({ one }) => ({ user: one(user, { fields: [account.userId], references: [user.id] }) }));
export const userProfileRelations = relations(userProfiles, ({ one }) => ({ user: one(user, { fields: [userProfiles.userId], references: [user.id] }) }));
export const userInvitationRelations = relations(userInvitations, ({ one }) => ({ invitedBy: one(user, { fields: [userInvitations.invitedByUserId], references: [user.id] }) }));
export const userDrugMnemonicRelations = relations(userDrugMnemonics, ({ one }) => ({
  drug: one(crudeDrugs, { fields: [userDrugMnemonics.drugId], references: [crudeDrugs.id] }),
  user: one(user, { fields: [userDrugMnemonics.userId], references: [user.id] }),
}));
