import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Busboy from "busboy";
import { Readable } from "stream";

import {
  checkDeduplication,
  createProcessingTask,
  computeFileHash,
  validateFile,
} from "./utils";

interface FileData {
  path: string;
  mimeType: string;
  size: number;
  hash?: string;
  recordingId?: string;
}

interface MockResponse {
  status: (code: number) => { json: (data: any) => void };
}

export const uploadAudio = functions
  .runWith({ memory: "512MB", timeoutSeconds: 120 })
  .https.onRequest(async (req: functions.https.Request, res: functions.Response) => {
    let responseSent = false;
    const sendResponse = (status: number, body: any) => {
      if (!responseSent) {
        responseSent = true;
        res.status(status).json(body);
      }
    };

    if (req.method !== "POST") {
      sendResponse(405, { success: false, message: "Method not allowed" });
      return;
    }

    console.log("Request headers:", req.headers);

    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) {
      sendResponse(401, { success: false, message: "Unauthorized: Missing token" });
      return;
    }

    let user: admin.auth.DecodedIdToken;
    try {
      user = await admin.auth().verifyIdToken(token);
    } catch (err) {
      console.error("Token verification error:", err);
      sendResponse(401, { success: false, message: "Unauthorized: Invalid token" });
      return;
    }

    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 100 * 1024 * 1024 } });
    let fileBuffer: Buffer | null = null;
    let fileData: FileData = { path: "", mimeType: "", size: 0 };
    let fileName: string | null = null;

    busboy.on("file", (fieldname, file, info) => {
      console.log(`Busboy: File ${fieldname} received, filename: ${info.filename}, mimetype: ${info.mimeType}`);
      if (fieldname !== "audio") {
        file.resume();
        return;
      }

      fileData.mimeType = info.mimeType;
      fileName = info.filename || "audio";
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      file.on("data", (data: Buffer) => {
        totalBytes += data.length;
        console.log(`Busboy: Received ${data.length} bytes, total: ${totalBytes}`);
        chunks.push(data);
      });

      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
        fileData.size = fileBuffer.length;
        console.log(`Busboy: File ${fieldname} fully received, size: ${fileData.size}`);
      });

      file.on("limit", () => {
        console.error("Busboy: File size limit exceeded");
        file.resume();
        sendResponse(400, { success: false, message: "File size exceeds 100MB limit" });
      });

      file.on("error", (err) => {
        console.error("Busboy: File stream error:", err);
        sendResponse(500, { success: false, message: `File stream error: ${err.message}` });
      });
    });

    busboy.on("finish", async () => {
      console.log("Busboy: Parsing finished");
      try {
        if (!fileBuffer || !fileName) {
          sendResponse(400, { success: false, message: "No file uploaded" });
          return;
        }

        console.log(`Validating file with MIME type: ${fileData.mimeType}, filename: ${fileName}`);
        if (!validateFile(fileData.mimeType)) {
          sendResponse(400, { success: false, message: "Unsupported file type" });
          return;
        }

        const fileNameSafe = `${Date.now()}-${fileName}`;
        const filePath = `audio/${user.uid}/${fileNameSafe}`;
        const bucket = admin.storage().bucket();

        const readStream = Readable.from(fileBuffer);
        const writeStream = bucket.file(filePath).createWriteStream({
          metadata: { contentType: fileData.mimeType },
        });

        const streamTimeout = setTimeout(() => {
          readStream.destroy(new Error("Stream timeout: Upload to Firebase Storage took too long"));
        }, 30000);

        console.log("Starting file upload to Firebase Storage...");
        readStream.pipe(writeStream);

        await new Promise((resolve, reject) => {
          writeStream.on("finish", () => {
            clearTimeout(streamTimeout);
            console.log("Firebase Storage upload completed.");
            resolve(null);
          });
          writeStream.on("error", (err) => {
            clearTimeout(streamTimeout);
            console.error("Write stream error:", err);
            reject(err);
          });
          readStream.on("error", (err) => {
            clearTimeout(streamTimeout);
            console.error("Read stream error:", err);
            reject(err);
          });
        });

        console.log("File write finished, fetching metadata...");
        const [metadata] = await bucket.file(filePath).getMetadata();
        fileData.size = Number(metadata.size);
        fileData.path = filePath;

        console.log("Computing file hash...");
        const tempStream = bucket.file(filePath).createReadStream();
        fileData.hash = await computeFileHash(tempStream);

        if (!fileData.hash) {
          throw new Error("Failed to compute file hash");
        }

        console.log("Checking deduplication...");
        const { isDuplicate, signature } = await checkDeduplication(req, fileData.size, user);
        if (isDuplicate) {
          sendResponse(200, {
            success: true,
            message: "Duplicate request",
            recordingId: signature,
            isDuplicate: true,
          });
          return;
        }

        const docId = filePath.replace(/\//g, "_");
        const docRef = admin.firestore().collection("recordings").doc(docId);
        await docRef.set({
          filePath,
          filename: fileNameSafe,
          mimeType: fileData.mimeType,
          size: fileData.size,
          fileHash: fileData.hash,
          status: "uploaded",
          userId: user.uid,
          createdAt: new Date(),
        });

        await admin.firestore().collection("deduplications").doc(signature).set({
          timestamp: Date.now(),
          recordingId: docId,
          userId: user.uid,
        });

        if (process.env.FUNCTIONS_EMULATOR) {
          console.log("Emulating task creation for:", filePath);
          console.log("Mock request Authorization header:", `Bearer ${token}`);
          console.log("Mock request body:", {
            filePath,
            recordingId: docId,
            userId: user.uid,
            fileHash: fileData.hash,
          });
          const { processAudio } = await import("./process");
          const mockReq: Partial<functions.https.Request> = {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
            },
            body: JSON.parse(JSON.stringify({
              filePath,
              recordingId: docId,
              userId: user.uid,
              fileHash: fileData.hash,
            })),
          };
          const mockRes: MockResponse = {
            status: (code: number) => ({
              json: (data: any) => console.log(`Mock processAudio response: ${code}`, data),
            }),
          };
          await processAudio(mockReq as functions.https.Request, mockRes as any);
        } else {
          await createProcessingTask(filePath, docId, user.uid, fileData.hash!);
        }

        fileData.recordingId = docId;
        sendResponse(200, {
          success: true,
          message: "File uploaded successfully",
          recordingId: fileData.recordingId,
          filePath: fileData.path,
        });
      } catch (err: any) {
        console.error("Upload error:", err);
        sendResponse(500, { success: false, message: `Upload failed: ${err.message}` });
      }
    });

    busboy.on("error", (err) => {
      console.error("Busboy error:", err);
      sendResponse(500, { success: false, message: `Busboy error: ${err}` });
    });

    req.on("error", (err) => {
      console.error("Request stream error:", err);
      sendResponse(500, { success: false, message: `Request stream error: ${err.message}` });
    });

    console.log("Starting Busboy parsing...");
    if (req.rawBody) {
      busboy.end(req.rawBody);
    } else {
      console.error("req.rawBody is not available");
      sendResponse(500, { success: false, message: "Internal server error" });
    }
  });