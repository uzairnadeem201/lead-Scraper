type RingCentralTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
  message?: string;
  errors?: Array<{ message?: string; errorCode?: string }>;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`);
  }

  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) {
    return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (!digits) {
    throw new Error("Lead does not have a valid phone number.");
  }

  return `+${digits}`;
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const clientId = requireEnv("RINGCENTRAL_CLIENT_ID");
  const clientSecret = requireEnv("RINGCENTRAL_CLIENT_SECRET");
  const jwt = requireEnv("RINGCENTRAL_JWT");
  const serverUrl = requireEnv("RINGCENTRAL_SERVER_URL");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${serverUrl}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = (await response.json()) as RingCentralTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.errors?.[0]?.message ||
        data.message ||
        data.error ||
        "Failed to authenticate with RingCentral."
    );
  }

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max((data.expires_in ?? 3600) - 60, 60) * 1000,
  };

  return data.access_token;
}

export async function sendRingCentralSms(params: { toNumber: string; text: string }) {
  const token = await getAccessToken();
  const serverUrl = requireEnv("RINGCENTRAL_SERVER_URL");
  const fromNumber = normalizePhoneNumber(requireEnv("RINGCENTRAL_FROM_NUMBER"));
  const toNumber = normalizePhoneNumber(params.toNumber);

  const response = await fetch(`${serverUrl}/restapi/v1.0/account/~/extension/~/sms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { phoneNumber: fromNumber },
      to: [{ phoneNumber: toNumber }],
      text: params.text,
    }),
  });

  const rawText = await response.text();
  let data = {} as {
    message?: string;
    errorCode?: string;
    errors?: Array<{ message?: string; errorCode?: string }>;
  };
  try {
    data = rawText ? (JSON.parse(rawText) as typeof data) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.errors?.[0]?.message ||
        data.message ||
        data.errorCode ||
        rawText ||
        "Failed to send RingCentral SMS."
    );
  }

  return data;
}

export function buildLeadMessage(storeName: string) {
  return `${storeName}! The thing is, I can help you increase your customers—and since your services are already good, those customers will stick around and boost your sales.

I don’t have a magic wand, but I can show you what others are doing: they use personalized websites to influence customer psychology and build trust, making them look like the best option in town. You can check any nearby business for reference.

I can build the same for you. All I ask is a free consultation—if you like my work, we move forward; if not, you lose nothing. WIN-WIN!`;
}
