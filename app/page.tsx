import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/roles";
import ExecDashboard from "./exec-dashboard";

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const role = getUserRole(user.email);

  if (!role) redirect("/login");

  if (role.type === "rep") {
    redirect(`/dashboard/${role.repId}`);
  }

  return <ExecDashboard />;
}
