import media from "./media-seed.json" with { type: "json" };

// Each catalog is seeded once, so deleting an unused asset stays permanent.
export async function seedMedia(db) {
  const catalogs = [
    [
      "curated-media-v1",
      media.filter((item) => !item.localPath?.startsWith("/previews/")),
    ],
    [
      "project-covers-v1",
      media.filter((item) => item.localPath?.startsWith("/previews/")),
    ],
  ];
  for (const [id, items] of catalogs) {
    if (
      !items.length ||
      (await db.collection("settings").findOne({ _id: id, complete: true }))
    )
      continue;
    await db.collection("media").bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { _id: item._id },
          update: {
            $setOnInsert: {
              ...item,
              localPath: item.localPath || "/images/" + item.name,
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
}
