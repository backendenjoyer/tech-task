import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
const { FieldValue } = require('firebase-admin/firestore');
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import Busboy from "busboy";
import { Readable, Writable } from "stream";
import { ApiResponse } from "./types";
import { processAudioHandler } from "./process";
import { computeFileHash, validateFile } from "./utils"; // Import updated utils

// Mock Utility Functions (replace with actual utils.ts)
async function checkDeduplication(
  req: Request,
  fileSize: number,
  user: admin.auth.DecodedIdToken
): Promise<{ isDuplicate: boolean; signature: string }> {
  const signature = `mock_${fileSize}_${user.uid}_${Date.now()}`;
  return { isDuplicate: false, signature };
}

async function createProcessingTask(
  filePath: string,
  recordingId: string,
  userId: string,
  fileHash: string
): Promise<void> {
  console.log("Mock createProcessingTask:", { filePath, recordingId, userId, fileHash });
}

// Extend Express Request to include user and rawBody
interface AuthRequest extends Request {
  user?: admin.auth.DecodedIdToken;
  rawBody: Buffer;
}

// Initialize Express app
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Authentication middleware
app.use(
  async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token && process.env.FUNCTIONS_EMULATOR !== "true") {
      res
        .status(401)
        .json({ success: false, message: "Unauthorized: Missing token" });
      return;
    }
    try {
      if (token) {
        req.user = await admin.auth().verifyIdToken(token);
      }
      next();
    } catch (err) {
      res
        .status(401)
        .json({ success: false, message: "Unauthorized: Invalid token" });
    }
  }
);

// GET /recordings: List user recordings
app.get(
  "/recordings",
  async (req: AuthRequest, res: Response<ApiResponse>): Promise<void> => {
    try {
      const db = admin.firestore();
      const snapshot = await db
        .collection("recordings")
        .where("userId", "==", req.user!.uid)
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();
      const recordings = snapshot.docs.map((doc) => ({
        recordingId: doc.id,
        ...doc.data(),
      }));
      res.json({ success: true, recordings, count: recordings.length });
    } catch (err: any) {
      console.error("Error fetching recordings:", err);
      res.status(500).json({
        success: false,
        message: `Failed to fetch recordings: ${err.message}`,
      });
    }
  }
);

// GET /recordings/:id: Get a specific recording
app.get(
  "/recordings/:id",
  async (req: AuthRequest, res: Response<ApiResponse>): Promise<void> => {
    try {
      const db = admin.firestore();
      const doc = await db.collection("recordings").doc(req.params.id).get();
      if (!doc.exists || doc.data()?.userId !== req.user!.uid) {
        res.status(404).json({
          success: false,
          message: "Recording not found or unauthorized",
        });
        return;
      }
      res.json({
        success: true,
        recording: { recordingId: doc.id, ...doc.data() },
      });
    } catch (err: any) {
      console.error("Error fetching recording:", err);
      res.status(500).json({
        success: false,
        message: `Failed to fetch recording: ${err.message}`,
      });
    }
  }
);

// DELETE /recordings/:id: Delete a recording
app.delete(
  "/recordings/:id",
  async (req: AuthRequest, res: Response<ApiResponse>): Promise<void> => {
    try {
      const db = admin.firestore();
      const bucket = admin.storage().bucket();
      const docRef = db.collection("recordings").doc(req.params.id);
      const doc = await docRef.get();
      if (!doc.exists || doc.data()?.userId !== req.user!.uid) {
        res.status(404).json({
          success: false,
          message: "Recording not found or unauthorized",
        });
        return;
      }
      await bucket.file(doc.data()?.filePath).delete();
      await docRef.delete();
      res.json({
        success: true,
        message: "Recording deleted",
        recordingId: req.params.id,
      });
    } catch (err: any) {
      console.error("Error deleting recording:", err);
      res.status(500).json({
        success: false,
        message: `Failed to delete recording: ${err.message}`,
      });
    }
  }
);

// DELETE /deleteAllRecordings: Delete all user recordings
app.delete(
  "/deleteAllRecordings",
  async (req: AuthRequest, res: Response<ApiResponse>): Promise<void> => {
    try {
      const db = admin.firestore();
      const bucket = admin.storage().bucket();
      const snapshot = await db
        .collection("recordings")
        .where("userId", "==", req.user!.uid)
        .get();
      const batch = db.batch();
      const deletePromises: Promise<void>[] = [];
      snapshot.forEach((doc) => {
        batch.delete(doc.ref);
        deletePromises.push(bucket.file(doc.data().filePath).delete().catch(() => Promise.resolve()) as Promise<void>);
      });
      await Promise.all([batch.commit(), ...deletePromises]);
      res.json({
        success: true,
        message: "All recordings deleted",
        count: snapshot.size,
      });
    } catch (err: any) {
      console.error("Error deleting all recordings:", err);
      res.status(500).json({
        success: false,
        message: `Failed to delete all recordings: ${err.message}`,
      });
    }
  }
);

