import { AccountSettings } from "@/components/account-settings";
import { requireUser } from "@/lib/auth/current-user";
export default async function AccountPage() { return <AccountSettings user={await requireUser()}/>; }
