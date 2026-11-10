import { createHash } from "node:crypto";
import { HttpError } from "../lib/validation.js";
export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");
export async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.match(
    /^Bearer ([a-f0-9]{64})$/,
  )?.[1];
  const session =
    token &&
    (await req.db.collection("sessions").findOne({
      _id: hashToken(token),
      expiresAt: { $gt: new Date() },
    }));
  if (!session) throw new HttpError(401, "Sign in to your dashboard.");
  req.sessionId = session._id;
  res.set("Cache-Control", "no-store");
  next();
}
// Database-backed rate limits survive serverless cold starts and multiple instances.
export function rateLimit(scope, limit, windowMs = 15 * 60 * 1000) {
  return async (req, res, next) => {
    const bucket = Math.floor(Date.now() / windowMs);
    const address =
      req.headers["x-nf-client-connection-ip"] || req.ip || "unknown";
    const id = hashToken(`${scope}:${address}:${bucket}`);
    const row = await req.db.collection("rateLimits").findOneAndUpdate(
      { _id: id },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (row.count > limit) {
      res.set(
        "Retry-After",
        String(Math.ceil(((bucket + 1) * windowMs - Date.now()) / 1000)),
      );
      throw new HttpError(429, "Too many attempts. Please try again later.");
    }
    next();
  };
}