// GET /test: Health check endpoint
app.get("/test", (req: AuthRequest, res: Response): void => {
  res.status(200).send("API is running");
});

// POST /uploadAudio: Upload audio file
app.post(
  "/uploadAudio",
  async (req: AuthRequest, res: Response<ApiResponse>): Promise<void> => {
    let responseSent = false;
    const sendResponse = (status: number, body: ApiResponse) => {
      if (!responseSent) {
        responseSent = true;
        res.status(status).json(body);
      }
    };

    if (!req.user) {
      sendResponse(401, { success: false, message: "Unauthorized: Missing user" });
      return;
    }

    const busboy = Busboy({ headers: req.headers, limits: { fileSize: 100 * 1024 * 1024 } });
    let fileBuffer: Buffer | null = null;
    let fileData: { path: string; mimeType: string; size: number; hash?: string; recordingId?: string } = {
      path: "",
      mimeType: "",
      size: 0,
    };
    let fileName: string | null = null;

    busboy.on("file", (fieldname, file, info) => {
      if (fieldname !== "audio") {
        file.resume();
        return;
      }
      fileData.mimeType = info.mimeType;
      fileName = info.filename || "audio";
      const chunks: Buffer[] = [];

      file.on("data", (data: Buffer) => {
        chunks.push(data);
      });

      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
        fileData.size = fileBuffer.length;
      });

      file.on("limit", () => {
        file.resume();
        sendResponse(400, { success: false, message: "File size exceeds 100MB limit" });
      });
    });

    busboy.on("finish", async () => {
      try {
        if (!fileBuffer || !fileName) {
          sendResponse(400, { success: false, message: "No file uploaded" });
          return;
        }

        if (!validateFile(fileData.mimeType)) {
          sendResponse(400, { success: false, message: "Unsupported file type" });
          return;
        }

        const fileNameSafe = `${Date.now()}-${fileName}`;
        const filePath = `audio/${req.user!.uid}/${fileNameSafe}`;
        const bucket = admin.storage().bucket();

        const readStream = Readable.from(fileBuffer);
        const writeStream = bucket.file(filePath).createWriteStream({
          metadata: { contentType: fileData.mimeType },
        });

        readStream.pipe(writeStream);
        await new Promise((resolve, reject) => {
          writeStream.on("finish", resolve);
          writeStream.on("error", reject);
          readStream.on("error", reject);
        });

        const [metadata] = await bucket.file(filePath).getMetadata();
        fileData.size = Number(metadata.size);
        fileData.path = filePath;

        fileData.hash = await computeFileHash(Readable.from(fileBuffer));

        if (!fileData.hash) {
          throw new Error("Failed to compute file hash");
        }

        const { isDuplicate, signature } = await checkDeduplication(req, fileData.size, req.user!);
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
          userId: req.user!.uid,
          createdAt: new Date(),
        });

        await admin.firestore().collection("deduplications").doc(signature).set({
          timestamp: Date.now(),
          recordingId: docId,
          userId: req.user!.uid,
        });

        if (process.env.FUNCTIONS_EMULATOR) {
          const mockReq = {
            method: "POST",
            headers: {
              authorization: req.headers.authorization,
              "content-type": "application/json",
            },
            body: {
              filePath,
              recordingId: docId,
              userId: req.user!.uid,
              fileHash: fileData.hash,
            },
            user: req.user,
            rawBody: Buffer.from(JSON.stringify({
              filePath,
              recordingId: docId,
              userId: req.user!.uid,
              fileHash: fileData.hash,
            })),
          } as AuthRequest;
          let mockResponse: ApiResponse = { success: false, message: "Mock failed" };
          const mockRes: Response<ApiResponse> = {
            status: (code: number) => ({
              json: (data: ApiResponse) => {
                mockResponse = data;
              },
            }),
            headersSent: false,
          } as any;
          await processAudioHandler(mockReq, mockRes);
          sendResponse(200, {
            success: mockResponse.success,
            message: mockResponse.message,
            recordingId: docId,
            filePath,
            transcript: mockResponse.transcript,
            recommendations: mockResponse.recommendations,
          });
        } else {
          await createProcessingTask(filePath, docId, req.user!.uid, fileData.hash!);
          sendResponse(200, {
            success: true,
            message: "File uploaded successfully",
            recordingId: docId,
            filePath,
          });
        }
      } catch (err: any) {
        sendResponse(500, { success: false, message: `Upload failed: ${err.message}` });
      }
    });

    busboy.on("error", (err) => {
      sendResponse(500, { success: false, message: `Busboy error: ${err}` });
    });

    if (req.rawBody) {
      busboy.end(req.rawBody);
    } else {
      sendResponse(500, { success: false, message: "Internal server error" });
    }
  }
);

