export interface Recording {
  id: string;
  filename: string;
  filePath: string;
  storageUrl?: string;
  mimeType?: string;
  size?: number;
  fileHash?: string;
  status?: string;
  transcript?: string;
  recommendations?: string;
  userId?: string;
  createdAt?:
    | {
        seconds: number;
        nanoseconds: number;
      }
    | string;
  uploadedAt?: {
    seconds: number;
    nanoseconds: number;
  };
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  recordingId?: string;
  filePath?: string;
  transcript?: string;
  recommendations?: string;
  recordings?: Recording[];
  count?: number;
}
