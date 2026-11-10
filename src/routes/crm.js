import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, parse, leadSchema, taskSchema } from "../lib/validation.js";
export const crmRouter = Router();
crmRouter.get("/messages", async (req, res) => {
  const rows = await req.db
    .collection("messages")
    .find()
    .sort({ createdAt: -1 })
    .limit(1000)
    .toArray();
  res.json(
    rows.map(({ _id, createdAt, ...row }) => ({
      ...row,
      id: _id,
      created_at: createdAt,
    })),
  );
});
crmRouter.patch("/messages/:id", async (req, res) => {
  const { status } = parse(
    z.object({ status: z.enum(["new", "read", "archived"]) }),
    req.body,
  );
  const result = await req.db
    .collection("messages")
    .updateOne({ _id: req.params.id }, { $set: { status } });
  if (!result.matchedCount) throw new HttpError(404, "Message not found.");
  res.json({ ok: true });
});
crmRouter.delete("/messages/:id", async (req, res) => {
  await req.db.collection("messages").deleteOne({ _id: req.params.id });
  res.sendStatus(204);
});
crmRouter.post("/messages/:id/lead", async (req, res) => {
  const message = await req.db
    .collection("messages")
    .findOne({ _id: req.params.id });
  if (!message) throw new HttpError(404, "Message not found.");
  const existing = await req.db
    .collection("leads")
    .findOne({ messageId: message._id });
  if (existing) return res.json(existing);
  const lead = {
    _id: randomUUID(),
    ...parse(leadSchema, {
      name: message.name,
      email: message.email,
      notes: message.message,
    }),
    messageId: message._id,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  };
  await req.db.collection("leads").insertOne(lead);
  res.status(201).json(lead);
});
// The two small resources use the same create/update/delete flow.
for (const [resource, schema] of [
  ["leads", leadSchema],
  ["tasks", taskSchema],
]) {
  crmRouter.get("/" + resource, async (req, res) =>
    res.json(
      await req.db
        .collection(resource)
        .find()
        .sort({ createdAt: -1 })
        .limit(1000)
        .toArray(),
    ),
  );
  crmRouter.post("/" + resource, async (req, res) => {
    const data = parse(schema, req.body);
    if (
      resource === "tasks" &&
      data.leadId &&
      !(await req.db.collection("leads").findOne({ _id: data.leadId }))
    )
      throw new HttpError(400, "Choose an existing lead.");
    const row = {
      _id: randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };
    await req.db.collection(resource).insertOne(row);
    res.status(201).json(row);
  });
  crmRouter.put("/" + resource + "/:id", async (req, res) => {
    const data = parse(schema, req.body.data),
      version = req.body.version;
    if (!Number.isInteger(version))
      throw new HttpError(400, "Version is required.");
    if (
      resource === "tasks" &&
      data.leadId &&
      !(await req.db.collection("leads").findOne({ _id: data.leadId }))
    )
      throw new HttpError(400, "Choose an existing lead.");
    const result = await req.db
      .collection(resource)
      .findOneAndUpdate(
        { _id: req.params.id, version },
        { $set: { ...data, updatedAt: new Date() }, $inc: { version: 1 } },
        { returnDocument: "after" },
      );
    if (!result)
      throw new HttpError(409, "This record changed. Refresh and try again.");
    res.json(result);
  });
  crmRouter.delete("/" + resource + "/:id", async (req, res) => {
    if (resource === "leads")
      await req.db
        .collection("tasks")
        .updateMany(
          { leadId: req.params.id },
          { $set: { leadId: "" }, $inc: { version: 1 } },
        );
    await req.db.collection(resource).deleteOne({ _id: req.params.id });
    res.sendStatus(204);
  });
}
