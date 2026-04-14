import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SendMessagesClient } from "@/components/SendMessagesClient";
import { getRunsForDashboard, recoverStaleRuns } from "@/lib/runs/repository";

export default async function MessagesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  await recoverStaleRuns(session.user.id);
  const data = await getRunsForDashboard(session.user.id);

  return <SendMessagesClient runs={data.history} />;
}
