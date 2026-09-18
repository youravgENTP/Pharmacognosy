import { notFound } from "next/navigation";
import { DrugEditor } from "@/components/drug-editor";
import { ProfileModal } from "@/components/profile-modal";
import { getDrugProfile } from "@/lib/data/drug";

export const dynamic = "force-dynamic";
export default async function DrugModalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drug = await getDrugProfile(id);
  if (!drug) notFound();
  return <ProfileModal><DrugEditor modal id={drug.id} family={drug.family} relatedDrugs={drug.relatedDrugs} availableDrugs={drug.availableDrugs} initial={{ koreanName: drug.koreanName, latinName: drug.latinName, origin: drug.origin, origins: drug.origins, scientificName: drug.scientificName, medicinalPart: drug.medicinalPart, importance: drug.importance, sections: drug.sections }}/></ProfileModal>;
}