// POST /uploadAudioChunk: Upload audio chunk
app.post(
  "/uploadAudioChunk",
  async (req: AuthRequest, res: Response<ApiResponse>): Promise<void> => {
    let responseSent = false;
    const sendResponse = (status: number, body: ApiResponse) => {
      if (!responseSent) {
        responseSent = true;
        res.status(status).json(body);
      }
    };

    if (!req.user) {
      sendResponse(401, { success: false, message: "Unauthorized: Missing user" });
      return;
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: 25 * 1024 * 1024 },
    });
    let chunkBuffer: Buffer | null = null;
    let chunkData: { sessionId: string; chunkNumber: number; totalChunks: number; filename: string; mimeType: string } = {
      sessionId: "",
      chunkNumber: 0,
      totalChunks: 0,
      filename: "",
      mimeType: "",
    };
    let fileData: { path: string; mimeType: string; size: number } = {
      path: "",
      mimeType: "",
      size: 0,
    };

    busboy.on("field", (name, value) => {
      if (name === "sessionId") chunkData.sessionId = value;
      if (name === "chunkNumber") chunkData.chunkNumber = parseInt(value, 10);
      if (name === "totalChunks") chunkData.totalChunks = parseInt(value, 10);
      if (name === "filename") chunkData.filename = value;
      if (name === "mimeType") chunkData.mimeType = value;
    });

    busboy.on("file", (fieldname, file, info) => {
      if (fieldname !== "audio") {
        file.resume();
        return;
      }
      fileData.mimeType = info.mimeType || chunkData.mimeType;
      const chunks: Buffer[] = [];

      file.on("data", (data: Buffer) => {
        chunks.push(data);
      });

      file.on("end", () => {
        chunkBuffer = Buffer.concat(chunks);
        fileData.size = chunkBuffer.length;
      });

      file.on("limit", () => {
        file.resume();
        sendResponse(400, { success: false, message: "Chunk size exceeds 25MB limit" });
      });
    });

    busboy.on("finish", async () => {
      try {
        if (
          !chunkBuffer ||
          !chunkData.sessionId ||
          !chunkData.filename ||
          !chunkData.totalChunks
        ) {
          sendResponse(400, { success: false, message: "Missing chunk or metadata" });
          return;
        }

        if (!validateFile(fileData.mimeType)) {
          sendResponse(400, { success: false, message: "Unsupported file type" });
          return;
        }

        const chunkPath = `chunks/${req.user!.uid}/${chunkData.sessionId}/${chunkData.chunkNumber}`;
        const bucket = admin.storage().bucket();
        const readStream = Readable.from(chunkBuffer);
        const writeStream = bucket.file(chunkPath).createWriteStream({
          metadata: { contentType: fileData.mimeType },
        });

        readStream.pipe(writeStream);
        await new Promise((resolve, reject) => {
          writeStream.on("finish", resolve);
          writeStream.on("error", reject);
          readStream.on("error", reject);
        });

        const chunkDoc = admin.firestore().collection("chunks").doc(chunkData.sessionId);
        await chunkDoc.set(
          {
            userId: req.user!.uid,
            filename: chunkData.filename,
            mimeType: fileData.mimeType,
            totalChunks: chunkData.totalChunks,
            chunks: FieldValue.arrayUnion({
              index: chunkData.chunkNumber,
              path: chunkPath,
              size: fileData.size,
            }),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        sendResponse(202, {
          success: true,
          message: `Chunk ${chunkData.chunkNumber} uploaded successfully`,
          sessionId: chunkData.sessionId,
          chunkNumber: chunkData.chunkNumber,
        });
      } catch (err: any) {
        sendResponse(500, { success: false, message: `Chunk upload failed: ${err.message}` });
      }
    });

    busboy.on("error", (err) => {
      sendResponse(500, { success: false, message: `Busboy error: ${err}` });
    });

    if (req.rawBody) {
      busboy.end(req.rawBody);
    } else {
      sendResponse(500, { success: false, message: "Internal server error" });
    }
  }
);

