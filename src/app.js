import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { getDatabase } from "./db.js";
import { requireAdmin, rateLimit } from "./middleware/auth.js";
import { accountRouter } from "./routes/account.js";
import { authRouter } from "./routes/auth.js";
import { contentRouter } from "./routes/content.js";
import { crmRouter } from "./routes/crm.js";
import { mediaRouter } from "./routes/media.js";
import { contactSchema, parse } from "./lib/validation.js";
export function createApp({ database = getDatabase } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  const origins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((x) => x.trim());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.get("/api/health", async (req, res) => {
    const db = await database();
    await db.command({ ping: 1 });
    res.json({ status: "ok" });
  });
  app.use("/api", async (req, res, next) => {
    req.db = await database();
    next();
  });
  app.get("/api/content", async (req, res) => {
    const row = await req.db
      .collection("content")
      .findOne({ _id: "portfolio" });
    res.set("Cache-Control", "no-cache").json(row.published);
  });
  app.use("/api/auth", authRouter);
  app.post("/api/contact", rateLimit("contact", 5), async (req, res) => {
    if (req.body.website) return res.status(202).json({ ok: true });
    const { website, ...data } = parse(contactSchema, req.body);
    await req.db.collection("messages").insertOne({
      _id: randomUUID(),
      ...data,
      status: "new",
      createdAt: new Date(),
    });
    res.status(201).json({ ok: true });
  });
  app.use("/api/admin", requireAdmin);
  app.get("/api/admin/session", (req, res) =>
    res.json({ authenticated: true }),
  );
  app.post("/api/admin/logout", async (req, res) => {
    await req.db.collection("sessions").deleteOne({ _id: req.sessionId });
    res.sendStatus(204);
  });
  app.use("/api/admin", contentRouter, crmRouter, mediaRouter, accountRouter);
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use((error, req, res, next) => {
    const status =
      error instanceof multer.MulterError ? 400 : error.status || 503;
    // Log error type only: database connection errors can contain credentials.
    console.error("API error:", error.name, "status:", status);
    res.status(status).json({
      error:
        error instanceof multer.MulterError
          ? "Upload one image, up to 4 MB."
          : status < 500
            ? error.message
            : status === 503
              ? "Service is not ready. Check the backend configuration or contact me by email."
              : "Unable to complete the request.",
    });
  });
  return app;
}
