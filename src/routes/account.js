import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../password.js";
import { hashToken, rateLimit } from "../middleware/auth.js";
import { HttpError, parse } from "../lib/validation.js";
export const accountRouter = Router();
accountRouter.put(
  "/password",
  rateLimit("password-change", 5),
  async (req, res) => {
    const { currentPassword, newPassword } = parse(
      z.object({
        currentPassword: z.string().min(1).max(128),
        newPassword: z.string().min(12).max(128),
      }),
      req.body,
    );
    const stored = await req.db
      .collection("credentials")
      .findOne({ _id: "admin" });
    if (!stored || !verifyPassword(currentPassword, stored.passwordHash))
      throw new HttpError(401, "Current password is incorrect.");
    if (currentPassword === newPassword)
      throw new HttpError(400, "Choose a different password.");
    const result = await req.db.collection("credentials").updateOne(
      { _id: "admin", passwordHash: stored.passwordHash },
      {
        $set: {
          passwordHash: hashPassword(newPassword),
          updatedAt: new Date(),
        },
      },
    );
    if (!result.modifiedCount)
      throw new HttpError(
        409,
        "The password changed in another session. Sign in again.",
      );
    await req.db.collection("sessions").deleteMany({});
    const token = randomBytes(32).toString("hex");
    await req.db.collection("sessions").insertOne({
      _id: hashToken(token),
      expiresAt: new Date(Date.now() + 8 * 3600000),
    });
    res.json({ token });
  },
);
