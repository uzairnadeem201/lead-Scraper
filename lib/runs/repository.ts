import { db } from "@/lib/db";
import { leads, runLeadSnapshots, runLeads, scrapeRuns, scrapes } from "@/lib/db/schema";
import { SCRAPER_CONFIG, type CampaignMode, getNiche } from "@/lib/config/scraper";
import type {
  RunChecklistLead,
  RunLeadPreview,
  RunListResponse,
  RunSummary,
} from "@/lib/runs/types";
import { buildBusinessAddressSignature } from "@/lib/runs/utils";
import {
  and,
  asc,
  desc,
  eq,
  lt,
} from "drizzle-orm";

type ScrapeRunRow = typeof scrapeRuns.$inferSelect;

export async function createRun(params: {
  userId: string;
  niche: string;
  campaignMode: CampaignMode;
  locationLabel: string;
  isMapClickBasedLocation: boolean;
  lat: number;
  lng: number;
  radiusKm: number;
}) {
  const [run] = await db
    .insert(scrapeRuns)
    .values({
      userId: params.userId,
      niche: params.niche,
      campaignMode: params.campaignMode,
      locationLabel: params.locationLabel,
      isMapClickBasedLocation: params.isMapClickBasedLocation,
      lat: params.lat,
      lng: params.lng,
      radiusKm: params.radiusKm,
      targetCount: SCRAPER_CONFIG.targetCount,
      status: "running",
      currentPhase: "starting",
    })
    .returning();

  return run;
}

export async function getActiveRun(userId: string) {
  const [run] = await db
    .select()
    .from(scrapeRuns)
    .where(and(eq(scrapeRuns.userId, userId), eq(scrapeRuns.status, "running")))
    .orderBy(desc(scrapeRuns.createdAt))
    .limit(1);

  return run ?? null;
}

export async function recoverStaleRuns(userId: string) {
  const cutoff = new Date(Date.now() - SCRAPER_CONFIG.staleRunThresholdMs);

  await db
    .update(scrapeRuns)
    .set({
      status: "completed",
      stopReason: "user_stopped",
      currentPhase: "completed",
      currentTerm: null,
      cancelRequested: true,
      errorMessage: "Recovered stale run after heartbeat timeout.",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scrapeRuns.userId, userId),
        eq(scrapeRuns.status, "running"),
        lt(scrapeRuns.updatedAt, cutoff)
      )
    );
}

export async function getRunById(userId: string, runId: string) {
  const [run] = await db
    .select()
    .from(scrapeRuns)
    .where(and(eq(scrapeRuns.userId, userId), eq(scrapeRuns.id, runId)))
    .limit(1);

  return run ?? null;
}

export async function getRunForWorker(runId: string) {
  const [run] = await db
    .select()
    .from(scrapeRuns)
    .where(eq(scrapeRuns.id, runId))
    .limit(1);

  return run ?? null;
}

export async function requestRunStop(userId: string, runId: string) {
  await db
    .update(scrapeRuns)
    .set({
      cancelRequested: true,
      updatedAt: new Date(),
    })
    .where(and(eq(scrapeRuns.userId, userId), eq(scrapeRuns.id, runId)));
}

export async function updateRun(runId: string, changes: Partial<typeof scrapeRuns.$inferInsert>) {
  await db
    .update(scrapeRuns)
    .set({
      ...changes,
      updatedAt: new Date(),
    })
    .where(eq(scrapeRuns.id, runId));
}

