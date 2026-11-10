import { MongoClient } from "mongodb";
import { DEFAULTS, LINKS } from "./defaults.js";
let connection;

// One cached connection pool per function instance; no reconnect per request.
export async function getDatabase() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  connection ??= connect().catch((error) => {
    connection = undefined;
    throw error;
  });
  return connection;
}
async function connect() {
  const client = new MongoClient(process.env.MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "sakib_portfolio");
  await Promise.all([
    db
      .collection("sessions")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection("rateLimits")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("messages").createIndex({ createdAt: -1 }),
    db.collection("revisions").createIndex({ createdAt: -1 }),
    db.collection("tasks").createIndex({ dueDate: 1 }),
  ]);
  const content = { ...DEFAULTS, links: LINKS };
  await db.collection("content").updateOne(
    { _id: "portfolio" },
    {
      $setOnInsert: {
        draft: content,
        published: content,
        version: 1,
        updatedAt: new Date(),
        publishedAt: null,
      },
    },
    { upsert: true },
  );
  return db;
}
