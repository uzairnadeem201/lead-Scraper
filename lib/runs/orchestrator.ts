import { SCRAPER_CONFIG, getNiche } from "@/lib/config/scraper";
import { callGoogleMaps } from "@/lib/runs/google";
import {
  addRunLeadSnapshot,
  finishRun,
  getKnownLeadIdentity,
  getRunForWorker,
  updateRun,
  upsertLeadRecord,
} from "@/lib/runs/repository";
import {
  buildBusinessAddressSignature,
  classifyWebsite,
  isLikelyChain,
  isWithinRadiusKm,
  matchesCampaignMode,
  normalizeAddress,
  normalizeBusinessName,
  normalizePhone,
  scoreCandidate,
} from "@/lib/runs/utils";

type Candidate = {
  placeId: string;
  name: string;
  rating: number;
  totalReviews: number;
  formattedAddress: string;
  score: number;
  firstDiscoveryMode: "text" | "nearby";
  firstDiscoveryTerm: string;
  firstDiscoveryStage: "primary_text" | "fallback_text" | "nearby_expansion";
  discoveryKeys: Set<string>;
};

type RunCounters = {
  discoveredCount: number;
  duplicatesSkipped: number;
  outOfRangeSkipped: number;
  discoveryCallCount: number;
  detailsCallCount: number;
  matchingLeadCount: number;
  matchedRank: number;
};

const activeWorkers = new Map<string, Promise<void>>();

export function startRunWorker(runId: string) {
  if (activeWorkers.has(runId)) {
    return;
  }

  const worker = executeRun(runId).finally(() => {
    activeWorkers.delete(runId);
  });

  activeWorkers.set(runId, worker);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function wasCancelled(runId: string) {
  const run = await getRunForWorker(runId);
  return run?.cancelRequested ?? false;
}

/**
 * Generate grid points within a circle for comprehensive area coverage.
 * For small radii (<= threshold), returns just the center point.
 * For larger radii, generates a grid of overlapping sub-search points.
 */
function generateSearchGrid(
  centerLat: number,
  centerLng: number,
  radiusKm: number
): Array<{ lat: number; lng: number; searchRadiusM: number }> {
  if (radiusKm <= SCRAPER_CONFIG.gridSearchThresholdKm) {
    return [
      {
        lat: centerLat,
        lng: centerLng,
        searchRadiusM: Math.min(radiusKm * 1000, 50000),
      },
    ];
  }

  // Use overlapping sub-circles of ~8km radius (well within the 50km API max)
  // Step between centers: ~12km to get good overlap without excessive calls
  const subRadiusKm = 8;
  const stepKm = Math.min(subRadiusKm * 1.5, radiusKm / 2);
  const points: Array<{ lat: number; lng: number; searchRadiusM: number }> = [];

  const latStep = stepKm / 111.0;
  const lngStep =
    stepKm / (111.0 * Math.max(Math.cos((centerLat * Math.PI) / 180), 0.01));
  const n = Math.ceil(radiusKm / stepKm);

  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const distKm = Math.sqrt(
        Math.pow(i * stepKm, 2) + Math.pow(j * stepKm, 2)
      );
      // Only include grid points that are within the search radius
      if (distKm <= radiusKm) {
        points.push({
          lat: centerLat + i * latStep,
          lng: centerLng + j * lngStep,
          searchRadiusM: Math.min(subRadiusKm * 1000, 50000),
        });
      }
    }
  }

  return points;
}

