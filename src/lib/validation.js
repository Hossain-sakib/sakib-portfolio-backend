import { z } from "zod";
import { DEFAULTS } from "../defaults.js";
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const text = z.string().max(20000);
const fieldSchema = (value) =>
  Array.isArray(value)
    ? z.array(text).max(500)
    : typeof value === "number"
      ? z.number().finite().nonnegative()
      : text;
const emptyCollectionSamples = {
  linkedinPosts: { text: "", date: "", url: "", embed: "", img: "" },
};
const collections = Object.fromEntries(
  Object.entries(DEFAULTS)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, items]) => [
      key,
      z
        .array(
          z
            .object({
              ...Object.fromEntries(
                Object.entries(items[0] || emptyCollectionSamples[key] || {})
                  .filter(([field]) => field !== "id")
                  .map(([field, value]) => [field, fieldSchema(value)]),
              ),
              id: z.union([z.string().max(100), z.number()]).optional(),
              ...(key === "gallery"
                ? { category: text.optional(), description: text.optional() }
                : {}),
              shots: z.array(text).max(30).optional(),
              purpose: text.optional(),
              previewPaths: z.array(z.string().max(300)).max(3).optional(),
            })
            .strict(),
        )
        .max(500),
    ]),
);
export const contentSchema = z
  .object({
    profile: z
      .object({
        ...Object.fromEntries(
          Object.keys(DEFAULTS.profile).map((key) => [key, text]),
        ),
        name: text.min(1),
        location: text.optional(),
        ctaImage: text.optional(),
        heroTitle: text.optional(),
        heroAccent: text.optional(),
      })
      .strict(),
    seo: z
      .object({ title: text, description: text, image: text })
      .strict()
      .optional(),
    links: z
      .object({
        email: z.string().email().max(254),
        phone: text,
        linkedin: text,
        github: text,
        facebook: text,
        fiverr: text,
        upwork: text,
        freelancer: text,
      })
      .strict(),
    ...collections,
  })
  .strict()
  .superRefine((data, ctx) => {
    function check(value, path = []) {
      if (
        typeof value === "string" &&
        /^\s*(javascript|vbscript|data|file):/i.test(value)
      ) {
        ctx.addIssue({
          code: "custom",
          path,
          message: "Executable URLs are not allowed",
        });
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value))
          check(child, [...path, key]);
      }
    }
    check(data);
  });
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(
      400,
      `${issue.path.join(".") || "Input"}: ${issue.message}`,
    );
  }
  return result.data;
}
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(10).max(10000),
  website: z.string().max(200).optional(),
});
export const leadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().max(254),
  company: z.string().max(200).default(""),
  stage: z.enum(["new", "qualified", "proposal", "won", "lost"]).default("new"),
  value: z.number().nonnegative().max(1000000000).default(0),
  currency: z.enum(["USD", "BDT", "EUR", "GBP"]).default("USD"),
  notes: z.string().max(20000).default(""),
  followUp: z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
    .default(""),
});
export const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).default(""),
  status: z.enum(["todo", "doing", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
    .default(""),
  leadId: z.string().uuid().or(z.literal("")).default(""),
});
