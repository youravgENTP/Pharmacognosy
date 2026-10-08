import { notFound } from "next/navigation";
import { DrugEditor } from "@/components/drug-editor";
import { requireUser } from "@/lib/auth/current-user";
import { getDrugProfile } from "@/lib/data/drug";

export const dynamic = "force-dynamic";

export default async function DrugPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [drug, current] = await Promise.all([getDrugProfile(id), requireUser()]);
  if (!drug) notFound();
  return <DrugEditor admin={current.role === "admin"} id={drug.id} family={drug.family} identityTerms={drug.identityTerms} relatedDrugs={drug.relatedDrugs} similarDrugs={drug.similarDrugs} availableDrugs={drug.availableDrugs} initial={{ koreanName: drug.koreanName, latinName: drug.latinName, origin: drug.origin, origins: drug.origins, scientificName: drug.scientificName, medicinalPart: drug.medicinalPart, familyId: drug.familyId, importance: drug.importance, sections: drug.sections }}/>;
}
