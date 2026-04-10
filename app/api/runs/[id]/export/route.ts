import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { buildCsvExport, buildXlsxExport } from "@/lib/runs/export";
import { getReadableRunError } from "@/lib/runs/errors";
import { getRunExportData } from "@/lib/runs/repository";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await context.params;
    const exportData = await getRunExportData(session.user.id, id);
    if (!exportData) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const format =
      new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

    if (format === "xlsx") {
      const file = buildXlsxExport(exportData.run, exportData.rows);
      const binary = Uint8Array.from(file.content);
      const blob = new Blob([binary], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      return new NextResponse(blob, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${file.filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const file = buildCsvExport(exportData.run, exportData.rows);
    return new NextResponse(file.content, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: getReadableRunError(error) }, { status: 500 });
  }
}