export async function finishRun(
  runId: string,
  params: {
    status: "completed" | "failed";
    stopReason: string;
    errorMessage?: string;
    currentPhase?: string;
  }
) {
  await db
    .update(scrapeRuns)
    .set({
      status: params.status,
      stopReason: params.stopReason,
      errorMessage: params.errorMessage ?? null,
      currentPhase: params.currentPhase ?? "completed",
      currentTerm: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(scrapeRuns.id, runId));
}

export async function getKnownLeadPlaceIds(userId: string, niche: string) {
  const rows = await db
    .select({ placeId: runLeads.placeId })
    .from(runLeads)
    .where(and(eq(runLeads.userId, userId), eq(runLeads.niche, niche)));

  return new Set(rows.map((row) => row.placeId));
}

export async function getKnownLeadIdentity(userId: string, niche: string) {
  const currentRows = await db
    .select({
      placeId: runLeads.placeId,
      businessName: runLeads.businessName,
      address: runLeads.address,
    })
    .from(runLeads)
    .where(and(eq(runLeads.userId, userId), eq(runLeads.niche, niche)));

  const legacyRows = await db
    .select({
      placeId: leads.placeId,
      businessName: leads.businessName,
      address: leads.address,
    })
    .from(leads)
    .innerJoin(scrapes, eq(leads.scrapeId, scrapes.id))
    .where(and(eq(scrapes.userId, userId), eq(scrapes.niche, niche)));

  const placeIds = new Set<string>();
  const signatures = new Set<string>();

  for (const row of [...currentRows, ...legacyRows]) {
    if (row.placeId) {
      placeIds.add(row.placeId);
    }

    const signature = buildBusinessAddressSignature(row.businessName, row.address);
    if (signature) {
      signatures.add(signature);
    }
  }

  return { placeIds, signatures };
}

export async function upsertLeadRecord(params: {
  userId: string;
  niche: string;
  placeId: string;
  businessName: string;
  address: string;
  phoneDisplay: string;
  phoneDigits: string;
  websiteUrl: string;
  socialLink: string;
  socialPlatform: string;
  classification: string;
  businessStatus: string;
  isLikelyChain: boolean;
  googleMapsUrl: string;
  rating: number | null;
  totalReviews: number;
}) {
  const existing = await db
    .select()
    .from(runLeads)
    .where(
      and(
        eq(runLeads.userId, params.userId),
        eq(runLeads.niche, params.niche),
        eq(runLeads.placeId, params.placeId)
      )
    )
    .limit(1);

  if (existing[0]) {
    const [updated] = await db
      .update(runLeads)
      .set({
        businessName: params.businessName,
        address: params.address,
        phoneDisplay: params.phoneDisplay,
        phoneDigits: params.phoneDigits,
        websiteUrl: params.websiteUrl,
        socialLink: params.socialLink,
        socialPlatform: params.socialPlatform,
        classification: params.classification,
        businessStatus: params.businessStatus,
        isLikelyChain: params.isLikelyChain,
        googleMapsUrl: params.googleMapsUrl,
        rating: params.rating,
        totalReviews: params.totalReviews,
        lastSeenAt: new Date(),
      })
      .where(eq(runLeads.id, existing[0].id))
      .returning();

    return { lead: updated, isFirstTimeSeenInSystem: false };
  }

  const [created] = await db
    .insert(runLeads)
    .values({
      ...params,
      businessStatus: params.businessStatus || null,
    })
    .returning();

  return { lead: created, isFirstTimeSeenInSystem: true };
}

export async function addRunLeadSnapshot(params: typeof runLeadSnapshots.$inferInsert) {
  const [snapshot] = await db.insert(runLeadSnapshots).values(params).returning();
  return snapshot;
}

export async function getRunPreview(runId: string, limit: number) {
  return db
    .select()
    .from(runLeadSnapshots)
    .where(and(eq(runLeadSnapshots.runId, runId), eq(runLeadSnapshots.matched, true)))
    .orderBy(asc(runLeadSnapshots.rank), desc(runLeadSnapshots.totalReviews))
    .limit(limit);
}

function toPreview(rows: Awaited<ReturnType<typeof getRunPreview>>): RunLeadPreview[] {
  return rows.map((row) => ({
    id: row.id,
    rank: row.rank,
    businessName: row.businessName,
    phoneDisplay: row.phoneDisplay,
    socialPlatform: row.socialPlatform,
    classification: row.classification as "with_website" | "without_website",
    googleMapsUrl: row.googleMapsUrl,
    rating: row.rating,
    totalReviews: row.totalReviews ?? 0,
    isLikelyChain: row.isLikelyChain,
  }));
}

function toLegacyPreview(
  rows: Array<{
    id: string;
    businessName: string;
    phone: string | null;
    socialPlatform: string | null;
    website: string | null;
    socialLink: string | null;
    googleMapsUrl: string | null;
    rating: string | null;
    totalReviews: number | null;
  }>
): RunLeadPreview[] {
  return rows.map((row, index) => ({
    id: row.id,
    rank: index + 1,
    businessName: row.businessName,
    phoneDisplay: row.phone,
    socialPlatform: row.socialPlatform,
    classification: row.website ? "with_website" : "without_website",
    googleMapsUrl: row.googleMapsUrl,
    rating: row.rating ? Number(row.rating) : null,
    totalReviews: row.totalReviews ?? 0,
    isLikelyChain: false,
  }));
}

async function toSummary(run: ScrapeRunRow, previewLimit: number): Promise<RunSummary> {
  const previewRows = await getRunPreview(run.id, previewLimit);
  const niche = getNiche(run.niche);
  const isPartialRun = run.stopReason === "user_stopped";
  const targetReached = run.stopReason === "target_reached";

  return {
    id: run.id,
    niche: run.niche,
    nicheName: niche?.name ?? run.niche,
    campaignMode: run.campaignMode as CampaignMode,
    locationLabel: run.locationLabel,
    lat: run.lat,
    lng: run.lng,
    radiusKm: run.radiusKm,
    targetCount: run.targetCount,
    status: run.status as "running" | "completed" | "failed",
    stopReason: (run.stopReason ?? null) as
      | "target_reached"
      | "search_exhausted"
      | "user_stopped"
      | "error"
      | null,
    currentPhase: run.currentPhase as
      | "starting"
      | "primary_text"
      | "fallback_text"
      | "nearby_expansion"
      | "details"
      | "finalizing"
      | "completed"
      | null,
    currentTerm: run.currentTerm,
    discoveredCount: run.discoveredCount,
    matchingLeadCount: run.matchingLeadCount,
    duplicatesSkipped: run.duplicatesSkipped,
    discoveryCallCount: run.discoveryCallCount,
    detailsCallCount: run.detailsCallCount,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    errorMessage: run.errorMessage,
    isPartialRun,
    targetReached,
    detailsEfficiency:
      run.detailsCallCount > 0 ? run.matchingLeadCount / run.detailsCallCount : null,
    discoveryEfficiency:
      run.discoveryCallCount > 0 ? run.matchingLeadCount / run.discoveryCallCount : null,
    preview: toPreview(previewRows),
  };
}

async function getLegacyRunPreview(scrapeId: string, limit: number) {
  return db
    .select()
    .from(leads)
    .where(eq(leads.scrapeId, scrapeId))
    .orderBy(desc(leads.totalReviews))
    .limit(limit);
}

async function toLegacySummary(
  scrape: typeof scrapes.$inferSelect,
  previewLimit: number
): Promise<RunSummary> {
  const previewRows = await getLegacyRunPreview(scrape.id, previewLimit);
  const niche = getNiche(scrape.niche);
  const matchingLeadCount = previewRows.length;

  return {
    id: `legacy:${scrape.id}`,
    niche: scrape.niche,
    nicheName: niche?.name ?? scrape.niche,
    campaignMode: "without_website",
    locationLabel: scrape.location,
    lat: scrape.lat,
    lng: scrape.lng,
    radiusKm: scrape.radiusKm,
    targetCount: matchingLeadCount,
    status: "completed",
    stopReason: "search_exhausted",
    currentPhase: "completed",
    currentTerm: null,
    discoveredCount: matchingLeadCount,
    matchingLeadCount,
    duplicatesSkipped: 0,
    discoveryCallCount: 0,
    detailsCallCount: 0,
    startedAt: scrape.createdAt.toISOString(),
    completedAt: scrape.createdAt.toISOString(),
    errorMessage: null,
    isPartialRun: false,
    targetReached: false,
    detailsEfficiency: null,
    discoveryEfficiency: null,
    preview: toLegacyPreview(previewRows),
  };
}

function isLegacyRunId(runId: string) {
  return runId.startsWith("legacy:");
}

function getLegacyScrapeId(runId: string) {
  return runId.replace(/^legacy:/, "");
}

export async function getRunsForDashboard(userId: string): Promise<RunListResponse> {
  const runs = await db
    .select()
    .from(scrapeRuns)
    .where(eq(scrapeRuns.userId, userId))
    .orderBy(desc(scrapeRuns.createdAt));

  const legacyScrapes = await db
    .select()
    .from(scrapes)
    .where(eq(scrapes.userId, userId))
    .orderBy(desc(scrapes.createdAt));

  const active = runs.find((run) => run.status === "running") ?? null;
  const historyRows = runs
    .filter((run) => run.id !== active?.id)
    .sort((a, b) => {
      const aSuccessful = a.status !== "failed" || a.matchingLeadCount > 0;
      const bSuccessful = b.status !== "failed" || b.matchingLeadCount > 0;
      if (aSuccessful !== bSuccessful) {
        return aSuccessful ? -1 : 1;
      }

      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  const activeRun = active ? await toSummary(active, SCRAPER_CONFIG.livePreviewCount) : null;
  const newHistory = await Promise.all(
    historyRows.map((run) => toSummary(run, SCRAPER_CONFIG.livePreviewCount))
  );
  const legacyHistory = await Promise.all(
    legacyScrapes.map((scrape) => toLegacySummary(scrape, SCRAPER_CONFIG.livePreviewCount))
  );

  const history = [...newHistory, ...legacyHistory].sort((a, b) => {
    const aSuccessful = a.status !== "failed" || a.matchingLeadCount > 0;
    const bSuccessful = b.status !== "failed" || b.matchingLeadCount > 0;
    if (aSuccessful !== bSuccessful) {
      return aSuccessful ? -1 : 1;
    }

    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  return { activeRun, history };
}

export async function getRunDetail(userId: string, runId: string) {
  if (isLegacyRunId(runId)) {
    const legacyId = getLegacyScrapeId(runId);
    const [scrape] = await db
      .select()
      .from(scrapes)
      .where(and(eq(scrapes.userId, userId), eq(scrapes.id, legacyId)))
      .limit(1);

    if (!scrape) {
      return null;
    }

    return toLegacySummary(scrape, SCRAPER_CONFIG.historyPreviewCount);
  }

  const run = await getRunById(userId, runId);
  if (!run) {
    return null;
  }

  return toSummary(run, SCRAPER_CONFIG.historyPreviewCount);
}

export async function getRunExportData(userId: string, runId: string) {
  if (isLegacyRunId(runId)) {
    const legacyId = getLegacyScrapeId(runId);
    const [scrape] = await db
      .select()
      .from(scrapes)
      .where(and(eq(scrapes.userId, userId), eq(scrapes.id, legacyId)))
      .limit(1);

    if (!scrape) {
      return null;
    }

    const rows = await db
      .select({
        id: leads.id,
        rank: leads.id,
        businessName: leads.businessName,
        businessNameNormalized: leads.businessName,
        phoneDisplay: leads.phone,
        phoneDigits: leads.phone,
        classification: leads.website,
        socialPlatform: leads.socialPlatform,
        websiteUrl: leads.website,
        socialLink: leads.socialLink,
        rating: leads.rating,
        totalReviews: leads.totalReviews,
        googleMapsUrl: leads.googleMapsUrl,
        addressDisplay: leads.address,
        addressNormalized: leads.address,
        hasPhone: leads.phone,
        hasRealWebsite: leads.website,
        hasSocialLink: leads.socialLink,
        isSocialOnly: leads.socialLink,
        isLikelyChain: leads.businessName,
        businessStatus: leads.website,
        isStatusUncertain: leads.website,
        matchReason: leads.website,
        inclusionBasis: leads.website,
        firstDiscoveryMode: leads.website,
        firstDiscoveryTerm: leads.website,
        firstDiscoveryStage: leads.website,
        isMultiPathDiscovered: leads.website,
        distinctDiscoveryPathCount: leads.totalReviews,
        hadDetailsRetry: leads.website,
        detailsAttemptCount: leads.totalReviews,
        detailsSucceededAt: leads.createdAt,
        isFirstTimeSeenInSystem: leads.website,
        placeId: leads.placeId,
        niche: scrapes.niche,
      })
      .from(leads)
      .innerJoin(scrapes, eq(leads.scrapeId, scrapes.id))
      .where(and(eq(scrapes.userId, userId), eq(scrapes.id, legacyId)))
      .orderBy(desc(leads.totalReviews));

    const normalizedRows = rows.map((row, index) => ({
      ...row,
      rank: index + 1,
      classification: row.websiteUrl ? "with_website" : "without_website",
      phoneDigits: row.phoneDigits?.replace(/\D/g, "") ?? "",
      hasPhone: Boolean(row.phoneDisplay),
      hasRealWebsite: Boolean(row.websiteUrl),
      hasSocialLink: Boolean(row.socialLink),
      isSocialOnly: Boolean(row.socialLink && !row.websiteUrl),
      isLikelyChain: false,
      businessStatus: null,
      isStatusUncertain: true,
      matchReason: row.websiteUrl ? "matched_with_website" : "matched_without_website_none",
      inclusionBasis: "direct",
      firstDiscoveryMode: null,
      firstDiscoveryTerm: null,
      firstDiscoveryStage: null,
      isMultiPathDiscovered: false,
      distinctDiscoveryPathCount: 1,
      hadDetailsRetry: false,
      detailsAttemptCount: 1,
      isFirstTimeSeenInSystem: false,
      rating: row.rating ? Number(row.rating) : null,
      totalReviews: row.totalReviews ?? 0,
    }));

    return {
      run: {
        id: scrape.id,
        userId,
        niche: scrape.niche,
        campaignMode: "without_website",
        locationLabel: scrape.location,
        isMapClickBasedLocation: false,
        lat: scrape.lat,
        lng: scrape.lng,
        radiusKm: scrape.radiusKm,
        targetCount: normalizedRows.length,
        status: "completed",
        stopReason: "search_exhausted",
        currentPhase: "completed",
        currentTerm: null,
        discoveredCount: normalizedRows.length,
        matchingLeadCount: normalizedRows.length,
        duplicatesSkipped: 0,
        discoveryCallCount: 0,
        detailsCallCount: 0,
        cancelRequested: false,
        errorMessage: null,
        startedAt: scrape.createdAt,
        completedAt: scrape.createdAt,
        createdAt: scrape.createdAt,
        updatedAt: scrape.createdAt,
      },
      rows: normalizedRows,
    };
  }

  const run = await getRunById(userId, runId);
  if (!run) {
    return null;
  }

  const rows = await db
    .select()
    .from(runLeadSnapshots)
    .where(and(eq(runLeadSnapshots.runId, runId), eq(runLeadSnapshots.matched, true)))
    .orderBy(asc(runLeadSnapshots.rank), desc(runLeadSnapshots.totalReviews));

  return { run, rows };
}

export async function getRunChecklistData(userId: string, runId: string) {
  const exportData = await getRunExportData(userId, runId);
  if (!exportData) {
    return null;
  }

  const niche = getNiche(exportData.run.niche);
  const leads: RunChecklistLead[] = exportData.rows.map((row) => ({
    id: row.id,
    rank: row.rank,
    businessName: row.businessName,
    phoneDisplay: row.phoneDisplay,
    classification: row.classification as "with_website" | "without_website",
    socialPlatform: row.socialPlatform,
    websiteUrl: row.websiteUrl,
    socialLink: row.socialLink,
    googleMapsUrl: row.googleMapsUrl,
    rating: row.rating,
    totalReviews: row.totalReviews ?? 0,
    addressDisplay: row.addressDisplay,
    isLikelyChain: row.isLikelyChain,
  }));

  return {
    run: {
      id: exportData.run.id,
      niche: exportData.run.niche,
      nicheName: niche?.name ?? exportData.run.niche,
      campaignMode: exportData.run.campaignMode as CampaignMode,
      locationLabel: exportData.run.locationLabel,
      radiusKm: exportData.run.radiusKm,
      stopReason: exportData.run.stopReason,
      matchingLeadCount: exportData.run.matchingLeadCount,
      startedAt: exportData.run.startedAt.toISOString(),
    },
    leads,
  };
}
