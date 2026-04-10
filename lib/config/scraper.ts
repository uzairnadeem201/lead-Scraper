export type CampaignMode = "without_website" | "with_website";

export type NicheDef = {
  name: string;
  icon: string;
  primaryTerms: string[];
  fallbackTerms: string[];
  nearbyTypes: string[];
};

export const SCRAPER_CONFIG = {
  targetCount: 100,
  detailsConcurrency: 3,
  maxDetailsRetries: 2,
  pollIntervalMs: 2500,
  livePreviewCount: 5,
  historyPreviewCount: 25,
} as const;

export const NICHES: Record<string, NicheDef> = {
  barbers: {
    name: "Barbers / Hair Salons",
    icon: "💈",
    primaryTerms: ["barber shop", "barbershop", "hair salon"],
    fallbackTerms: ["mens haircut", "fade haircut", "mens grooming"],
    nearbyTypes: ["hair_care"],
  },
  restaurants: {
    name: "Restaurants / Food Trucks / Cafes",
    icon: "🍽️",
    primaryTerms: ["restaurant", "food truck", "cafe"],
    fallbackTerms: ["diner", "eatery", "bistro"],
    nearbyTypes: ["restaurant", "cafe"],
  },
  trainers: {
    name: "Personal Trainers / Gym Coaches",
    icon: "💪",
    primaryTerms: ["personal trainer", "gym coach", "fitness trainer"],
    fallbackTerms: ["personal training", "gym"],
    nearbyTypes: ["gym"],
  },
  beauty: {
    name: "Beauty Salons / Nail Techs / Lash Artists",
    icon: "💅",
    primaryTerms: ["beauty salon", "nail salon", "lash artist"],
    fallbackTerms: ["nail technician", "lash extensions"],
    nearbyTypes: ["beauty_salon"],
  },
  massage: {
    name: "Massage Therapists / Spas",
    icon: "💆",
    primaryTerms: ["massage therapist", "spa", "massage therapy"],
    fallbackTerms: ["massage parlor", "day spa"],
    nearbyTypes: ["spa"],
  },
  bakeries: {
    name: "Bakeries / Home Bakers",
    icon: "🧁",
    primaryTerms: ["bakery", "cake shop", "pastry shop"],
    fallbackTerms: ["cupcake shop", "home baker"],
    nearbyTypes: ["bakery"],
  },
  interior: {
    name: "Interior Designers / Decorators",
    icon: "🎨",
    primaryTerms: ["interior designer", "home decorator", "interior design"],
    fallbackTerms: ["home staging"],
    nearbyTypes: [],
  },
  tailors: {
    name: "Clothing Alterations / Tailors",
    icon: "🪡",
    primaryTerms: ["tailor", "clothing alteration", "seamstress"],
    fallbackTerms: ["alterations", "suit tailor"],
    nearbyTypes: ["clothing_store"],
  },
  auto: {
    name: "Auto Detailers",
    icon: "🚗",
    primaryTerms: ["auto detailer", "car detailing", "auto detailing"],
    fallbackTerms: ["mobile detailing"],
    nearbyTypes: ["car_wash"],
  },
};

export function getNiche(key: string) {
  return NICHES[key];
}
