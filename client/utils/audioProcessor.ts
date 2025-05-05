import * as FileSystem from "expo-file-system";
import firebase from "firebase/compat/app";
import "firebase/compat/auth";
import { Recording, ApiResponse } from "./types";

const API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5001/qualtirdemofromleo/us-central1/api"
    : "https://us-central1-qualtirdemofromleo.cloudfunctions.net/api";

export const processAudioForTranscription = async (
  audioPath: string
): Promise<ApiResponse> => {
  const user = firebase.auth().currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const idToken = await user.getIdToken();
  const formData = new FormData();
  formData.append("audio", {
    uri: audioPath,
    name: audioPath.split("/").pop() || "audio.mp3",
    type: "audio/mpeg",
  } as any);

  const response = await fetch(`${API_BASE}/uploadAudio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "multipart/form-data",
    },
    body: formData,
  });

  const result: ApiResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Failed to upload audio");
  }
  return result;
};

export const clearLocalAudioFiles = async (): Promise<void> => {
  const audioDir = `${FileSystem.documentDirectory}audio/`;
  try {
    await FileSystem.deleteAsync(audioDir, { idempotent: true });
    await FileSystem.makeDirectoryAsync(audioDir);
  } catch (error) {
    console.warn("Error clearing local audio files:", error);
  }
};

export const deleteRecording = async (
  recordingId: string,
  queryParams?: string
): Promise<void> => {
  const user = firebase.auth().currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const idToken = await user.getIdToken();
  const url = queryParams
    ? `${API_BASE}/recordings/${recordingId}?${queryParams}`
    : `${API_BASE}/recordings/${recordingId}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const result: ApiResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Failed to delete recording");
  }
};

export const deleteAllRecordings = async (): Promise<void> => {
  const user = firebase.auth().currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const idToken = await user.getIdToken();
  const response = await fetch(`${API_BASE}/deleteAllRecordings`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const result: ApiResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Failed to delete all recordings");
  }
};

export const fetchRecordingHistory = async (
  queryParams?: string
): Promise<Recording[]> => {
  const user = firebase.auth().currentUser;
  if (!user) {
    throw new Error("User not authenticated");
  }

  const idToken = await user.getIdToken();
  const url = queryParams
    ? `${API_BASE}/recordings?${queryParams}`
    : `${API_BASE}/recordings`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const result: ApiResponse = await response.json();
  if (!result.success) {
    throw new Error(result.message || "Failed to fetch recordings");
  }

  return (result.recordings || []).map((recording: Recording) => ({
    id: recording.id,
    filename: recording.filename,
    filePath: recording.filePath,
    storageUrl: recording.storageUrl,
    mimeType: recording.mimeType,
    size: recording.size,
    fileHash: recording.fileHash,
    status: recording.status,
    transcript: recording.transcript,
    recommendations: recording.recommendations,
    userId: recording.userId,
    createdAt: recording.createdAt,
    uploadedAt: recording.createdAt, // Map createdAt to uploadedAt for compatibility
  })) as Recording[];
};
