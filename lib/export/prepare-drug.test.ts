import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { prepareDrugExportCard, type ExportDrugProfile, type ExportImageWarning, type ExportMnemonic } from "@/lib/export/prepare-drug";

const pngId = "10000000-0000-4000-8000-000000000001";
const jpegId = "10000000-0000-4000-8000-000000000002";
const corruptId = "10000000-0000-4000-8000-000000000003";
const missingId = "10000000-0000-4000-8000-000000000004";

async function inputs() {
  const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: "green" } }).png().toBuffer();
  const jpeg = await sharp({ create: { width: 20, height: 30, channels: 3, background: "white" } }).jpeg().toBuffer();
  const profile: ExportDrugProfile = {
    catalogIndex: 72, referenceIndex: null,
    koreanName: "연교", latinName: "Forsythiae Fructus", importance: "중요", scientificName: null, medicinalPart: "열매", origin: null,
    origins: [{ nameKo: "의성개나리", scientificName: "Forsythia viridissima" }], family: "물푸레나무과 · Oleaceae", relatedDrugs: [], similarDrugs: [], identityTerms: [],
    sections: [{ id: "section", title: "성분", items: [], blocks: [
      { id: "items", type: "items", items: [{ id: "plain", text: "plain text", children: [{ id: "rich", text: "rich", html: '<b>bold</b><i>italic</i><u>underline</u><s>strike</s><sup>sup</sup><sub>sub</sub><span style="color:#123456;background-color:#fff0a8">color</span>' }] }] },
      { id: "png", type: "image", mediaAssetId: pngId, size: "small", widthPercent: 63, xPercent: 11 }, { id: "jpeg", type: "image", mediaAssetId: jpegId, size: "small", align: "right" }, { id: "corrupt", type: "image", mediaAssetId: corruptId, size: "small" }, { id: "missing", type: "image", mediaAssetId: missingId, size: "small" },
    ] }],
  };
  const loadMedia = async (id: string) => id === pngId ? { buffer: png, mimeType: "image/png", width: 30, height: 20 } : id === jpegId ? { buffer: jpeg, mimeType: "image/jpeg", width: 20, height: 30 } : id === corruptId ? { buffer: Buffer.from("not-an-image"), mimeType: "image/webp", width: 20, height: 20 } : null;
  return { profile, loadMedia };
}

test("export preparation preserves plain, hierarchy, rich HTML, PNG and JPEG while skipping broken optional images", async () => {
  const { profile, loadMedia } = await inputs();
  const warnings: ExportImageWarning[] = [];
  const card = await prepareDrugExportCard("drug", profile, new Set(), [], loadMedia, (warning) => warnings.push(warning));
  assert.equal(card.exportIndex, "72");
  assert.equal(card.latinName, "Forsythiae Fructus");
  const section = card.fields.find((field) => field.title === "성분")!;
  assert.equal(section.lines.length, 2);
  assert.equal(section.lines[1].indent, 13);
  assert.ok(section.lines[1].runs?.some((run) => run.bold));
  assert.ok(section.lines[1].runs?.some((run) => run.underline));
  assert.ok(section.lines[1].runs?.some((run) => run.strike));
  assert.ok(section.lines[1].runs?.some((run) => run.superscript));
  assert.ok(section.lines[1].runs?.some((run) => run.subscript));
  assert.equal(section.images?.length, 2);
  assert.deepEqual(section.images?.map(({ widthPercent, xPercent }) => ({ widthPercent, xPercent })), [{ widthPercent: 63, xPercent: 11 }, { widthPercent: 25, xPercent: 75 }]);
  assert.deepEqual(new Set(warnings.map((warning) => warning.mediaAssetId)), new Set([corruptId, missingId]));
});

test("origin scientific names suppress duplicate scientific-name fields without losing legacy data", async () => {
  const { profile, loadMedia } = await inputs();
  const duplicate = await prepareDrugExportCard("drug", { ...profile, scientificName: "Cornus officinalis", origins: [{ nameKo: "산수유나무", scientificName: "Cornus officinalis" }] }, new Set(), [], loadMedia, () => undefined);
  assert.equal(duplicate.fields.some((field) => field.title === "학명"), false);
  assert.equal(duplicate.fields.find((field) => field.title === "기원")?.lines[0].text, "산수유나무 · Cornus officinalis");

  const legacy = await prepareDrugExportCard("drug", { ...profile, scientificName: "Cornus officinalis", origins: [], origin: "산수유나무" }, new Set(), [], loadMedia, () => undefined);
  assert.equal(legacy.fields.some((field) => field.title === "학명"), false);
  assert.equal(legacy.fields.find((field) => field.title === "기원")?.lines[0].text, "산수유나무 · Cornus officinalis");

  const scientificOnly = await prepareDrugExportCard("drug", { ...profile, scientificName: "Cornus officinalis", origins: [], origin: null }, new Set(), [], loadMedia, () => undefined);
  assert.equal(scientificOnly.fields.find((field) => field.title === "학명")?.lines[0].text, "Cornus officinalis");
});

test("mnemonic none and preferred preparation remain deterministic", async () => {
  const { profile, loadMedia } = await inputs();
  const none = await prepareDrugExportCard("drug", profile, new Set(), [], loadMedia, () => undefined);
  assert.equal(none.fields.some((field) => field.title === "암기법"), false);
  const preferred: ExportMnemonic[] = [{ userName: "사용자", items: [{ id: "m", text: "암기 문장" }], blocks: [] }];
  const selected = await prepareDrugExportCard("drug", profile, new Set(), preferred, loadMedia, () => undefined);
  assert.equal(selected.fields.find((field) => field.title === "암기법")?.lines[0].text.includes("암기 문장"), true);
});
