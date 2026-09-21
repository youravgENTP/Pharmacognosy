import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth/current-user";

export default async function AppLayout({ children, modal }: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  const currentUser = await requireUser();
  return <><Shell user={currentUser}>{children}</Shell>{modal}</>;
}