async function executeRun(runId: string) {
  const run = await getRunForWorker(runId);
  if (!run) {
    return;
  }

  const niche = getNiche(run.niche);
  if (!niche) {
    await finishRun(runId, {
      status: "failed",
      stopReason: "error",
      errorMessage: `Unknown niche: ${run.niche}`,
    });
    return;
  }

  const knownLeadIdentity = await getKnownLeadIdentity(run.userId, run.niche);
  const seenThisRun = new Set<string>();
  const seenSignatureThisRun = new Set<string>();
  const exhaustedThisRun = new Set<string>();
  const queue = new Map<string, Candidate>();

  const counters: RunCounters = {
    discoveredCount: 0,
    duplicatesSkipped: 0,
    outOfRangeSkipped: 0,
    discoveryCallCount: 0,
    detailsCallCount: 0,
    matchingLeadCount: 0,
    matchedRank: 0,
  };

  const gridPoints = generateSearchGrid(run.lat, run.lng, run.radiusKm);

  try {
    // ── Stage 1: Primary text search ──
    await updateRun(runId, {
      currentPhase: "primary_text",
      currentTerm: niche.primaryTerms[0] ?? null,
    });

    await runTextSearchStage({
      runId,
      run,
      niche,
      terms: niche.primaryTerms,
      phase: "primary_text",
      gridPoints,
      knownLeadIdentity,
      seenThisRun,
      seenSignatureThisRun,
      exhaustedThisRun,
      queue,
      counters,
    });

    // ── Stage 2: Fallback text search ──
    if (
      counters.matchingLeadCount < run.targetCount &&
      !(await wasCancelled(runId))
    ) {
      await updateRun(runId, {
        currentPhase: "fallback_text",
        currentTerm: niche.fallbackTerms[0] ?? null,
      });

      await runTextSearchStage({
        runId,
        run,
        niche,
        terms: niche.fallbackTerms,
        phase: "fallback_text",
        gridPoints,
        knownLeadIdentity,
        seenThisRun,
        seenSignatureThisRun,
        exhaustedThisRun,
        queue,
        counters,
      });
    }

    // ── Stage 3: Nearby expansion (type-based) ──
    if (
      counters.matchingLeadCount < run.targetCount &&
      niche.nearbyTypes.length > 0 &&
      !(await wasCancelled(runId))
    ) {
      await updateRun(runId, {
        currentPhase: "nearby_expansion",
        currentTerm: niche.nearbyTypes[0] ?? null,
      });

      await runNearbySearchStage({
        runId,
        run,
        niche,
        gridPoints,
        knownLeadIdentity,
        seenThisRun,
        seenSignatureThisRun,
        exhaustedThisRun,
        queue,
        counters,
      });
    }

    await finishRun(runId, {
      status: "completed",
      stopReason:
        counters.matchingLeadCount >= run.targetCount
          ? "target_reached"
          : "search_exhausted",
      currentPhase: "completed",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected run error";
    await finishRun(runId, {
      status: "failed",
      stopReason: "error",
      errorMessage: message,
      currentPhase: "completed",
    });
  }
}

// ────────────────────────────────────────────────────────
// Text search stage (primary or fallback)
// ────────────────────────────────────────────────────────

async function runTextSearchStage(params: {
  runId: string;
  run: {
    userId: string;
    niche: string;
    campaignMode: string;
    targetCount: number;
    lat: number;
    lng: number;
    radiusKm: number;
  };
  niche: ReturnType<typeof getNiche>;
  terms: string[];
  phase: "primary_text" | "fallback_text";
  gridPoints: Array<{ lat: number; lng: number; searchRadiusM: number }>;
  knownLeadIdentity: { placeIds: Set<string>; signatures: Set<string> };
  seenThisRun: Set<string>;
  seenSignatureThisRun: Set<string>;
  exhaustedThisRun: Set<string>;
  queue: Map<string, Candidate>;
  counters: RunCounters;
}) {
  for (const term of params.terms) {
    if (params.counters.matchingLeadCount >= params.run.targetCount) {
      break;
    }

    if (await wasCancelled(params.runId)) {
      await finishRun(params.runId, {
        status: "completed",
        stopReason: "user_stopped",
        currentPhase: "completed",
      });
      return;
    }

    await updateRun(params.runId, {
      currentPhase: params.phase,
      currentTerm: term,
      discoveredCount: params.counters.discoveredCount,
      duplicatesSkipped: params.counters.duplicatesSkipped,
      matchingLeadCount: params.counters.matchingLeadCount,
      discoveryCallCount: params.counters.discoveryCallCount,
      detailsCallCount: params.counters.detailsCallCount,
    });

    // Search at each grid point for this term
    for (const point of params.gridPoints) {
      if (params.counters.matchingLeadCount >= params.run.targetCount) {
        break;
      }

      let nextPageToken = "";
      let firstPage = true;

      while (firstPage || nextPageToken) {
        firstPage = false;
        params.counters.discoveryCallCount += 1;

        const response = (await callGoogleMaps("place/textsearch/json", {
          query: term,
          location: `${point.lat},${point.lng}`,
          radius: point.searchRadiusM,
          pagetoken: nextPageToken || undefined,
        })) as {
          next_page_token?: string;
          results?: Array<{
            place_id?: string;
            name?: string;
            rating?: number;
            user_ratings_total?: number;
            formatted_address?: string;
            geometry?: {
              location?: {
                lat?: number;
                lng?: number;
              };
            };
          }>;
        };

        processDiscoveryResults({
          results: response.results ?? [],
          phase: params.phase,
          mode: "text",
          term,
          run: params.run,
          knownLeadIdentity: params.knownLeadIdentity,
          seenThisRun: params.seenThisRun,
          seenSignatureThisRun: params.seenSignatureThisRun,
          exhaustedThisRun: params.exhaustedThisRun,
          queue: params.queue,
          counters: params.counters,
        });

        // Drain queue after each page
        const drainResult = await drainQueue({
          runId: params.runId,
          run: params.run,
          queue: params.queue,
          exhaustedThisRun: params.exhaustedThisRun,
          matchingLeadCount: params.counters.matchingLeadCount,
          matchedRank: params.counters.matchedRank,
          detailsCallCount: params.counters.detailsCallCount,
        });

        params.counters.matchingLeadCount = drainResult.matchingLeadCount;
        params.counters.matchedRank = drainResult.matchedRank;
        params.counters.detailsCallCount = drainResult.detailsCallCount;

        await updateRun(params.runId, {
          discoveredCount: params.counters.discoveredCount,
          duplicatesSkipped: params.counters.duplicatesSkipped,
          matchingLeadCount: params.counters.matchingLeadCount,
          discoveryCallCount: params.counters.discoveryCallCount,
          detailsCallCount: params.counters.detailsCallCount,
        });

        if (params.counters.matchingLeadCount >= params.run.targetCount) {
          break;
        }

        if (!response.next_page_token) {
          nextPageToken = "";
          break;
        }

        nextPageToken = response.next_page_token;
        await sleep(1500);
      }
    }
  }
}

// ────────────────────────────────────────────────────────
// Nearby search stage (type-based expansion)
// ────────────────────────────────────────────────────────

async function runNearbySearchStage(params: {
  runId: string;
  run: {
    userId: string;
    niche: string;
    campaignMode: string;
    targetCount: number;
    lat: number;
    lng: number;
    radiusKm: number;
  };
  niche: ReturnType<typeof getNiche>;
  gridPoints: Array<{ lat: number; lng: number; searchRadiusM: number }>;
  knownLeadIdentity: { placeIds: Set<string>; signatures: Set<string> };
  seenThisRun: Set<string>;
  seenSignatureThisRun: Set<string>;
  exhaustedThisRun: Set<string>;
  queue: Map<string, Candidate>;
  counters: RunCounters;
}) {
  if (!params.niche) return;

  for (const nearbyType of params.niche.nearbyTypes) {
    if (params.counters.matchingLeadCount >= params.run.targetCount) {
      break;
    }

    if (await wasCancelled(params.runId)) {
      await finishRun(params.runId, {
        status: "completed",
        stopReason: "user_stopped",
        currentPhase: "completed",
      });
      return;
    }

    await updateRun(params.runId, {
      currentPhase: "nearby_expansion",
      currentTerm: nearbyType,
      discoveredCount: params.counters.discoveredCount,
      duplicatesSkipped: params.counters.duplicatesSkipped,
      matchingLeadCount: params.counters.matchingLeadCount,
      discoveryCallCount: params.counters.discoveryCallCount,
      detailsCallCount: params.counters.detailsCallCount,
    });

    // Search at each grid point for this nearby type
    for (const point of params.gridPoints) {
      if (params.counters.matchingLeadCount >= params.run.targetCount) {
        break;
      }

      params.counters.discoveryCallCount += 1;

      const response = (await callGoogleMaps("place/nearbysearch/json", {
        location: `${point.lat},${point.lng}`,
        radius: point.searchRadiusM,
        type: nearbyType,
      })) as {
        results?: Array<{
          place_id?: string;
          name?: string;
          rating?: number;
          user_ratings_total?: number;
          formatted_address?: string;
          geometry?: {
            location?: {
              lat?: number;
              lng?: number;
            };
          };
        }>;
      };

      processDiscoveryResults({
        results: response.results ?? [],
        phase: "nearby_expansion",
        mode: "nearby",
        term: nearbyType,
        run: params.run,
        knownLeadIdentity: params.knownLeadIdentity,
        seenThisRun: params.seenThisRun,
        seenSignatureThisRun: params.seenSignatureThisRun,
        exhaustedThisRun: params.exhaustedThisRun,
        queue: params.queue,
        counters: params.counters,
      });

      // Drain queue after each nearby search
      const drainResult = await drainQueue({
        runId: params.runId,
        run: params.run,
        queue: params.queue,
        exhaustedThisRun: params.exhaustedThisRun,
        matchingLeadCount: params.counters.matchingLeadCount,
        matchedRank: params.counters.matchedRank,
        detailsCallCount: params.counters.detailsCallCount,
      });

      params.counters.matchingLeadCount = drainResult.matchingLeadCount;
      params.counters.matchedRank = drainResult.matchedRank;
      params.counters.detailsCallCount = drainResult.detailsCallCount;

      await updateRun(params.runId, {
        discoveredCount: params.counters.discoveredCount,
        duplicatesSkipped: params.counters.duplicatesSkipped,
        matchingLeadCount: params.counters.matchingLeadCount,
        discoveryCallCount: params.counters.discoveryCallCount,
        detailsCallCount: params.counters.detailsCallCount,
      });
    }
  }
}

// ────────────────────────────────────────────────────────
// Shared result processing (dedup + queueing)
// ────────────────────────────────────────────────────────

function processDiscoveryResults(params: {
  results: Array<{
    place_id?: string;
    name?: string;
    rating?: number;
    user_ratings_total?: number;
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
  phase: "primary_text" | "fallback_text" | "nearby_expansion";
  mode: "text" | "nearby";
  term: string;
  run: {
    lat: number;
    lng: number;
    radiusKm: number;
  };
  knownLeadIdentity: { placeIds: Set<string>; signatures: Set<string> };
  seenThisRun: Set<string>;
  seenSignatureThisRun: Set<string>;
  exhaustedThisRun: Set<string>;
  queue: Map<string, Candidate>;
  counters: RunCounters;
}) {
  for (const result of params.results) {
    const placeId = result.place_id;
    if (!placeId) {
      continue;
    }

    // Validate location is within the overall search radius
    const resultLat = result.geometry?.location?.lat;
    const resultLng = result.geometry?.location?.lng;
    if (
      typeof resultLat !== "number" ||
      typeof resultLng !== "number" ||
      !isWithinRadiusKm({
        centerLat: params.run.lat,
        centerLng: params.run.lng,
        pointLat: resultLat,
        pointLng: resultLng,
        radiusKm: params.run.radiusKm,
      })
    ) {
      // Track separately — these are NOT duplicates
      params.counters.outOfRangeSkipped += 1;
      continue;
    }

    const discoveryKey = `${params.phase}:${params.term}:${placeId}`;
    const resultSignature = buildBusinessAddressSignature(
      result.name ?? "",
      result.formatted_address ?? ""
    );

    // Skip leads already known from previous runs
    if (
      params.knownLeadIdentity.placeIds.has(placeId) ||
      params.exhaustedThisRun.has(placeId) ||
      (resultSignature &&
        params.knownLeadIdentity.signatures.has(resultSignature))
    ) {
      params.counters.duplicatesSkipped += 1;
      continue;
    }

    // If already in queue, just add the discovery key for multi-path tracking
    const existing = params.queue.get(placeId);
    if (existing) {
      existing.discoveryKeys.add(discoveryKey);
      continue;
    }

    // Skip if we've already processed this place in this run
    if (
      params.seenThisRun.has(placeId) ||
      (resultSignature && params.seenSignatureThisRun.has(resultSignature))
    ) {
      params.counters.duplicatesSkipped += 1;
      continue;
    }

    params.seenThisRun.add(placeId);
    if (resultSignature) {
      params.seenSignatureThisRun.add(resultSignature);
    }
    params.counters.discoveredCount += 1;

    params.queue.set(placeId, {
      placeId,
      name: result.name ?? "Unknown Business",
      rating: result.rating ?? 0,
      totalReviews: result.user_ratings_total ?? 0,
      formattedAddress: result.formatted_address ?? "",
      score: scoreCandidate({
        name: result.name,
        rating: result.rating,
        user_ratings_total: result.user_ratings_total,
        formatted_address: result.formatted_address,
      }),
      firstDiscoveryMode: params.mode,
      firstDiscoveryTerm: params.term,
      firstDiscoveryStage: params.phase,
      discoveryKeys: new Set([discoveryKey]),
    });
  }
}

// ────────────────────────────────────────────────────────
// Queue draining (details fetch + lead processing)
// ────────────────────────────────────────────────────────

async function drainQueue(params: {
  runId: string;
  run: {
    userId: string;
    niche: string;
    campaignMode: string;
    targetCount: number;
  };
  queue: Map<string, Candidate>;
  exhaustedThisRun: Set<string>;
  matchingLeadCount: number;
  matchedRank: number;
  detailsCallCount: number;
}) {
  let matchingLeadCount = params.matchingLeadCount;
  let matchedRank = params.matchedRank;
  let detailsCallCount = params.detailsCallCount;

  while (params.queue.size > 0 && matchingLeadCount < params.run.targetCount) {
    if (await wasCancelled(params.runId)) {
      break;
    }

    const batch = [...params.queue.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, SCRAPER_CONFIG.detailsConcurrency);

    batch.forEach((candidate) => {
      params.queue.delete(candidate.placeId);
    });

    await updateRun(params.runId, {
      currentPhase: "details",
      currentTerm: batch[0]?.firstDiscoveryTerm ?? null,
    });

    const processed = await Promise.all(
      batch.map((candidate) =>
        processCandidate({
          runId: params.runId,
          run: params.run,
          candidate,
          exhaustedThisRun: params.exhaustedThisRun,
          nextRank: matchedRank + 1,
        })
      )
    );

    for (const result of processed) {
      detailsCallCount += result.detailsAttempts;
      if (result.matched) {
        matchedRank += 1;
        matchingLeadCount += 1;
      }
    }

    await updateRun(params.runId, {
      matchingLeadCount,
      detailsCallCount,
    });
  }

  return { matchingLeadCount, matchedRank, detailsCallCount };
}

async function processCandidate(params: {
  runId: string;
  run: {
    userId: string;
    niche: string;
    campaignMode: string;
  };
  candidate: Candidate;
  exhaustedThisRun: Set<string>;
  nextRank: number;
}) {
  let detailsAttempts = 0;
  let lastError: Error | null = null;

  for (
    let attempt = 1;
    attempt <= SCRAPER_CONFIG.maxDetailsRetries + 1;
    attempt += 1
  ) {
    try {
      detailsAttempts += 1;
      const response = (await callGoogleMaps("place/details/json", {
        place_id: params.candidate.placeId,
        fields:
          "name,formatted_address,formatted_phone_number,website,url,rating,user_ratings_total,business_status",
      })) as {
        result?: {
          name?: string;
          formatted_address?: string;
          formatted_phone_number?: string;
          website?: string;
          url?: string;
          rating?: number;
          user_ratings_total?: number;
          business_status?: string;
        };
      };

      const detail = response.result ?? {};
      if (detail.business_status === "CLOSED_PERMANENTLY") {
        return { matched: false, detailsAttempts };
      }

      const website = classifyWebsite(detail.website);
      const normalizedPhone = normalizePhone(detail.formatted_phone_number);
      const businessName = detail.name ?? params.candidate.name;
      const normalizedAddress = normalizeAddress(detail.formatted_address);
      const totalReviews =
        detail.user_ratings_total ?? params.candidate.totalReviews ?? 0;
      const rating = detail.rating ?? params.candidate.rating ?? 0;
      const likelyChain = isLikelyChain(businessName, totalReviews);
      const matched = matchesCampaignMode(
        website.classification,
        params.run.campaignMode as "with_website" | "without_website"
      );

      const { lead, isFirstTimeSeenInSystem } = await upsertLeadRecord({
        userId: params.run.userId,
        niche: params.run.niche,
        placeId: params.candidate.placeId,
        businessName,
        address: normalizedAddress,
        phoneDisplay: normalizedPhone.phoneDisplay,
        phoneDigits: normalizedPhone.phoneDigits,
        websiteUrl: website.websiteUrl,
        socialLink: website.socialLink,
        socialPlatform: website.socialPlatform,
        classification: website.classification,
        businessStatus: detail.business_status ?? "",
        isLikelyChain: likelyChain,
        googleMapsUrl: detail.url ?? "",
        rating: Number.isFinite(rating) ? rating : null,
        totalReviews,
      });

      await addRunLeadSnapshot({
        runId: params.runId,
        leadId: lead.id,
        placeId: params.candidate.placeId,
        niche: params.run.niche,
        businessName,
        businessNameNormalized: normalizeBusinessName(businessName),
        addressDisplay: detail.formatted_address ?? "",
        addressNormalized: normalizedAddress,
        phoneDisplay: normalizedPhone.phoneDisplay,
        phoneDigits: normalizedPhone.phoneDigits,
        websiteUrl: website.websiteUrl,
        socialLink: website.socialLink,
        socialPlatform: website.socialPlatform,
        classification: website.classification,
        matchReason: website.matchReason,
        inclusionBasis: website.inclusionBasis,
        hasPhone: normalizedPhone.phoneDigits.length > 0,
        hasRealWebsite: website.websiteUrl.length > 0,
        hasSocialLink: website.socialLink.length > 0,
        isSocialOnly: website.isSocialOnly,
        isLikelyChain: likelyChain,
        businessStatus: detail.business_status ?? null,
        isStatusUncertain: !detail.business_status,
        rating: Number.isFinite(rating) ? rating : null,
        totalReviews,
        googleMapsUrl: detail.url ?? "",
        matched,
        rank: matched ? params.nextRank : null,
        firstDiscoveryMode: params.candidate.firstDiscoveryMode,
        firstDiscoveryTerm: params.candidate.firstDiscoveryTerm,
        firstDiscoveryStage: params.candidate.firstDiscoveryStage,
        isMultiPathDiscovered: params.candidate.discoveryKeys.size > 1,
        distinctDiscoveryPathCount: params.candidate.discoveryKeys.size,
        hadDetailsRetry: attempt > 1,
        detailsAttemptCount: detailsAttempts,
        detailsSucceededAt: new Date(),
        isFirstTimeSeenInSystem,
      });

      return { matched, detailsAttempts };
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Details request failed");
      if (attempt <= SCRAPER_CONFIG.maxDetailsRetries) {
        await sleep(400 * attempt);
      }
    }
  }

  params.exhaustedThisRun.add(params.candidate.placeId);
  if (lastError) {
    await updateRun(params.runId, {
      errorMessage: lastError.message,
    });
  }

  return { matched: false, detailsAttempts };
}
