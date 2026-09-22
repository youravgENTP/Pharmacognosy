import "server-only";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { createBackupArchive, sha256, type BackupMediaFile, type BackupTables } from "@/lib/backup/archive";
import { BACKUP_POLICY_KEY } from "@/lib/backup/policy";
import { LATEX_SHORTCUTS_KEY } from "@/lib/data/latex-shortcuts";
import { readMediaAssetBytes } from "@/lib/media/read";

export async function generateFullBackup(now = new Date()) {
  const [
    categories, families, drugs, fields, identityTerms, drugIdentityTerms,
    relationshipTypes, relationships, constituents, taxa, taxonEdges,
    memberships, drugConstituents, constituentMedia, taxonMedia, userMnemonics,
    mnemonicPreferences, legacyMnemonics, collections, collectionMembers,
    collectionRevisions, decks, wordCards, anchors, connections, assets,
    settings, attribution,
  ] = await Promise.all([
    db.select().from(schema.categories), db.select().from(schema.families), db.select().from(schema.crudeDrugs),
    db.select().from(schema.fieldDefinitions), db.select().from(schema.drugIdentityTerms), db.select().from(schema.crudeDrugIdentityTerms),
    db.select().from(schema.relationshipTypes), db.select().from(schema.crudeDrugRelationships), db.select().from(schema.constituents),
    db.select().from(schema.constituentTaxa), db.select().from(schema.constituentTaxonEdges), db.select().from(schema.constituentMemberships),
    db.select().from(schema.crudeDrugConstituents), db.select().from(schema.constituentMedia), db.select().from(schema.constituentTaxonMedia),
    db.select().from(schema.userDrugMnemonics), db.select().from(schema.userMnemonicPreferences), db.select().from(schema.legacyDrugMnemonics),
    db.select().from(schema.collections), db.select().from(schema.collectionMembers), db.select().from(schema.collectionRevisions),
    db.select().from(schema.decks), db.select().from(schema.wordCards), db.select().from(schema.conceptAnchors),
    db.select().from(schema.conceptConnections), db.select().from(schema.mediaAssets), db.select().from(schema.appSettings),
    db.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email }).from(schema.user),
  ]);

  const mediaFiles: BackupMediaFile[] = [];
  const mediaRows: Record<string, unknown>[] = [];
  for (const asset of assets) {
    const bytes = await readMediaAssetBytes(asset).catch((error) => { throw new Error(`미디어 ${asset.id} (${asset.originalFilename ?? "image"})를 읽지 못했습니다: ${error instanceof Error ? error.message : "unknown error"}`); });
    if (!bytes) throw new Error(`미디어 ${asset.id} (${asset.originalFilename ?? "image"})가 저장소에 없습니다.`);
    if (bytes.length !== asset.sizeBytes) throw new Error(`미디어 ${asset.id}의 실제 크기가 DB 메타데이터와 다릅니다.`);
    const filename = safeMediaName(asset.originalFilename ?? "image");
    const archivePath = `media/${asset.id}-${filename}`;
    const checksum = sha256(bytes);
    mediaFiles.push({ id: asset.id, archivePath, filename, mimeType: asset.mimeType, width: asset.width, height: asset.height, size: bytes.length, sha256: checksum, bytes });
    mediaRows.push({ ...asset, archivePath, sha256: checksum });
  }

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
    "concept-connections": connections, "media-assets": mediaRows,
    "app-settings": settings.filter((row) => row.key === LATEX_SHORTCUTS_KEY || row.key === BACKUP_POLICY_KEY),
    "user-attribution": attribution,
  };
  return createBackupArchive(tables, mediaFiles, now);
}

function safeMediaName(value: string) { return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^\.+/, "").slice(-100) || "image"; }
