import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getReadableRunError } from "@/lib/runs/errors";
import {
  createRun,
  getActiveRun,
  getRunsForDashboard,
  recoverStaleRuns,
} from "@/lib/runs/repository";
import { startRunWorker } from "@/lib/runs/orchestrator";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    await recoverStaleRuns(session.user.id);
    const data = await getRunsForDashboard(session.user.id);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: getReadableRunError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    await recoverStaleRuns(session.user.id);
    const existingActiveRun = await getActiveRun(session.user.id);
    if (existingActiveRun) {
      return NextResponse.json(
        { error: "An active run already exists for this user." },
        { status: 409 }
      );
    }

    const body = (await request.json()) as {
      niche?: string;
      campaignMode?: "without_website" | "with_website";
      locationLabel?: string;
      isMapClickBasedLocation?: boolean;
      lat?: number;
      lng?: number;
      radiusKm?: number;
    };

    if (
      !body.niche ||
      !body.campaignMode ||
      typeof body.lat !== "number" ||
      typeof body.lng !== "number" ||
      typeof body.radiusKm !== "number"
    ) {
      return NextResponse.json({ error: "Invalid run input." }, { status: 400 });
    }

    const run = await createRun({
      userId: session.user.id,
      niche: body.niche,
      campaignMode: body.campaignMode,
      locationLabel: body.locationLabel?.trim() || "Map Area",
      isMapClickBasedLocation: Boolean(body.isMapClickBasedLocation),
      lat: body.lat,
      lng: body.lng,
      radiusKm: body.radiusKm,
    });

    startRunWorker(run.id);

    return NextResponse.json({ runId: run.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: getReadableRunError(error) }, { status: 500 });
  }
}
