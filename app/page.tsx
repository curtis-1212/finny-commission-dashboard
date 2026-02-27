import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserRole } from "@/lib/roles";
import ExecDashboard from "./exec-dashboard";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) redirect("/login");

  const role = getUserRole(session.user.email);

  if (!role) redirect("/login");

  if (role.type === "rep") {
    redirect(`/dashboard/${role.repId}`);
  }

  return <ExecDashboard />;
}
