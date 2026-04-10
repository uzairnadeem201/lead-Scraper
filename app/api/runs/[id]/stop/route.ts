import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getReadableRunError } from "@/lib/runs/errors";
import { getRunById, requestRunStop } from "@/lib/runs/repository";

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: Context) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const run = await getRunById(session.user.id, id);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status !== "running") {
      return NextResponse.json({ error: "Run is not active." }, { status: 409 });
    }

    await requestRunStop(session.user.id, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getReadableRunError(error) }, { status: 500 });
  }
}
