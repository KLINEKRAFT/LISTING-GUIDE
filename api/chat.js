// ─────────────────────────────────────────────────────────────────────────────
// Coldwell Banker Select — Chat proxy
// Forwards browser chat requests to the Anthropic API with the server-side key.
// Adds a cache_control breakpoint on the system prompt — the listing feed
// summary is large and identical across every turn within a session.
// ─────────────────────────────────────────────────────────────────────────────
export const config = { runtime: "edge" };

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: "Server misconfigured: ANTHROPIC_API_KEY not set" }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { system, messages } = body;
  if (typeof system !== "string" || !Array.isArray(messages) || !messages.length) {
    return json({ error: "Missing 'system' or 'messages'" }, 400);
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
    }),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
