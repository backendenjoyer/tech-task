import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK before any imports
admin.initializeApp();

import * as process from './process';
import * as apiImport from './api';
import * as upload from './upload';
import * as cleanup from './cleanup';

export const uploadAudio = upload.uploadAudio;
export const processAudio = process.processAudio;
export const api = apiImport.api;
export const cleanupRecordings = cleanup.cleanupDeduplications;