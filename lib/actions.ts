'use server';

import { db } from './db';
import { scrapes, leads } from './db/schema';
import { auth } from '@/auth';
import { eq, desc, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function getScrapeHistory(niche?: string) {
  const session = await auth();
  if (!session?.user?.id) return [];

  const conditions = [eq(scrapes.userId, session.user.id)];
  if (niche) {
    conditions.push(eq(scrapes.niche, niche));
  }

  return db.select().from(scrapes)
    .where(and(...conditions))
    .orderBy(desc(scrapes.createdAt));
}

export async function saveScrapeSession(params: {
  niche: string;
  location: string;
  lat: number;
  lng: number;
  radiusKm: number;
  leadsData: any[]; // The raw leads from the scrape
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  // 1. Create the scrape session
  const [newScrape] = await db.insert(scrapes).values({
    userId: session.user.id,
    niche: params.niche,
    location: params.location,
    lat: params.lat,
    lng: params.lng,
    radiusKm: params.radiusKm,
  }).returning();

  // 2. Insert the leads
  if (params.leadsData.length > 0) {
    await db.insert(leads).values(
      params.leadsData.map(l => ({
        scrapeId: newScrape.id,
        businessName: l.business_name,
        address: l.address,
        phone: l.phone,
        website: l.website,
        socialLink: l.social_link,
        socialPlatform: l.social_platform,
        rating: String(l.rating),
        totalReviews: l.total_reviews,
        googleMapsUrl: l.google_maps_url,
        placeId: l.place_id || 'unknown',
      }))
    );
  }

  revalidatePath('/');
  return newScrape;
}

export async function getKnownPlaceIds() {
  const session = await auth();
  if (!session?.user?.id) return new Set<string>();

  // Get all placeIds for this user across all their scrapes
  const results = await db.select({ placeId: leads.placeId })
    .from(leads)
    .innerJoin(scrapes, eq(leads.scrapeId, scrapes.id))
    .where(eq(scrapes.userId, session.user.id));

  return new Set(results.map(r => r.placeId));
}
