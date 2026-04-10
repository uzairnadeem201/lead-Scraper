import { NextResponse } from "next/server";

import { callGoogleMaps } from "@/lib/runs/google";

type AllowedEndpoint =
  | "place/textsearch/json"
  | "place/details/json"
  | "place/nearbysearch/json";

type ProxyParams = Record<string, string | number | undefined>;

const ALLOWED_ENDPOINTS: AllowedEndpoint[] = [
  "place/textsearch/json",
  "place/details/json",
  "place/nearbysearch/json",
];

function normalizeParams(input: unknown): ProxyParams {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const params: ProxyParams = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      value === undefined ||
      value === null ||
      typeof value === "string" ||
      typeof value === "number"
    ) {
      params[key] = value ?? undefined;
    }
  }

  return params;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      endpoint?: string;
      params?: unknown;
    };

    if (!body.endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    if (!ALLOWED_ENDPOINTS.includes(body.endpoint as AllowedEndpoint)) {
      return NextResponse.json({ error: "Endpoint not allowed" }, { status: 403 });
    }

    const data = await callGoogleMaps(
      body.endpoint as AllowedEndpoint,
      normalizeParams(body.params)
    );

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Google Places API proxy error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
