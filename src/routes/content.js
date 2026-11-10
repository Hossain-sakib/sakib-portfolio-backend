import { Router } from "express";
import { ObjectId } from "mongodb";
import { contentSchema, HttpError, parse } from "../lib/validation.js";
export const contentRouter = Router();
const summary = (row) => ({
  data: row.draft,
  version: row.version,
  updatedAt: row.updatedAt,
  publishedAt: row.publishedAt,
  hasChanges: JSON.stringify(row.draft) !== JSON.stringify(row.published),
});
async function recordRevision(db, data, action) {
  await db
    .collection("revisions")
    .insertOne({ data, action, createdAt: new Date() });
  const old = await db
    .collection("revisions")
    .find()
    .sort({ createdAt: -1 })
    .skip(50)
    .project({ _id: 1 })
    .toArray();
  if (old.length)
    await db
      .collection("revisions")
      .deleteMany({ _id: { $in: old.map((x) => x._id) } });
}
async function update(req, change, action) {
  const version = req.body.version;
  if (!Number.isInteger(version))
    throw new HttpError(400, "A content version is required.");
  const before = await req.db.collection("content").findOneAndUpdate(
    { _id: "portfolio", version },
    {
      $set: { ...change, updatedAt: new Date() },
      $inc: { version: 1 },
    },
    { returnDocument: "before" },
  );
  if (!before)
    throw new HttpError(
      409,
      "Content changed in another tab. Reload before saving.",
    );
  await recordRevision(req.db, before.draft, action);
  return summary({
    ...before,
    ...change,
    version: version + 1,
    updatedAt: new Date(),
  });
}
contentRouter.get("/content", async (req, res) =>
  res.json(
    summary(await req.db.collection("content").findOne({ _id: "portfolio" })),
  ),
);
contentRouter.put("/content", async (req, res) => {
  const data = parse(contentSchema, req.body.data);
  res.json(await update(req, { draft: data }, "Before draft save"));
});
contentRouter.post("/publish", async (req, res) => {
  const row = await req.db.collection("content").findOne({ _id: "portfolio" });
  res.json(
    await update(
      req,
      { published: row.draft, publishedAt: new Date() },
      "Published",
    ),
  );
});
contentRouter.get("/revisions", async (req, res) => {
  const rows = await req.db
    .collection("revisions")
    .find({}, { projection: { data: 0 } })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  res.json(
    rows.map((x) => ({
      id: x._id.toString(),
      action: x.action,
      created_at: x.createdAt,
    })),
  );
});
contentRouter.post("/revisions/:id/restore", async (req, res) => {
  if (!ObjectId.isValid(req.params.id))
    throw new HttpError(404, "Revision not found.");
  const row = await req.db
    .collection("revisions")
    .findOne({ _id: new ObjectId(req.params.id) });
  if (!row) throw new HttpError(404, "Revision not found.");
  res.json(await update(req, { draft: row.data }, "Before restore"));
});
