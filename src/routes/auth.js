import { Router } from "express";
import { hashPassword } from "../password.js";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { verifyPassword } from "../password.js";
import { hashToken, rateLimit, requireAdmin } from "../middleware/auth.js";
import { HttpError, parse } from "../lib/validation.js";
export const authRouter = Router();
authRouter.post("/login", rateLimit("login", 8), async (req, res) => {
  const stored = await req.db
    .collection("credentials")
    .findOne({ _id: "admin" });
  const passwordHash = stored?.passwordHash || process.env.ADMIN_PASSWORD_HASH;
  if (!passwordHash)
    throw new HttpError(
      503,
      "Admin access is not configured. Set ADMIN_PASSWORD_HASH on the backend.",
    );
  const { password } = parse(
    z.object({ password: z.string().min(1).max(256) }),
    req.body,
  );
  if (!verifyPassword(password, passwordHash))
    throw new HttpError(401, "Incorrect password.");
  const token = randomBytes(32).toString("hex");
  await req.db.collection("sessions").insertOne({
    _id: hashToken(token),
    expiresAt: new Date(Date.now() + 8 * 3600000),
  });
  res.set("Cache-Control", "no-store").json({ token, expiresIn: 28800 });
});
authRouter.post("/logout", requireAdmin, async (req, res) => {
  await req.db.collection("sessions").deleteOne({ _id: req.sessionId });
  res.sendStatus(204);
});

// A one-time invite creates the admin. The atomic unique _id prevents reuse.
authRouter.post("/setup", rateLimit("setup", 5), async (req, res) => {
  const { token, password } = parse(
    z.object({
      token: z.string().regex(/^[a-f0-9]{64}$/),
      password: z.string().min(12).max(128),
    }),
    req.body,
  );
  if (
    !process.env.BOOTSTRAP_TOKEN_HASH ||
    hashToken(token) !== process.env.BOOTSTRAP_TOKEN_HASH
  )
    throw new HttpError(403, "Invalid setup link.");
  try {
    await req.db.collection("credentials").insertOne({
      _id: "admin",
      passwordHash: hashPassword(password),
      createdAt: new Date(),
    });
  } catch (error) {
    if (error.code === 11000)
      throw new HttpError(
        409,
        "Admin already configured. Sign in with your password.",
      );
    throw error;
  }
  res.status(201).json({ ok: true });
});
