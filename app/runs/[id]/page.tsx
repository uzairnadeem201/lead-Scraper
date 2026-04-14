import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { RunChecklist } from "@/components/RunChecklist";
import { getRunChecklistData, recoverStaleRuns } from "@/lib/runs/repository";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RunChecklistPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  await recoverStaleRuns(session.user.id);
  const { id } = await params;
  const data = await getRunChecklistData(session.user.id, id);
  if (!data) {
    notFound();
  }

  return <RunChecklist run={data.run} leads={data.leads} />;
}
