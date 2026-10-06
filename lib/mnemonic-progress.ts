import type { StudyBlock, StudyItem, StudySection } from "@/lib/db/schema";
import { assignmentNameVariants, type MnemonicAssignment } from "@/lib/mnemonic-assignments";

export type ProgressDrug = { id: string; koreanName: string; sections: StudySection[] };
export type ProgressMnemonic = { drugId: string; items: StudyItem[]; blocks: StudyBlock[] };

export function calculateMnemonicProgress(
  assignment: MnemonicAssignment,
  drugs: ProgressDrug[],
  mnemonics: ProgressMnemonic[],
  fieldNames: Map<string, string> = new Map(),
) {
  const mnemonicDrugIds = new Set(mnemonics.filter((mnemonic) => hasMnemonicContent(mnemonic.items, mnemonic.blocks)).map((mnemonic) => mnemonic.drugId));
  const matched = assignment.drugs.map((assignedName) => ({ assignedName, drug: findDrug(assignedName, drugs) }));
  const missingCards = matched.filter((item) => !item.drug).map((item) => item.assignedName);
  const existing = matched.flatMap((item) => item.drug ? [item.drug] : []);
  const required = existing.filter((drug) => hasMnemonicField(drug.sections, fieldNames));
  const completed = required.filter((drug) => mnemonicDrugIds.has(drug.id));
  const incomplete = required.filter((drug) => !mnemonicDrugIds.has(drug.id)).map(({ id, koreanName }) => ({ id, name: koreanName }));
  return {
    assignmentLabel: assignment.label,
    assigned: assignment.drugs.length,
    required: required.length,
    completed: completed.length,
    remaining: incomplete.length,
    excluded: existing.length - required.length,
    percent: required.length ? Math.round(completed.length / required.length * 100) : 100,
    incomplete,
    missingCards,
  };
}

export function hasMnemonicField(sections: StudySection[], fieldNames: Map<string, string> = new Map()) {
  return sections.some((section) => (section.fieldDefinitionId ? fieldNames.get(section.fieldDefinitionId) : undefined) === "암기법" || section.title.trim() === "암기법");
}

export function hasMnemonicContent(items: StudyItem[], blocks: StudyBlock[]) {
  return hasItemContent(items) || blocks.some((block) => block.type === "image" || block.type === "text" ? block.type === "image" || richTextPresent(block.content.text, block.content.html) : hasItemContent(block.items));
}

function hasItemContent(items: StudyItem[]): boolean {
  return items.some((item) => richTextPresent(item.text, item.html) || hasItemContent(item.children ?? []));
}

function richTextPresent(text: string, html?: string) {
  return Boolean(text.trim() || html?.replace(/<[^>]+>|&nbsp;/g, "").trim());
}

function findDrug(assignedName: string, drugs: ProgressDrug[]) {
  const variants = assignmentNameVariants(assignedName);
  return drugs.find((drug) => assignmentNameVariants(drug.koreanName).some((candidate) => variants.includes(candidate)));
}
