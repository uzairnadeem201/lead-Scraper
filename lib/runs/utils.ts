import type { CampaignMode } from "@/lib/config/scraper";

const SOCIAL_DOMAINS: Record<string, string> = {
  "facebook.com": "Facebook",
  "fb.com": "Facebook",
  "fb.me": "Facebook",
  "instagram.com": "Instagram",
  "twitter.com": "Twitter/X",
  "x.com": "Twitter/X",
  "tiktok.com": "TikTok",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "yelp.com": "Yelp",
  "linkedin.com": "LinkedIn",
};

const CHAIN_PATTERNS = [
  "great clips",
  "supercuts",
  "sport clips",
  "cost cutters",
  "applebee",
  "mcdonald",
  "burger king",
  "kfc",
  "subway",
  "domino",
  "pizza hut",
  "starbucks",
  "dunkin",
  "taco bell",
  "7-eleven",
];

export function classifyWebsite(url: string | null | undefined) {
  if (!url) {
    return {
      classification: "without_website" as const,
      websiteUrl: "",
      socialLink: "",
      socialPlatform: "",
      isSocialOnly: false,
      inclusionBasis: "direct" as const,
      matchReason: "matched_without_website_none",
    };
  }

  const lower = url.toLowerCase();
  for (const [domain, platform] of Object.entries(SOCIAL_DOMAINS)) {
    if (lower.includes(domain)) {
      return {
        classification: "without_website" as const,
        websiteUrl: "",
        socialLink: url,
        socialPlatform: platform,
        isSocialOnly: true,
        inclusionBasis: "subtype_rule" as const,
        matchReason: "matched_without_website_social_only",
      };
    }
  }

  return {
    classification: "with_website" as const,
    websiteUrl: url,
    socialLink: "",
    socialPlatform: "",
    isSocialOnly: false,
    inclusionBasis: "direct" as const,
    matchReason: "matched_with_website",
  };
}

export function matchesCampaignMode(
  classification: "with_website" | "without_website",
  campaignMode: CampaignMode
) {
  return classification === campaignMode;
}

export function normalizePhone(phone: string | null | undefined) {
  if (!phone) {
    return { phoneDisplay: "", phoneDigits: "" };
  }

  const phoneDigits = phone.replace(/\D/g, "");
  if (phoneDigits.length === 10) {
    return {
      phoneDisplay: `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`,
      phoneDigits,
    };
  }

  return { phoneDisplay: phone, phoneDigits };
}

export function normalizeBusinessName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeAddress(address: string | null | undefined) {
  return (address ?? "").trim().replace(/\s+/g, " ");
}

export function buildBusinessAddressSignature(
  businessName: string | null | undefined,
  address: string | null | undefined
) {
  const normalizedName = normalizeBusinessName(businessName ?? "");
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedName || !normalizedAddress) {
    return "";
  }

  return `${normalizedName}::${normalizedAddress.toLowerCase()}`;
}

export function isLikelyChain(name: string, totalReviews: number) {
  const lower = name.toLowerCase();
  return CHAIN_PATTERNS.some((pattern) => lower.includes(pattern)) || totalReviews >= 500;
}

export function scoreCandidate(candidate: {
  name?: string;
  rating?: number;
  user_ratings_total?: number;
  formatted_address?: string;
}) {
  const totalReviews = candidate.user_ratings_total ?? 0;
  const rating = candidate.rating ?? 0;
  const hasAddress = candidate.formatted_address ? 1 : 0;
  const chainPenalty = isLikelyChain(candidate.name ?? "", totalReviews) ? 250 : 0;

  return totalReviews * 10 + rating * 5 + hasAddress * 25 - chainPenalty;
}

export function isWithinRadiusKm(params: {
  centerLat: number;
  centerLng: number;
  pointLat: number;
  pointLng: number;
  radiusKm: number;
}) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(params.pointLat - params.centerLat);
  const deltaLng = toRadians(params.pointLng - params.centerLng);
  const startLat = toRadians(params.centerLat);
  const endLat = toRadians(params.pointLat);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = earthRadiusKm * c;

  return distanceKm <= params.radiusKm;
}
