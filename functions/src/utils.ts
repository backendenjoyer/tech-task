import * as admin from "firebase-admin";
import { CloudTasksClient, protos } from "@google-cloud/tasks";
import { createHash } from "crypto";
import * as functions from 'firebase-functions';

interface DeduplicationResult {
  isDuplicate: boolean;
  signature: string;
}

export async function checkDeduplication(
  req: functions.https.Request,
  fileSize: number,
  user: admin.auth.DecodedIdToken
): Promise<DeduplicationResult> {
  try {
    const signature = `${user.uid}_${fileSize}_${Date.now()}`; // Example signature
    const docRef = admin.firestore().collection('deduplications').doc(signature);

    const doc = await docRef.get();
    if (doc.exists) {
      const data = doc.data();
      return {
        isDuplicate: true,
        signature: data?.recordingId || signature,
      };
    }

    return {
      isDuplicate: false,
      signature,
    };
  } catch (err) {
    console.error('checkDeduplication error:', err);
    throw new Error(`Deduplication check failed: ${err.message}`);
  }
}
export async function createProcessingTask(
  filePath: string,
  recordingId: string,
  userId: string,
  fileHash: string
): Promise<void> {
  const client = new CloudTasksClient();
  const project = process.env.GCLOUD_PROJECT || 'test-g-cloud';
  const location = "us-central1";
  const queue = "audio-processing-queue";

  const task: protos.google.cloud.tasks.v2.ITask = {
    httpRequest: {
      httpMethod: "POST" as const,
      url: `https://${location}-${project}.cloudfunctions.net/processAudio`,
      body: Buffer.from(
        JSON.stringify({ filePath, recordingId, userId, fileHash })
      ).toString("base64"),
      headers: { "Content-Type": "application/json" },
      oidcToken: {
        serviceAccountEmail: `${project}@appspot.gserviceaccount.com`,
      },
    },
  };

  const parent = client.queuePath(project!, location, queue);
  try {
    const response = await client.createTask({ parent, task });
    console.log(`Created task: ${response[0].name}`);
  } catch (err) {
    console.error("Failed to create task:", err);
    throw err;
  }
}

export async function computeFileHash(fileStream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const hashStream = createHash("md5");
    fileStream
      .on("data", (data: Buffer) => hashStream.update(data))
      .on("end", () => {
        const hash = hashStream.digest("hex");
        resolve(hash);
      })
      .on("error", reject);
  });
}

export function validateFile(mimeType: string): boolean {
  return ["audio/mpeg", "audio/wav", "audio/mp3"].includes(mimeType);
}