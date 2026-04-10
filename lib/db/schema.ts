import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  uuid,
  doublePrecision,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";

// --- Auth.js Tables ---

export const users = pgTable("user", {
  id: text("id").notNull().primaryKey(),
  name: text("name"),
  username: text("username").unique(),
  email: text("email"),
  password: text("password"),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").notNull().primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

// --- Scraper Tables ---

export const scrapes = pgTable("scrape", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  niche: text("niche").notNull(),
  location: text("location").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  radiusKm: integer("radiusKm").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const leads = pgTable("lead", {
  id: uuid("id").defaultRandom().primaryKey(),
  scrapeId: uuid("scrapeId")
    .notNull()
    .references(() => scrapes.id, { onDelete: "cascade" }),
  businessName: text("businessName").notNull(),
  address: text("address"),
  phone: text("phone"),
  website: text("website"),
  socialLink: text("socialLink"),
  socialPlatform: text("socialPlatform"),
  rating: text("rating"),
  totalReviews: integer("totalReviews"),
  googleMapsUrl: text("googleMapsUrl"),
  placeId: text("placeId").notNull(), // Important for deduplication
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const runLeads = pgTable(
  "run_lead",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    niche: text("niche").notNull(),
    placeId: text("placeId").notNull(),
    businessName: text("businessName").notNull(),
    address: text("address"),
    phoneDisplay: text("phoneDisplay"),
    phoneDigits: text("phoneDigits"),
    websiteUrl: text("websiteUrl"),
    socialLink: text("socialLink"),
    socialPlatform: text("socialPlatform"),
    classification: text("classification").notNull(),
    businessStatus: text("businessStatus"),
    isLikelyChain: boolean("isLikelyChain").default(false).notNull(),
    googleMapsUrl: text("googleMapsUrl"),
    rating: doublePrecision("rating"),
    totalReviews: integer("totalReviews"),
    firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  },
  (table) => ({
    uniqueLeadPerUserAndNiche: unique("run_lead_user_niche_place_unique").on(
      table.userId,
      table.niche,
      table.placeId
    ),
  })
);

export const scrapeRuns = pgTable("scrape_run", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  niche: text("niche").notNull(),
  campaignMode: text("campaignMode").notNull(),
  locationLabel: text("locationLabel").notNull(),
  isMapClickBasedLocation: boolean("isMapClickBasedLocation")
    .default(false)
    .notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  radiusKm: integer("radiusKm").notNull(),
  targetCount: integer("targetCount").notNull(),
  status: text("status").notNull(),
  stopReason: text("stopReason"),
  currentPhase: text("currentPhase"),
  currentTerm: text("currentTerm"),
  discoveredCount: integer("discoveredCount").default(0).notNull(),
  matchingLeadCount: integer("matchingLeadCount").default(0).notNull(),
  duplicatesSkipped: integer("duplicatesSkipped").default(0).notNull(),
  discoveryCallCount: integer("discoveryCallCount").default(0).notNull(),
  detailsCallCount: integer("detailsCallCount").default(0).notNull(),
  cancelRequested: boolean("cancelRequested").default(false).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const runLeadSnapshots = pgTable("run_lead_snapshot", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("runId")
    .notNull()
    .references(() => scrapeRuns.id, { onDelete: "cascade" }),
  leadId: uuid("leadId")
    .notNull()
    .references(() => runLeads.id, { onDelete: "cascade" }),
  placeId: text("placeId").notNull(),
  niche: text("niche").notNull(),
  businessName: text("businessName").notNull(),
  businessNameNormalized: text("businessNameNormalized"),
  addressDisplay: text("addressDisplay"),
  addressNormalized: text("addressNormalized"),
  phoneDisplay: text("phoneDisplay"),
  phoneDigits: text("phoneDigits"),
  websiteUrl: text("websiteUrl"),
  socialLink: text("socialLink"),
  socialPlatform: text("socialPlatform"),
  classification: text("classification").notNull(),
  matchReason: text("matchReason").notNull(),
  inclusionBasis: text("inclusionBasis").notNull(),
  hasPhone: boolean("hasPhone").default(false).notNull(),
  hasRealWebsite: boolean("hasRealWebsite").default(false).notNull(),
  hasSocialLink: boolean("hasSocialLink").default(false).notNull(),
  isSocialOnly: boolean("isSocialOnly").default(false).notNull(),
  isLikelyChain: boolean("isLikelyChain").default(false).notNull(),
  businessStatus: text("businessStatus"),
  isStatusUncertain: boolean("isStatusUncertain").default(false).notNull(),
  rating: doublePrecision("rating"),
  totalReviews: integer("totalReviews"),
  googleMapsUrl: text("googleMapsUrl"),
  matched: boolean("matched").notNull(),
  rank: integer("rank"),
  firstDiscoveryMode: text("firstDiscoveryMode"),
  firstDiscoveryTerm: text("firstDiscoveryTerm"),
  firstDiscoveryStage: text("firstDiscoveryStage"),
  isMultiPathDiscovered: boolean("isMultiPathDiscovered")
    .default(false)
    .notNull(),
  distinctDiscoveryPathCount: integer("distinctDiscoveryPathCount")
    .default(1)
    .notNull(),
  hadDetailsRetry: boolean("hadDetailsRetry").default(false).notNull(),
  detailsAttemptCount: integer("detailsAttemptCount").default(1).notNull(),
  detailsSucceededAt: timestamp("detailsSucceededAt").notNull(),
  isFirstTimeSeenInSystem: boolean("isFirstTimeSeenInSystem")
    .default(false)
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
