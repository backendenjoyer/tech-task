import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const cleanupDeduplications = functions
  .runWith({ memory: "256MB", timeoutSeconds: 60 })
  .pubsub.schedule("every 5 minutes")
  .onRun(async () => {
    try {
      const db = admin.firestore();

      const threshold = Date.now() - 30 * 1000;
      const snapshot = await db
        .collection("deduplications")
        .where("timestamp", "<", threshold)
        .get();

      const batch = db.batch();
      snapshot.forEach((doc) => batch.delete(doc.ref));
      
      await batch.commit();
      console.log(`Deleted ${snapshot.size} expired deduplication records`);
    } catch (err: any) {
      console.error("Cleanup error:", err);
    }
  });
