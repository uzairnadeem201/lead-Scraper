import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getRunChecklistData, recoverStaleRuns } from "@/lib/runs/repository";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await recoverStaleRuns(session.user.id);
  const { id } = await context.params;
  const data = await getRunChecklistData(session.user.id, id);
  if (!data) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
