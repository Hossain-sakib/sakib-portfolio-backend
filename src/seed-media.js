import media from "./media-seed.json" with { type: "json" };
// Seed the curated library once; later deletions must stay deleted.
export async function seedMedia(db) {
  const id = "curated-media-v1";
  if (await db.collection("settings").findOne({ _id: id, complete: true }))
    return;
  await db
    .collection("media")
    .bulkWrite(
      media.map((item) => ({
        updateOne: {
          filter: { _id: item._id },
          update: {
            $setOnInsert: {
              ...item,
              localPath: "/images/" + item.name,
              created_at: new Date(item.created_at),
            },
          },
          upsert: true,
        },
      })),
    );
  await db
    .collection("settings")
    .updateOne({ _id: id }, { $set: { complete: true } }, { upsert: true });
}