// POST /finalizeChunkedUpload: Finalize chunked upload
app.post(
  "/finalizeChunkedUpload",
  async (req: AuthRequest, res: Response<ApiResponse>): Promise<void> => {
    let responseSent = false;
    const sendResponse = (status: number, body: ApiResponse) => {
      if (!responseSent) {
        responseSent = true;
        res.status(status).json(body);
      }
    };

    if (!req.user) {
      sendResponse(401, { success: false, message: "Unauthorized: Missing user" });
      return;
    }

    const body = req.body as { sessionId: string; totalChunks: number };
    const { sessionId, totalChunks } = body;

    if (!sessionId || !totalChunks) {
      sendResponse(400, { success: false, message: "Missing sessionId or totalChunks" });
      return;
    }

    try {
      const chunkDoc = admin.firestore().collection("chunks").doc(sessionId);
      const doc = await chunkDoc.get();
      if (!doc.exists) {
        sendResponse(400, { success: false, message: "Session not found" });
        return;
      }

      const docData = doc.data();
      if (
        !docData ||
        docData.userId !== req.user.uid ||
        docData.totalChunks !== totalChunks
      ) {
        sendResponse(400, { success: false, message: "Invalid session data" });
        return;
      }

      if (docData.chunks.length !== totalChunks) {
        sendResponse(400, { success: false, message: "Not all chunks uploaded" });
        return;
      }

      const finalPath = `audio/${req.user.uid}/${Date.now()}-${docData.filename}`;
      const finalFile = admin.storage().bucket().file(finalPath);
      let totalSize = 0;

      // Create a Writable stream to compute hash
      const hashChunks: Buffer[] = [];
      const hashStream = new Writable({
        write(chunk: Buffer, encoding, callback) {
          hashChunks.push(chunk);
          callback();
        },
      });

      // Read chunks sequentially and pipe to hashStream
      for (let i = 1; i <= totalChunks; i++) {
        const chunk = docData.chunks.find((c: any) => c.index === i);
        if (!chunk) {
          throw new Error(`Missing chunk ${i}`);
        }
        totalSize += chunk.size;
        const chunkStream = admin.storage().bucket().file(chunk.path).createReadStream();
        await new Promise((resolve, reject) => {
          chunkStream.pipe(hashStream, { end: false });
          chunkStream.on("end", resolve);
          chunkStream.on("error", reject);
        });
      }
      hashStream.end();

      const fileData: { path: string; mimeType: string; size: number; hash?: string; recordingId?: string } = {
        path: finalPath,
        mimeType: docData.mimeType,
        size: totalSize,
        hash: await computeFileHash(Readable.from(Buffer.concat(hashChunks))),
      };

      const writeStream = finalFile.createWriteStream({
        metadata: { contentType: fileData.mimeType },
      });

      for (let i = 1; i <= totalChunks; i++) {
        const chunk = docData.chunks.find((c: any) => c.index === i);
        const chunkStream = admin.storage().bucket().file(chunk.path).createReadStream();
        await new Promise((resolve, reject) => {
          chunkStream.pipe(writeStream, { end: i === totalChunks });
          chunkStream.on("end", resolve);
          chunkStream.on("error", reject);
        });
      }

      const docId = finalPath.replace(/\//g, "_");
      await admin.firestore().collection("recordings").doc(docId).set({
        filePath: finalPath,
        filename: docData.filename,
        mimeType: fileData.mimeType,
        size: fileData.size,
        fileHash: fileData.hash,
        status: "uploaded",
        userId: req.user.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

      if (process.env.FUNCTIONS_EMULATOR) {
        const mockReq = {
          method: "POST",
          headers: {
            authorization: req.headers.authorization,
            "content-type": "application/json",
          },
          body: {
            filePath: finalPath,
            recordingId: docId,
            userId: req.user!.uid,
            fileHash: fileData.hash,
          },
          user: req.user,
          rawBody: Buffer.from(JSON.stringify({
            filePath: finalPath,
            recordingId: docId,
            userId: req.user!.uid,
            fileHash: fileData.hash,
          })),
        } as AuthRequest;
        let mockResponse: ApiResponse = { success: false, message: "Mock failed" };
        const mockRes: Response<ApiResponse> = {
          status: (code: number) => ({
            json: (data: ApiResponse) => {
              mockResponse = data;
            },
          }),
          headersSent: false,
        } as any;
        await processAudioHandler(mockReq, mockRes);
        sendResponse(200, {
          success: mockResponse.success,
          message: mockResponse.message,
          recordingId: docId,
          filePath: finalPath,
          transcript: mockResponse.transcript,
          recommendations: mockResponse.recommendations,
        });
      } else {
        await createProcessingTask(finalPath, docId, req.user!.uid, fileData.hash!);
        sendResponse(200, {
          success: true,
          message: "File uploaded and processed successfully",
          recordingId: docId,
          filePath: finalPath,
        });
      }

      for (const chunk of docData.chunks) {
        await admin.storage().bucket().file(chunk.path).delete().catch(() => {});
      }
      await chunkDoc.delete();
    } catch (err: any) {
      sendResponse(500, { success: false, message: `Finalize failed: ${err.message}` });
    }
  }
);

// Export Firebase Cloud Function
export const api = functions
  .runWith({ memory: "2GB", timeoutSeconds: 300 })
  .https.onRequest((req: functions.https.Request, res: functions.Response) => {
    if (!res.headersSent) {
      app(req, res);
    }
  });