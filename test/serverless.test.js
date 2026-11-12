import { test } from "node:test";
import assert from "node:assert/strict";
import serverless from "serverless-http";
import { createApp } from "../src/app.js";

test("Netlify JSON requests are parsed before contact validation and storage", async () => {
  const records = [];
  const database = {
    collection: (name) => ({
      findOneAndUpdate: async () => ({ count: 1 }),
      insertOne: async (row) => records.push({ name, row }),
    }),
  };
  const handler = serverless(createApp({ database: async () => database }));
  const input = {
    name: "Integration test",
    email: "verification@example.test",
    message: "Verify the actual Netlify adapter parses this JSON request.",
    website: "",
  };
  for (const encoded of [false, true]) {
    const body = JSON.stringify(input);
    const response = await handler(
      {
        httpMethod: "POST",
        path: "/api/contact",
        headers: { "content-type": "application/json" },
        body: encoded ? Buffer.from(body).toString("base64") : body,
        isBase64Encoded: encoded,
        requestContext: { identity: { sourceIp: "127.0.0.1" } },
      },
      {},
    );
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(records.at(-1).name, "messages");
    assert.equal(records.at(-1).row.message, input.message);
  }
});

test("password changes rotate the session and invalidate the previous password", async () => {
  const { hashPassword, verifyPassword } = await import("../src/password.js");
  const { hashToken } = await import("../src/middleware/auth.js");
  const oldPassword = "Original strong test password";
  const newPassword = "Replacement strong test password";
  const oldToken = "a".repeat(64);
  let passwordHash = hashPassword(oldPassword);
  const sessions = new Map([
    [hashToken(oldToken), { expiresAt: new Date(Date.now() + 60000) }],
  ]);
  const db = {
    collection(name) {
      if (name === "rateLimits")
        return { findOneAndUpdate: async () => ({ count: 1 }) };
      if (name === "sessions")
        return {
          findOne: async ({ _id }) => sessions.get(_id),
          deleteMany: async () => sessions.clear(),
          insertOne: async (row) => sessions.set(row._id, row),
        };
      if (name === "credentials")
        return {
          findOne: async () => ({ _id: "admin", passwordHash }),
          updateOne: async (query, update) => {
            assert.equal(query.passwordHash, passwordHash);
            passwordHash = update.$set.passwordHash;
            return { modifiedCount: 1 };
          },
        };
      throw Error("Unexpected collection");
    },
  };
  const handler = serverless(createApp({ database: async () => db }));
  const request = (method, path, token, body) =>
    handler(
      {
        httpMethod: method,
        path,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : "",
        requestContext: { identity: { sourceIp: "127.0.0.1" } },
      },
      {},
    );
  const rejected = await request("PUT", "/api/admin/password", oldToken, {
    currentPassword: "incorrect",
    newPassword,
  });
  assert.equal(rejected.statusCode, 401);
  assert.equal(sessions.size, 1);
  const changed = await request("PUT", "/api/admin/password", oldToken, {
    currentPassword: oldPassword,
    newPassword,
  });
  assert.equal(changed.statusCode, 200, changed.body);
  const token = JSON.parse(changed.body).token;
  assert.equal(verifyPassword(newPassword, passwordHash), true);
  assert.equal(verifyPassword(oldPassword, passwordHash), false);
  assert.equal(sessions.size, 1);
  assert.equal(
    (await request("GET", "/api/admin/session", oldToken)).statusCode,
    401,
  );
  assert.equal(
    (await request("GET", "/api/admin/session", token)).statusCode,
    200,
  );
});
