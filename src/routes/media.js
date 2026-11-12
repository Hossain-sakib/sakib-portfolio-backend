import { Router } from "express";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { HttpError } from "../lib/validation.js";
export const mediaRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
});
function storage() {
  const {
    CLOUDINARY_CLOUD_NAME: cloud_name,
    CLOUDINARY_API_KEY: api_key,
    CLOUDINARY_API_SECRET: api_secret,
  } = process.env;
  if (!cloud_name || !api_key || !api_secret)
    throw new HttpError(
      503,
      "Image storage is not configured. Add Cloudinary credentials to the backend environment.",
    );
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return cloudinary;
}
const view = ({ _id, ...row }) => ({ ...row, id: _id });
mediaRouter.get("/media", async (req, res) =>
  res.json(
    (
      await req.db.collection("media").find().sort({ created_at: -1 }).toArray()
    ).map(view),
  ),
);
mediaRouter.post("/media", upload.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "Choose an image.");

  const client = storage();
  let buffer;
  try {
    const metadata = await sharp(req.file.buffer, {
      limitInputPixels: 40000000,
    }).metadata();
    if (!["jpeg", "png", "webp", "gif", "avif"].includes(metadata.format))
      throw Error();
    buffer = await sharp(req.file.buffer, { limitInputPixels: 40000000 })
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new HttpError(
      400,
      "Use a valid JPEG, PNG, WebP, GIF, or AVIF image up to 4 MB.",
    );
  }
  const result = await new Promise((resolve, reject) =>
    client.uploader
      .upload_stream(
        { folder: "sakib-portfolio", resource_type: "image" },
        (error, result) => (error ? reject(error) : resolve(result)),
      )
      .end(buffer),
  );
  const row = {
    _id: randomUUID(),
    name: req.file.originalname.slice(0, 200),
    url: result.secure_url,
    publicId: result.public_id,
    size: result.bytes,
    mime: "image/webp",
    created_at: new Date(),
  };
  await req.db.collection("media").insertOne(row);
  res.status(201).json(view(row));
});
mediaRouter.delete("/media/:id", async (req, res) => {
  const row = await req.db.collection("media").findOne({ _id: req.params.id });
  if (!row) throw new HttpError(404, "Image not found.");
  const content = await req.db
    .collection("content")
    .findOne({ _id: "portfolio" });
  if (
    JSON.stringify([content.draft, content.published]).includes(row.url) ||
    (row.localPath &&
      JSON.stringify([content.draft, content.published]).includes(
        row.localPath,
      ))
  )
    throw new HttpError(
      409,
      "This image is used in your content. Remove its references and publish before deleting.",
    );
  await storage().uploader.destroy(row.publicId, { invalidate: true });
  await req.db.collection("media").deleteOne({ _id: row._id });
  res.sendStatus(204);
});
