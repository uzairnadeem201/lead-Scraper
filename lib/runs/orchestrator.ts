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
  firstDiscoveryMode: "text";
  firstDiscoveryTerm: string;
  firstDiscoveryStage: "primary_text" | "fallback_text";
  discoveryKeys: Set<string>;
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

  let discoveredCount = 0;
  let duplicatesSkipped = 0;
  let discoveryCallCount = 0;
  let detailsCallCount = 0;
  let matchingLeadCount = 0;
  let matchedRank = 0;

  try {
    await updateRun(runId, {
      currentPhase: "primary_text",
      currentTerm: niche.primaryTerms[0] ?? null,
    });

    const stages = [
      {
        phase: "primary_text" as const,
        terms: niche.primaryTerms,
      },
      {
        phase: "fallback_text" as const,
        terms: niche.fallbackTerms,
      },
    ];

    for (const stage of stages) {
      for (const term of stage.terms) {
        if (matchingLeadCount >= run.targetCount) {
          break;
        }

        if (await wasCancelled(runId)) {
          await finishRun(runId, {
            status: "completed",
            stopReason: "user_stopped",
            currentPhase: "completed",
          });
          return;
        }

        await updateRun(runId, {
          currentPhase: stage.phase,
          currentTerm: term,
          discoveredCount,
          duplicatesSkipped,
          matchingLeadCount,
          discoveryCallCount,
          detailsCallCount,
        });

        let nextPageToken = "";
        let firstPage = true;

        while (firstPage || nextPageToken) {
          firstPage = false;
          discoveryCallCount += 1;

          const response = (await callGoogleMaps("place/textsearch/json", {
            query: term,
            location: `${run.lat},${run.lng}`,
            radius: Math.min(run.radiusKm * 1000, 50000),
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

          for (const result of response.results ?? []) {
            const placeId = result.place_id;
            if (!placeId) {
              continue;
            }

            const resultLat = result.geometry?.location?.lat;
            const resultLng = result.geometry?.location?.lng;
            if (
              typeof resultLat !== "number" ||
              typeof resultLng !== "number" ||
              !isWithinRadiusKm({
                centerLat: run.lat,
                centerLng: run.lng,
                pointLat: resultLat,
                pointLng: resultLng,
                radiusKm: run.radiusKm,
              })
            ) {
              duplicatesSkipped += 1;
              continue;
            }

            const discoveryKey = `${stage.phase}:${term}:${placeId}`;
            const resultSignature = buildBusinessAddressSignature(
              result.name ?? "",
              result.formatted_address ?? ""
            );

            if (
              knownLeadIdentity.placeIds.has(placeId) ||
              exhaustedThisRun.has(placeId) ||
              (resultSignature && knownLeadIdentity.signatures.has(resultSignature))
            ) {
              duplicatesSkipped += 1;
              continue;
            }

            const existing = queue.get(placeId);
            if (existing) {
              existing.discoveryKeys.add(discoveryKey);
              continue;
            }

            if (
              seenThisRun.has(placeId) ||
              (resultSignature && seenSignatureThisRun.has(resultSignature))
            ) {
              duplicatesSkipped += 1;
              continue;
            }

            seenThisRun.add(placeId);
            if (resultSignature) {
              seenSignatureThisRun.add(resultSignature);
            }
            discoveredCount += 1;
            queue.set(placeId, {
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
              firstDiscoveryMode: "text",
              firstDiscoveryTerm: term,
              firstDiscoveryStage: stage.phase,
              discoveryKeys: new Set([discoveryKey]),
            });
          }

          matchingLeadCount = await drainQueue({
            runId,
            run,
            queue,
            exhaustedThisRun,
            matchingLeadCount,
            matchedRank,
            detailsCallCount,
          }).then((result) => {
            matchedRank = result.matchedRank;
            detailsCallCount = result.detailsCallCount;
            return result.matchingLeadCount;
          });

          await updateRun(runId, {
            discoveredCount,
            duplicatesSkipped,
            matchingLeadCount,
            discoveryCallCount,
            detailsCallCount,
          });

          if (matchingLeadCount >= run.targetCount) {
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

      if (matchingLeadCount >= run.targetCount) {
        break;
      }
    }

    await finishRun(runId, {
      status: "completed",
      stopReason:
        matchingLeadCount >= run.targetCount ? "target_reached" : "search_exhausted",
      currentPhase: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected run error";
    await finishRun(runId, {
      status: "failed",
      stopReason: "error",
      errorMessage: message,
      currentPhase: "completed",
    });
  }
}

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

  for (let attempt = 1; attempt <= SCRAPER_CONFIG.maxDetailsRetries + 1; attempt += 1) {
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
      const totalReviews = detail.user_ratings_total ?? params.candidate.totalReviews ?? 0;
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
      lastError = error instanceof Error ? error : new Error("Details request failed");
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
