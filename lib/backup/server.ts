import "server-only";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { createBackupArchive, verifyGeneratedBackup, type BackupTables } from "@/lib/backup/archive";
import { BACKUP_POLICY_KEY } from "@/lib/backup/policy";
import { LATEX_SHORTCUTS_KEY } from "@/lib/data/latex-shortcuts";
import { isUndefinedColumnError } from "@/lib/db/migration-health";

export async function generateFullBackup(now = new Date()) {
  const tables = await loadBackupTables();
  const generated = await createBackupArchive(tables, [], now);
  await verifyGeneratedBackup(generated.buffer, tables);
  return generated;
}

type BackupDatabase = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function loadBackupTables(database: BackupDatabase = db) {
  const [
    categories, families, drugs, fields, identityTerms, drugIdentityTerms,
    relationshipTypes, relationships, constituents, taxa, taxonEdges,
    memberships, drugConstituents, constituentMedia, taxonMedia, userMnemonics,
    mnemonicPreferences, legacyMnemonics, collections, collectionMembers,
    collectionRevisions, decks, wordCards, anchors, connections, assets,
    settings, archiveGroups, archiveEntries, attribution,
  ] = await Promise.all([
    database.select().from(schema.categories), database.select().from(schema.families), database.select().from(schema.crudeDrugs),
    database.select().from(schema.fieldDefinitions), database.select().from(schema.drugIdentityTerms), database.select().from(schema.crudeDrugIdentityTerms),
    database.select().from(schema.relationshipTypes), database.select().from(schema.crudeDrugRelationships), database.select().from(schema.constituents),
    database.select().from(schema.constituentTaxa), database.select().from(schema.constituentTaxonEdges), database.select().from(schema.constituentMemberships),
    database.select().from(schema.crudeDrugConstituents), database.select().from(schema.constituentMedia), database.select().from(schema.constituentTaxonMedia),
    database.select().from(schema.userDrugMnemonics), database.select().from(schema.userMnemonicPreferences), database.select().from(schema.legacyDrugMnemonics),
    database.select().from(schema.collections), database.select().from(schema.collectionMembers), database.select().from(schema.collectionRevisions),
    database.select().from(schema.decks), database.select().from(schema.wordCards), database.select().from(schema.conceptAnchors),
    database.select().from(schema.conceptConnections), database.select().from(schema.mediaAssets), database.select().from(schema.appSettings), database.select().from(schema.archiveGroups), loadArchiveEntriesForBackup(database),
    database.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email }).from(schema.user),
  ]);

  const tables: BackupTables = {
    "categories": categories, "families": families, "crude-drugs": drugs, "field-definitions": fields,
    "drug-identity-terms": identityTerms, "crude-drug-identity-terms": drugIdentityTerms,
    "relationship-types": relationshipTypes, "crude-drug-relationships": relationships,
    "constituents": constituents, "constituent-taxa": taxa, "constituent-taxon-edges": taxonEdges,
    "constituent-memberships": memberships, "crude-drug-constituents": drugConstituents,
    "constituent-media": constituentMedia, "constituent-taxon-media": taxonMedia,
    "user-drug-mnemonics": userMnemonics, "user-mnemonic-preferences": mnemonicPreferences,
    "legacy-drug-mnemonics": legacyMnemonics, "collections": collections,
    "collection-members": collectionMembers, "collection-revisions": collectionRevisions,
    "decks": decks, "word-cards": wordCards, "concept-anchors": anchors,
    "concept-connections": connections, "media-assets": assets,
    "app-settings": settings.filter((row) => row.key === LATEX_SHORTCUTS_KEY || row.key === BACKUP_POLICY_KEY),
    "archive-groups": archiveGroups, "archive-entries": archiveEntries,
    "user-attribution": attribution,
  };

  return tables;
}

async function loadArchiveEntriesForBackup(database: BackupDatabase) {
  try { return await database.select().from(schema.archiveEntries); }
  catch (error) {
    if (!isUndefinedColumnError(error, "original_index_type")) throw error;
    const legacy = await database.select({ id: schema.archiveEntries.id, archiveGroupId: schema.archiveEntries.archiveGroupId, drugId: schema.archiveEntries.drugId, originalIndex: schema.archiveEntries.originalIndex, archivedAt: schema.archiveEntries.archivedAt, archivedBy: schema.archiveEntries.archivedBy }).from(schema.archiveEntries);
    return legacy.map((row) => ({ ...row, originalIndexType: "catalog" as const }));
  }
}
