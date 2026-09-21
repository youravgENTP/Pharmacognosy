import { UsersSettings } from "@/components/users-settings";
import { requireAdmin } from "@/lib/auth/current-user";
export default async function UsersPage() { const user = await requireAdmin(); return <UsersSettings currentUserId={user.id}/>; }
