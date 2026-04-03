import { createHmac, timingSafeEqual } from "crypto";

const PADDLE_SIGNATURE_TOLERANCE_SECONDS = (() => {
  const raw = Number.parseInt(
    process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS || "",
    10,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
})();

function normalizePaddleEnvironment(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "sandbox"
    ? "sandbox"
    : "production";
}

function getPaddleApiKey() {
  return process.env.PADDLE_API_KEY?.trim() || "";
}

function getPaddleApiBase() {
  const apiKey = getPaddleApiKey();

  if (apiKey.startsWith("pdl_sdbx_")) {
    return "https://sandbox-api.paddle.com";
  }

  return "https://api.paddle.com";
}

function getPaddleWebhookSecret() {
  return process.env.PADDLE_WEBHOOK_SECRET?.trim() || "";
}

function getPaddlePublicClientToken() {
  return process.env.EXPO_PUBLIC_PADDLE_CLIENT_TOKEN?.trim() || "";
}

function getPaddlePublicPriceId(name) {
  return process.env[`EXPO_PUBLIC_PADDLE_${name}`]?.trim() || "";
}

function buildPaddleApiUrl(endpoint, searchParams) {
  const url = new URL(endpoint, getPaddleApiBase());

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function parsePaddleResponse(response) {
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function getPaddleErrorMessage(parsed, status) {
  if (parsed && typeof parsed === "object") {
    const fromError =
      parsed.error?.detail ||
      parsed.error?.message ||
      parsed.error?.errors?.[0]?.detail ||
      parsed.errors?.[0]?.detail;

    if (typeof fromError === "string" && fromError.trim()) {
      return fromError.trim();
    }
  }

  if (typeof parsed === "string" && parsed.trim()) {
    return parsed.trim();
  }

  return `Paddle API request failed (${status})`;
}

export function getPaddlePublicConfig() {
  const clientToken = getPaddlePublicClientToken();
  const monthlyPriceId = getPaddlePublicPriceId("MONTHLY_PRICE_ID");
  const yearlyPriceId = getPaddlePublicPriceId("YEARLY_PRICE_ID");

  return {
    environment: normalizePaddleEnvironment(process.env.EXPO_PUBLIC_PADDLE_ENV),
    clientToken: clientToken || null,
    monthlyPriceId: monthlyPriceId || null,
    yearlyPriceId: yearlyPriceId || null,
    isCheckoutReady: Boolean(clientToken && monthlyPriceId && yearlyPriceId),
  };
}

export function isPaddleApiConfigured() {
  return Boolean(getPaddleApiKey());
}

export function isPaddleWebhookConfigured() {
  return Boolean(getPaddleWebhookSecret());
}

export async function paddleApiRequest(endpoint, options = {}) {
  const apiKey = getPaddleApiKey();
  if (!apiKey) {
    throw new Error("Paddle API key is not configured on the server");
  }

  const {
    method = "GET",
    body,
    headers = {},
    searchParams,
  } = options;
  const url = buildPaddleApiUrl(endpoint, searchParams);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await parsePaddleResponse(response);

  if (!response.ok) {
    const error = new Error(getPaddleErrorMessage(parsed, response.status));
    error.status = response.status;
    error.body = parsed;
    throw error;
  }

  return parsed;
}

export function verifyPaddleWebhookSignature(rawBody, signatureHeader) {
  const webhookSecret = getPaddleWebhookSecret();

  if (!webhookSecret) {
    throw new Error("Paddle webhook secret is not configured on the server");
  }

  if (typeof rawBody !== "string" || !rawBody.length) {
    return false;
  }

  if (typeof signatureHeader !== "string" || !signatureHeader.trim()) {
    return false;
  }

  const parts = signatureHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const timestampPart = parts.find((part) => part.startsWith("ts="));
  const signatureParts = parts.filter((part) => part.startsWith("h1="));

  if (!timestampPart || signatureParts.length === 0) {
    return false;
  }

  const timestamp = Number.parseInt(timestampPart.slice(3), 10);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return false;
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > PADDLE_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}:${rawBody}`;
  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  return signatureParts.some((part) => {
    const candidate = part.slice(3).trim();
    if (!candidate || candidate.length !== expectedSignature.length) {
      return false;
    }

    try {
      return timingSafeEqual(expectedBuffer, Buffer.from(candidate, "hex"));
    } catch {
      return false;
    }
  });
}

export function extractPaddleCustomUserId(entity) {
  const rawValue =
    entity?.custom_data?.keystone_user_id ??
    entity?.custom_data?.keystoneUserId ??
    entity?.customData?.keystone_user_id ??
    entity?.customData?.keystoneUserId ??
    null;
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizePaddleSubscriptionStatus(status) {
  if (typeof status !== "string") {
    return null;
  }

  const normalized = status.trim().toLowerCase();
  return normalized || null;
}

export function isPaddleSubscriptionAccessActive(status) {
  return ["active", "trialing", "past_due"].includes(
    normalizePaddleSubscriptionStatus(status) || "",
  );
}

export function extractPaddlePriceId(entity) {
  if (!entity || typeof entity !== "object") {
    return null;
  }

  const items = Array.isArray(entity.items) ? entity.items : [];
  for (const item of items) {
    const directPriceId =
      typeof item?.price_id === "string" ? item.price_id.trim() : "";
    if (directPriceId) {
      return directPriceId;
    }

    const nestedPriceId =
      typeof item?.price?.id === "string" ? item.price.id.trim() : "";
    if (nestedPriceId) {
      return nestedPriceId;
    }
  }

  return null;
}

export async function findPaddleCustomerByEmail(email) {
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (!normalizedEmail) {
    return null;
  }

  const response = await paddleApiRequest("/customers", {
    searchParams: {
      email: normalizedEmail,
      per_page: 50,
    },
  });
  const customers = Array.isArray(response?.data) ? response.data : [];

  return customers.find((customer) => {
    const customerEmail =
      typeof customer?.email === "string" ? customer.email.trim().toLowerCase() : "";
    return customerEmail === normalizedEmail;
  }) || null;
}

export async function listPaddleSubscriptionsForCustomer(customerId) {
  const normalizedCustomerId =
    typeof customerId === "string" ? customerId.trim() : "";

  if (!normalizedCustomerId) {
    return [];
  }

  const response = await paddleApiRequest("/subscriptions", {
    searchParams: {
      customer_id: normalizedCustomerId,
      per_page: 50,
    },
  });

  return Array.isArray(response?.data) ? response.data : [];
}
