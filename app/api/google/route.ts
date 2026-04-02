import { NextResponse } from 'next/server';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { endpoint, params } = body;

    if (!GOOGLE_MAPS_API_KEY) {
      return NextResponse.json(
        { error: 'Server is missing GOOGLE_MAPS_API_KEY environment variable. Add it to .env or Vercel settings.' },
        { status: 500 }
      );
    }

    if (!endpoint) {
      return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
    }

    // Define permitted endpoints for security
    const allowedEndpoints = [
      'geocode/json',
      'place/textsearch/json',
      'place/nearbysearch/json',
      'place/details/json',
    ];

    if (!allowedEndpoints.includes(endpoint)) {
      return NextResponse.json({ error: 'Endpoint not allowed' }, { status: 403 });
    }

    // Build query params
    const queryParams = new URLSearchParams();
    if (params) {
      for (const key of Object.keys(params)) {
        if (params[key] !== undefined && params[key] !== null) {
            queryParams.append(key, String(params[key]));
        }
      }
    }
    queryParams.append('key', GOOGLE_MAPS_API_KEY);

    const url = `https://maps.googleapis.com/maps/api/${endpoint}?${queryParams.toString()}`;

    // Standard Google Maps API Proxy Fetch
    const response = await fetch(url);
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Google Maps API Proxy Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
