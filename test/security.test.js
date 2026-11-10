import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import {
  contentSchema,
  contactSchema,
  leadSchema,
  taskSchema,
} from "../src/lib/validation.js";
import { DEFAULTS, LINKS } from "../src/defaults.js";
import { hashPassword, verifyPassword } from "../src/password.js";

test("password hashes use independent salts and reject incorrect passwords", () => {
  const password = "A sufficiently long test password";
  const first = hashPassword(password),
    second = hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(verifyPassword(password, first), true);
  assert.equal(verifyPassword("wrong", first), false);
  assert.equal(verifyPassword(password, "invalid"), false);
});
test("portfolio validation accepts the supplied content and rejects executable image URLs and invalid collections", () => {
  const content = { ...DEFAULTS, links: LINKS };
  assert.equal(contentSchema.safeParse(content).success, true);
  assert.equal(
    contentSchema.safeParse({
      ...content,
      profile: { ...content.profile, photo: "javascript:alert(1)" },
    }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({
      ...content,
      works: [{ ...content.works[0], features: "invalid" }],
    }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({ ...content, works: { $where: "unsafe" } })
      .success,
    false,
  );
});
test("contact, CRM, and tasks reject malformed input", () => {
  assert.equal(
    contactSchema.safeParse({ name: "A", email: "bad", message: "short" })
      .success,
    false,
  );
  assert.equal(
    leadSchema.safeParse({ name: "A", email: "a@example.com", value: -1 })
      .success,
    false,
  );
  assert.equal(
    taskSchema.safeParse({ title: "Follow up", status: "injected" }).success,
    false,
  );
  assert.equal(
    taskSchema.safeParse({ title: "Follow up", dueDate: "not a date" }).success,
    false,
  );
});
test("every admin resource rejects unauthenticated mutations", async () => {
  const db = {
    collection() {
      return { findOne: async () => null };
    },
  };
  const server = createApp({ database: async () => db }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  try {
    for (const [method, path] of [
      ["GET", "content"],
      ["PUT", "content"],
      ["POST", "publish"],
      ["GET", "messages"],
      ["DELETE", "messages/x"],
      ["PATCH", "messages/x"],
      ["POST", "messages/x/lead"],
      ["GET", "media"],
      ["POST", "media"],
      ["DELETE", "media/x"],
      ["POST", "leads"],
      ["PUT", "leads/x"],
      ["DELETE", "leads/x"],
      ["POST", "tasks"],
      ["GET", "revisions"],
      ["POST", "revisions/x/restore"],
    ]) {
      const r = await fetch(origin + "/api/admin/" + path, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method !== "GET" ? { body: "{}" } : {}),
      });
      assert.equal(r.status, 401, `${method} ${path}`);
    }
  } finally {
    server.close();
  }
});
test("security headers are present and malformed JSON never reaches storage", async () => {
  let calls = 0;
  const server = createApp({
    database: async () => {
      calls++;
      return {};
    },
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const r = await fetch(
      "http://127.0.0.1:" + server.address().port + "/api/contact",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      },
    );
    assert.equal(r.status, 400);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(calls, 0);
  } finally {
    server.close();
  }
});
