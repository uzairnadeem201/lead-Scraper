import * as XLSX from 'xlsx';

export type NicheDef = {
  name: string;
  icon: string;
  terms: string[];
  types: string[];
};

export const NICHES: Record<string, NicheDef> = {
  barbers: {
    name: "Barbers / Hair Salons", icon: "💈",
    terms: ["barber shop", "barbershop", "hair salon", "mens haircut", "fade haircut", "mens grooming"],
    types: ["hair_care"],
  },
  restaurants: {
    name: "Restaurants / Food Trucks / Cafés", icon: "🍽️",
    terms: ["restaurant", "food truck", "cafe", "diner", "eatery", "bistro"],
    types: ["restaurant", "cafe"],
  },
  trainers: {
    name: "Personal Trainers / Gym Coaches", icon: "💪",
    terms: ["personal trainer", "gym coach", "fitness trainer", "personal training", "gym"],
    types: ["gym"],
  },
  beauty: {
    name: "Beauty Salons / Nail Techs / Lash Artists", icon: "💅",
    terms: ["beauty salon", "nail salon", "lash artist", "nail technician", "lash extensions"],
    types: ["beauty_salon"],
  },
  massage: {
    name: "Massage Therapists / Spas", icon: "💆",
    terms: ["massage therapist", "spa", "massage parlor", "day spa", "massage therapy"],
    types: ["spa"],
  },
  bakeries: {
    name: "Bakeries / Home Bakers", icon: "🧁",
    terms: ["bakery", "cake shop", "pastry shop", "cupcake shop", "home baker"],
    types: ["bakery"],
  },
  interior: {
    name: "Interior Designers / Decorators", icon: "🎨",
    terms: ["interior designer", "home decorator", "interior design", "home staging"],
    types: [],
  },
  tailors: {
    name: "Clothing Alterations / Tailors", icon: "🪡",
    terms: ["tailor", "clothing alteration", "seamstress", "alterations", "suit tailor"],
    types: ["clothing_store"],
  },
  auto: {
    name: "Auto Detailers", icon: "🚗",
    terms: ["auto detailer", "car detailing", "auto detailing", "mobile detailing"],
    types: ["car_wash"],
  },
};

const SOCIAL_DOMAINS: Record<string, string> = {
  "facebook.com": "Facebook", "fb.com": "Facebook", "fb.me": "Facebook",
  "instagram.com": "Instagram", "twitter.com": "Twitter/X", "x.com": "Twitter/X",
  "tiktok.com": "TikTok", "youtube.com": "YouTube", "youtu.be": "YouTube",
  "yelp.com": "Yelp", "linkedin.com": "LinkedIn",
};

export function classifyWebsite(url: string | null | undefined) {
  if (!url) {
    return { type: "none", website: "", social: "", social_platform: "" };
  }
  const lower = url.toLowerCase();
  for (const [domain, platform] of Object.entries(SOCIAL_DOMAINS)) {
    if (lower.includes(domain)) {
      return { type: "social", website: "", social: url, social_platform: platform };
    }
  }
  return { type: "website", website: url, social: "", social_platform: "" };
}

export function generateGridPoints(lat: number, lng: number, radiusKm: number) {
  const stepKm = Math.min(Math.max(radiusKm / 3, 0.5), 5); // Minimum step of 0.5km for small ranges, max 5km
  const pts: { lat: number; lng: number }[] = [];
  const lat_s = stepKm / 111.0;
  const lng_s = stepKm / (111.0 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const n = Math.floor(radiusKm / stepKm);

  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      if (Math.sqrt(Math.pow(i * stepKm, 2) + Math.pow(j * stepKm, 2)) <= radiusKm) {
        pts.push({ lat: lat + i * lat_s, lng: lng + j * lng_s });
      }
    }
  }
  return pts;
}

export async function proxyFetch(endpoint: string, params: Record<string, any>) {
  const res = await fetch('/api/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, params }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Proxy Error: ${res.statusText}`);
  }
  return res.json();
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function downloadExcel(
  leads: any[],
  allResults: any[],
  nicheName: string,
  location: string,
  radiusKm: number,
  newCount: number,
  dupCount: number,
  filename: string
) {
  const wb = XLSX.utils.book_new();

  // Scrape Info Sheet
  const infoData = [
    ["Niche", nicheName],
    ["Location", location],
    ["Radius", `${radiusKm} km`],
    ["Date", new Date().toLocaleString()],
    ["Total Found", allResults.length],
    ["New (unique)", newCount],
    ["Duplicates Skipped", dupCount],
    ["Without Website", allResults.filter((r) => !r.website).length],
    ["With Website", allResults.filter((r) => r.website).length],
    ["With Social", allResults.filter((r) => r.social_link).length],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
  XLSX.utils.book_append_sheet(wb, wsInfo, "Scrape Info");

  // Leads Sheet
  const leadsHeaders = [
    ["Business Name", "Address", "Phone", "Social Link", "Social Platform", "Rating", "Reviews", "Google Maps"]
  ];
  const leadsData = leads.map(r => [
    r.business_name, r.address, r.phone, r.social_link, r.social_platform, r.rating, r.total_reviews, r.google_maps_url
  ]);
  const wsLeads = XLSX.utils.aoa_to_sheet([...leadsHeaders, ...leadsData]);
  XLSX.utils.book_append_sheet(wb, wsLeads, `Leads No Website (${leads.length})`);

  // All Results Sheet
  const allHeaders = [
    ["Business Name", "Address", "Phone", "Website", "Has Website", "Social Link", "Social Platform", "Rating", "Reviews", "Google Maps"]
  ];
  const allData = allResults.map(r => [
    r.business_name, r.address, r.phone, r.website, r.has_website_label, r.social_link, r.social_platform, r.rating, r.total_reviews, r.google_maps_url
  ]);
  const wsAll = XLSX.utils.aoa_to_sheet([...allHeaders, ...allData]);
  XLSX.utils.book_append_sheet(wb, wsAll, `All Results (${allResults.length})`);

  XLSX.writeFile(wb, filename);
}
