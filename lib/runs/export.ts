import * as XLSX from "xlsx";

import { getNiche } from "@/lib/config/scraper";
import { scrapeRuns } from "@/lib/db/schema";

type ExportRunRow = {
  rank: number | null;
  businessName: string;
  businessNameNormalized: string | null;
  phoneDisplay: string | null;
  phoneDigits: string | null;
  classification: string;
  socialPlatform: string | null;
  websiteUrl: string | null;
  socialLink: string | null;
  rating: number | null;
  totalReviews: number | null;
  googleMapsUrl: string | null;
  addressDisplay: string | null;
  addressNormalized: string | null;
  hasPhone: boolean;
  hasRealWebsite: boolean;
  hasSocialLink: boolean;
  isSocialOnly: boolean;
  isLikelyChain: boolean;
  businessStatus: string | null;
  isStatusUncertain: boolean;
  matchReason: string;
  inclusionBasis: string;
  firstDiscoveryMode: string | null;
  firstDiscoveryTerm: string | null;
  firstDiscoveryStage: string | null;
  isMultiPathDiscovered: boolean;
  distinctDiscoveryPathCount: number;
  hadDetailsRetry: boolean;
  detailsAttemptCount: number;
  detailsSucceededAt: Date;
  isFirstTimeSeenInSystem: boolean;
  placeId: string;
  niche: string;
};

type ExportFileData = {
  rows: Record<string, string | number | boolean | null>[];
  filename: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function formatLocalTimestamp(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
}

function buildFilename(
  run: typeof scrapeRuns.$inferSelect,
  extension: "csv" | "xlsx"
) {
  const timestamp = formatLocalTimestamp(run.startedAt);
  const locationSegment = slugify(run.locationLabel) || "map-area";
  const modeSegment = run.campaignMode.replaceAll("_", "-");
  return `${run.niche}_${modeSegment}_${locationSegment}_${timestamp}.${extension}`;
}

function toExportRows(run: typeof scrapeRuns.$inferSelect, rows: ExportRunRow[]) {
  const niche = getNiche(run.niche);
  const startedAt = run.startedAt.toISOString();
  const completedAt = run.completedAt ? run.completedAt.toISOString() : "";
  const durationSeconds =
    run.completedAt != null
      ? Math.max(0, Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000))
      : "";
  const stopReason = run.stopReason ?? "";
  const targetReached = run.stopReason === "target_reached";
  const isPartialRun = run.stopReason === "user_stopped";

  return rows.map((row, index) => ({
    rank: row.rank ?? index + 1,
    business_name: row.businessName,
    business_name_normalized: row.businessNameNormalized ?? "",
    phone_display: row.phoneDisplay ?? "",
    phone_digits: row.phoneDigits ?? "",
    classification: row.classification,
    social_platform: row.socialPlatform ?? "",
    website_url: row.websiteUrl ?? "",
    social_link: row.socialLink ?? "",
    rating: row.rating ?? "",
    review_count: row.totalReviews ?? 0,
    google_maps_url: row.googleMapsUrl ?? "",
    address_display: row.addressDisplay ?? "",
    address_normalized: row.addressNormalized ?? "",
    has_phone: row.hasPhone,
    has_real_website: row.hasRealWebsite,
    has_social_link: row.hasSocialLink,
    is_social_only: row.isSocialOnly,
    is_likely_chain: row.isLikelyChain,
    business_status: row.businessStatus ?? "",
    is_status_uncertain: row.isStatusUncertain,
    match_reason: row.matchReason,
    inclusion_basis: row.inclusionBasis,
    first_discovery_mode: row.firstDiscoveryMode ?? "",
    first_discovery_term: row.firstDiscoveryTerm ?? "",
    first_discovery_stage: row.firstDiscoveryStage ?? "",
    is_multi_path_discovered: row.isMultiPathDiscovered,
    distinct_discovery_path_count: row.distinctDiscoveryPathCount,
    had_details_retry: row.hadDetailsRetry,
    details_attempt_count: row.detailsAttemptCount,
    details_succeeded_at: row.detailsSucceededAt.toISOString(),
    is_first_time_seen_in_system: row.isFirstTimeSeenInSystem,
    place_id: row.placeId,
    niche: row.niche,
    niche_label: niche?.name ?? run.niche,
    campaign_mode: run.campaignMode,
    stop_reason: stopReason,
    target_reached: targetReached,
    target_count: run.targetCount,
    run_id: run.id,
    location_label: run.locationLabel,
    center_lat: run.lat,
    center_lng: run.lng,
    radius_km: run.radiusKm,
    run_started_at: startedAt,
    run_completed_at: completedAt,
    run_duration_seconds: durationSeconds,
    discovery_call_count: run.discoveryCallCount,
    details_call_count: run.detailsCallCount,
    total_matching_leads_in_run: run.matchingLeadCount,
    is_partial_run: isPartialRun,
    was_map_click_based_location: run.isMapClickBasedLocation,
    export_schema_version: "lead_export_v1",
  }));
}

function escapeCsvCell(value: string | number | boolean | null) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function toCsv(rows: Record<string, string | number | boolean | null>[]) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ];

  return lines.join("\n");
}

export function buildCsvExport(
  run: typeof scrapeRuns.$inferSelect,
  rows: ExportRunRow[]
): ExportFileData & { content: string } {
  const exportRows = toExportRows(run, rows);
  return {
    rows: exportRows,
    filename: buildFilename(run, "csv"),
    content: toCsv(exportRows),
  };
}

export function buildXlsxExport(
  run: typeof scrapeRuns.$inferSelect,
  rows: ExportRunRow[]
): ExportFileData & { content: Uint8Array } {
  const exportRows = toExportRows(run, rows);
  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
  const array = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  return {
    rows: exportRows,
    filename: buildFilename(run, "xlsx"),
    content: new Uint8Array(array),
  };
}
