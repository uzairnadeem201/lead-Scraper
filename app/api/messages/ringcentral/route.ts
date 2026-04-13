import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { buildLeadMessage, sendRingCentralSms } from "@/lib/ringcentral";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json()) as {
      phoneNumber?: string;
      businessName?: string;
    };

    if (!body.phoneNumber || !body.businessName) {
      return NextResponse.json({ error: "Missing phoneNumber or businessName." }, { status: 400 });
    }

    const text = buildLeadMessage(body.businessName);
    const result = await sendRingCentralSms({
      toNumber: body.phoneNumber,
      text,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send message.";
    console.error("RingCentral send error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
