const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

type LegacyTextSearchResponse = {
  next_page_token?: string;
  results?: Array<{
    place_id?: string;
    name?: string;
    rating?: number;
    user_ratings_total?: number;
    formatted_address?: string;
    business_status?: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  }>;
  status?: string;
  error_message?: string;
};

type LegacyDetailsResponse = {
  result?: {
    name?: string;
    formatted_address?: string;
    formatted_phone_number?: string;
    website?: string;
    url?: string;
    rating?: number;
    user_ratings_total?: number;
    business_status?: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  };
  status?: string;
  error_message?: string;
};

type PlacesTextSearchNewResponse = {
  places?: Array<{
    id?: string;
    name?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
    location?: {
      latitude?: number;
      longitude?: number;
    };
  }>;
  nextPageToken?: string;
  error?: {
    message?: string;
  };
};

type PlaceDetailsNewResponse = {
  id?: string;
  name?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  error?: {
    message?: string;
  };
};

type PlacesNearbySearchNewResponse = {
  places?: Array<{
    id?: string;
    name?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    businessStatus?: string;
    location?: {
      latitude?: number;
      longitude?: number;
    };
  }>;
  error?: {
    message?: string;
  };
};

function assertGoogleKey() {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("Server is missing GOOGLE_MAPS_API_KEY.");
  }
}

function createHeaders(fieldMask: string) {
  assertGoogleKey();

  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY!,
    "X-Goog-FieldMask": fieldMask,
  };
}

async function handleGoogleResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & {
    error?: { message?: string };
    error_message?: string;
    status?: string;
  };

  if (!response.ok) {
    throw new Error(
      data.error?.message ||
        data.error_message ||
        response.statusText ||
        "Google request failed"
    );
  }

  if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(data.error_message || `Google request failed with status ${data.status}`);
  }

  return data;
}

async function textSearchNew(params: Record<string, string | number | undefined>) {
  const body: Record<string, unknown> = {
    textQuery: String(params.query ?? ""),
    pageSize: 20,
  };

  if (params.pagetoken) {
    body.pageToken = String(params.pagetoken);
  }

  if (params.location && params.radius) {
    const [latitude, longitude] = String(params.location).split(",").map(Number);
    const radius = Number(params.radius);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && Number.isFinite(radius)) {
      body.locationBias = {
        circle: {
          center: { latitude, longitude },
          radius: Math.min(Math.max(radius, 1), 50000),
        },
      };
    }
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: createHeaders(
      [
        "places.id",
        "places.name",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.rating",
        "places.userRatingCount",
        "places.businessStatus",
        "nextPageToken",
      ].join(",")
    ),
    body: JSON.stringify(body),
  });

  const data = await handleGoogleResponse<PlacesTextSearchNewResponse>(response);

  const results =
    data.places?.map((place) => ({
      place_id: place.id,
      name: place.displayName?.text || place.name,
      rating: place.rating,
      user_ratings_total: place.userRatingCount,
      formatted_address: place.formattedAddress,
      business_status: place.businessStatus,
      geometry: {
        location: {
          lat: place.location?.latitude ?? 0,
          lng: place.location?.longitude ?? 0,
        },
      },
    })) ?? [];

  return {
    results,
    next_page_token: data.nextPageToken,
    status: results.length > 0 ? "OK" : "ZERO_RESULTS",
  } satisfies LegacyTextSearchResponse;
}

async function placeDetailsNew(params: Record<string, string | number | undefined>) {
  const placeId = String(params.place_id ?? "");
  const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    method: "GET",
    headers: createHeaders(
      [
        "id",
        "name",
        "displayName",
        "formattedAddress",
        "nationalPhoneNumber",
        "websiteUri",
        "googleMapsUri",
        "businessStatus",
        "rating",
        "userRatingCount",
        "location",
      ].join(",")
    ),
  });

  const data = await handleGoogleResponse<PlaceDetailsNewResponse>(response);

  return {
    result: {
      name: data.displayName?.text || data.name,
      formatted_address: data.formattedAddress,
      formatted_phone_number: data.nationalPhoneNumber,
      website: data.websiteUri,
      url: data.googleMapsUri,
      rating: data.rating,
      user_ratings_total: data.userRatingCount,
      business_status: data.businessStatus,
      geometry: {
        location: {
          lat: data.location?.latitude ?? 0,
          lng: data.location?.longitude ?? 0,
        },
      },
    },
    status: data.id ? "OK" : "ZERO_RESULTS",
  } satisfies LegacyDetailsResponse;
}

async function nearbySearchNew(params: Record<string, string | number | undefined>) {
  const [latitude, longitude] = String(params.location ?? "")
    .split(",")
    .map(Number);
  const radius = Number(params.radius ?? 0);
  const includedTypes = String(params.type ?? "")
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(radius)) {
    throw new Error("Nearby search requires numeric location and radius");
  }

  const body: Record<string, unknown> = {
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: {
          latitude,
          longitude,
        },
        radius: Math.min(Math.max(radius, 1), 50000),
      },
    },
  };

  if (includedTypes.length > 0) {
    body.includedTypes = includedTypes;
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: createHeaders(
      [
        "places.id",
        "places.name",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.rating",
        "places.userRatingCount",
        "places.businessStatus",
      ].join(",")
    ),
    body: JSON.stringify(body),
  });

  const data = await handleGoogleResponse<PlacesNearbySearchNewResponse>(response);

  const results =
    data.places?.map((place) => ({
      place_id: place.id,
      name: place.displayName?.text || place.name,
      rating: place.rating,
      user_ratings_total: place.userRatingCount,
      formatted_address: place.formattedAddress,
      business_status: place.businessStatus,
      geometry: {
        location: {
          lat: place.location?.latitude ?? 0,
          lng: place.location?.longitude ?? 0,
        },
      },
    })) ?? [];

  return {
    results,
    status: results.length > 0 ? "OK" : "ZERO_RESULTS",
  } satisfies LegacyTextSearchResponse;
}

export async function callGoogleMaps(
  endpoint: string,
  params: Record<string, string | number | undefined>
) {
  if (endpoint === "place/textsearch/json") {
    return textSearchNew(params);
  }

  if (endpoint === "place/details/json") {
    return placeDetailsNew(params);
  }

  if (endpoint === "place/nearbysearch/json") {
    return nearbySearchNew(params);
  }

  throw new Error(`Unsupported endpoint for Places API (New): ${endpoint}`);
}
