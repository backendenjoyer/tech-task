import * as admin from "firebase-admin";

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  recordings?: T[];
  count?: number;
  recording?: T;
  recordingId?: string;
  filePath?: string;
  sessionId?: string;
  chunkNumber?: number;
  isDuplicate?: boolean;
  transcript?: string;
  recommendations?: string;
}

export interface ProcessRequestBody {
  filePath: string;
  recordingId: string;
  userId: string;
  fileHash: string;
}

export interface RecordingsDocument {
  filePath: string;
  userId: string;
  status: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  fileHash?: string;
  createdAt?: admin.firestore.Timestamp | Date;
  processingStartedAt?: admin.firestore.Timestamp | Date;
  processedAt?: admin.firestore.Timestamp | Date;
  failedAt?: admin.firestore.Timestamp | Date;
  transcript?: string;
  recommendations?: string;
  error?: string;
}