import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { OpenAI } from "openai";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink } from "fs/promises";
import { ApiResponse, ProcessRequestBody, RecordingsDocument } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "test-key" });

// Check transcription cache
async function checkTranscriptionCache(fileHash: string): Promise<string | null> {
  const db = admin.firestore();
  const cacheDoc = await db.collection("transcriptions").doc(fileHash).get();
  if (cacheDoc.exists) {
    return cacheDoc.data()?.transcript as string;
  }
  return null;
}

// Transcribe audio file
async function transcribeAudio(filePath: string): Promise<string> {
  if (process.env.FUNCTIONS_EMULATOR) {
    console.log("Mocking transcription for:", filePath);
    return "Mocked transcription text";
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(filePath);
  const tempPath = join(tmpdir(), `${filePath.replace(/\//g, "_")}.tmp`);
  try {
    const [buffer] = await file.download();
    await writeFile(tempPath, buffer);
    const transcription = await openai.audio.transcriptions.create({
      file: new File([buffer], filePath, { type: "audio/mpeg" }),
      model: "whisper-1",
      language: "en",
    });
    return transcription.text;
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

// Generate medical recommendations
async function getRecommendations(transcript: string): Promise<string> {
  if (process.env.FUNCTIONS_EMULATOR) {
    console.log("Mocking recommendations for transcript:", transcript);
    return "Mocked medical recommendations";
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "You are a medical assistant. Provide a concise report with symptoms, diagnosis, tests, treatment, and follow-up.",
      },
      { role: "user", content: transcript },
    ],
  });

  return response.choices[0].message.content as string;
}

// Process audio handler (exported for use in api.ts)
export const processAudioHandler = async (
  req: functions.https.Request,
  res: functions.Response<ApiResponse>
): Promise<void> => {
  console.log("processAudio: Request headers:", req.headers);
  console.log("processAudio: Request body:", req.body);

  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed" });
    return;
  }

  const token = req.headers["authorization"]?.split("Bearer ")[1];
  if (!token && process.env.FUNCTIONS_EMULATOR !== "true") {
    res.status(401).json({ success: false, message: "Unauthorized: Missing token" });
    return;
  }

  if (token) {
    try {
      await admin.auth().verifyIdToken(token, true);
    } catch (error) {
      console.error("processAudio: Token verification error:", error);
      res.status(401).json({ success: false, message: "Unauthorized: Invalid token" });
      return;
    }
  }

  const body = req.body as Partial<ProcessRequestBody>;
  const { filePath, recordingId, userId, fileHash } = body;

  const missingFields: string[] = [];
  if (!filePath) missingFields.push("filePath");
  if (!recordingId) missingFields.push("recordingId");
  if (!userId) missingFields.push("userId");
  if (!fileHash) missingFields.push("fileHash");
  if (missingFields.length > 0) {
    console.log("processAudio: Missing fields:", missingFields);
    res.status(400).json({
      success: false,
      message: `Missing fields: ${missingFields.join(", ")}`,
    });
    return;
  }

  const db = admin.firestore();

  try {
    const docRef = db.collection("recordings").doc(recordingId);
    const doc = await docRef.get();
    const docData = doc.exists ? (doc.data() as RecordingsDocument) : undefined;

    if (
      !doc.exists ||
      docData?.filePath !== filePath ||
      docData?.userId !== userId ||
      docData?.status !== "uploaded"
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid or already processed recording",
      });
      return;
    }

    await docRef.update({
      status: "processing",
      processingStartedAt: new Date(),
    });

    let transcript = await checkTranscriptionCache(fileHash);
    if (!transcript) {
      transcript = await transcribeAudio(filePath);
      await db.collection("transcriptions").doc(fileHash).set({
        transcript,
        createdAt: new Date(),
      });
    }

    const recommendations = await getRecommendations(transcript);

    await docRef.update({
      transcript,
      recommendations,
      status: "processed",
      processedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Processing completed",
      recordingId,
      transcript,
      recommendations,
    });
  } catch (error: any) {
    console.error("Processing error:", error);
    const errorMessage = error.message || "Unknown error";
    await db.collection("recordings").doc(recordingId).update({
      status: "failed",
      error: errorMessage,
      failedAt: new Date(),
    });
    res.status(500).json({
      success: false,
      message: `Processing failed: ${errorMessage}`,
    });
  }
};

// Process audio Cloud Function
export const processAudio = functions
  .runWith({ memory: "2GB", timeoutSeconds: 300 })
  .https.onRequest(processAudioHandler);