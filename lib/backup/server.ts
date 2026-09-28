import "server-only";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { collectReferencedMediaIds, createBackupArchive, sha256, type BackupMediaFile, type BackupTables } from "@/lib/backup/archive";
import { BACKUP_POLICY_KEY } from "@/lib/backup/policy";
import { LATEX_SHORTCUTS_KEY } from "@/lib/data/latex-shortcuts";
import { readMediaAssetBytes } from "@/lib/media/read";
import { getMediaReferences } from "@/lib/media/references";

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
    "concept-connections": connections, "media-assets": [],
    "app-settings": settings.filter((row) => row.key === LATEX_SHORTCUTS_KEY || row.key === BACKUP_POLICY_KEY),
    "user-attribution": attribution,
  };

  // Storage can retain unused metadata after an image is detached from content.
  // Those orphan rows are not restorable content and must not make a full backup fail.
  const referencedIds = collectReferencedMediaIds(tables);
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const mediaFiles: BackupMediaFile[] = [];
  const mediaRows: Record<string, unknown>[] = [];
  for (const id of referencedIds) {
    const asset = assetsById.get(id);
    if (!asset) throw new Error(`콘텐츠가 참조하는 이미지 ${id}의 정보가 없습니다. 해당 콘텐츠에서 이미지를 다시 등록해 주세요.`);
    let bytes: Buffer | null = null;
    try { bytes = await readMediaAssetBytes(asset); }
    catch { /* Present a stable, actionable message instead of leaking a storage path. */ }
    if (!bytes) {
      const references = await getMediaReferences();
      const locations = (references.get(asset.id) ?? []).map((reference) => `${reference.entityName} / ${reference.fieldName}`).join(", ");
      throw new Error(`콘텐츠에서 사용하는 이미지 “${asset.originalFilename ?? "image"}”의 원본 파일을 찾을 수 없습니다.${locations ? ` 사용 위치: ${locations}.` : ""} 해당 위치에서 이미지를 다시 등록하거나 연결을 제거해 주세요.`);
    }
    if (bytes.length !== asset.sizeBytes) throw new Error(`이미지 “${asset.originalFilename ?? "image"}” (${asset.id})의 파일 크기가 저장 정보와 다릅니다. 이미지를 다시 등록해 주세요.`);
    const filename = safeMediaName(asset.originalFilename ?? "image");
    const archivePath = `media/${asset.id}-${filename}`;
    const checksum = sha256(bytes);
    mediaFiles.push({ id: asset.id, archivePath, filename, mimeType: asset.mimeType, width: asset.width, height: asset.height, size: bytes.length, sha256: checksum, bytes });
    mediaRows.push({ ...asset, archivePath, sha256: checksum });
  }
  tables["media-assets"] = mediaRows;
  return createBackupArchive(tables, mediaFiles, now);
}

function safeMediaName(value: string) { return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^\.+/, "").slice(-100) || "image"; }
