import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getReadableRunError } from "@/lib/runs/errors";
import { getRunDetail } from "@/lib/runs/repository";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const run = await getRunDetail(session.user.id, id);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json({ error: getReadableRunError(error) }, { status: 500 });
  }
}
