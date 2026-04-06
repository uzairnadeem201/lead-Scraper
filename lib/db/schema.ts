import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  uuid,
  doublePrecision,
  boolean,
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
