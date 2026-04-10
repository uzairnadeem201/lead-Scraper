import type { CampaignMode } from "@/lib/config/scraper";

export type RunStatus = "running" | "completed" | "failed";
export type RunStopReason =
  | "target_reached"
  | "search_exhausted"
  | "user_stopped"
  | "error";

export type RunPhase =
  | "starting"
  | "primary_text"
  | "fallback_text"
  | "nearby_expansion"
  | "details"
  | "finalizing"
  | "completed";

export type LeadClassification = "with_website" | "without_website";
export type InclusionBasis = "direct" | "subtype_rule";

export type StartRunInput = {
  niche: string;
  campaignMode: CampaignMode;
  locationLabel: string;
  isMapClickBasedLocation: boolean;
  lat: number;
  lng: number;
  radiusKm: number;
};

export type RunLeadPreview = {
  id: string;
  rank: number | null;
  businessName: string;
  phoneDisplay: string | null;
  socialPlatform: string | null;
  classification: LeadClassification;
  googleMapsUrl: string | null;
  rating: number | null;
  totalReviews: number;
  isLikelyChain: boolean;
};

export type RunSummary = {
  id: string;
  niche: string;
  nicheName: string;
  campaignMode: CampaignMode;
  locationLabel: string;
  lat: number;
  lng: number;
  radiusKm: number;
  targetCount: number;
  status: RunStatus;
  stopReason: RunStopReason | null;
  currentPhase: RunPhase | null;
  currentTerm: string | null;
  discoveredCount: number;
  matchingLeadCount: number;
  duplicatesSkipped: number;
  discoveryCallCount: number;
  detailsCallCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  isPartialRun: boolean;
  targetReached: boolean;
  detailsEfficiency: number | null;
  discoveryEfficiency: number | null;
  preview: RunLeadPreview[];
};

export type RunListResponse = {
  activeRun: RunSummary | null;
  history: RunSummary[];
};

export type RunFileItem = RunSummary;

export type RunChecklistLead = {
  id: string;
  rank: number | null;
  businessName: string;
  phoneDisplay: string | null;
  classification: LeadClassification;
  socialPlatform: string | null;
  websiteUrl: string | null;
  socialLink: string | null;
  googleMapsUrl: string | null;
  rating: number | null;
  totalReviews: number;
  addressDisplay: string | null;
  isLikelyChain: boolean;
};
