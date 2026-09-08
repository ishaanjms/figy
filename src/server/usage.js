const windows = new Map();

async function guardAIRequest(req, env) {
  if (env.AI_DISABLED === "true") throw Object.assign(new Error("AI is temporarily paused by the board owner."), { statusCode: 503 });
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin) {
    let url;
    try { url = new URL(origin); } catch { throw Object.assign(new Error("Invalid origin."), { statusCode: 403 }); }
    const local = ["localhost", "127.0.0.1"].includes(url.hostname) && /^(localhost|127\.0\.0\.1):/.test(host || "");
    if (url.host !== host && !local) throw Object.assign(new Error("This origin cannot use the AI service."), { statusCode: 403 });
  }
  const now = Date.now();
  for (const [key, entry] of windows) if (entry.until <= now) windows.delete(key);
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "local").split(",")[0];
  const limits = [["minute:" + ip, 10, 60000], ["daily", 100, 86400000]];
  for (const [key, limit, duration] of limits) {
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      const redisKey = "figy:" + key + ":" + Math.floor(now / duration);
      const result = await fetch(env.UPSTASH_REDIS_REST_URL + "/pipeline", {
        method: "POST", signal: AbortSignal.timeout(3000),
        headers: { Authorization: "Bearer " + env.UPSTASH_REDIS_REST_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", redisKey], ["EXPIRE", redisKey, Math.ceil(duration / 1000), "NX"]])
      });
      if (!result.ok) throw new Error("Usage checks are unavailable. Please retry later.");
      const data = await result.json();
      if (!Number.isFinite(data[0]?.result)) throw new Error("Usage checks are unavailable.");
      if (data[0].result > limit) throw Object.assign(new Error("AI usage limit reached. Please try again later."), { statusCode: 429 });
    } else {
      const entry = windows.get(key) || { count: 0, until: now + duration };
      if (entry.count >= limit) throw Object.assign(new Error("AI usage limit reached. Please try again later."), { statusCode: 429 });
      entry.count++;
      windows.set(key, entry);
    }
  }
}
module.exports = { guardAIRequest };
