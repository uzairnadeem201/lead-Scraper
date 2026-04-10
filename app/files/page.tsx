import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FilesLibrary } from "@/components/FilesLibrary";
import { getRunsForDashboard } from "@/lib/runs/repository";

export default async function FilesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const data = await getRunsForDashboard(session.user.id);

  return <FilesLibrary runs={data.history} />;
}
