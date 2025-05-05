import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import firebaseConfig from './firebaseConfig';

const USING_EMULATOR = true;

let auth: any;

// Only initialize Firebase in production
if (!__DEV__) {
  const app = initializeApp(firebaseConfig as any);
  console.log('Firebase initialized');
  auth = getAuth(app);

  if (USING_EMULATOR) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    console.log('Connected to Firebase Auth emulator at http://localhost:9099');
  }
} else {
  console.log('Skipping Firebase Auth initialization in development');
  auth = null; // Ensure auth is defined but null in development
}

// Utility to get ID token (used by audioProcessor.ts)
export const getIdToken = async (): Promise<string | null> => {
  if (__DEV__) {
    // Return hardcoded token in development
    return 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJlbWFpbCI6ImRhc2RAZ2FzaWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOmZhbHNlLCJhdXRoX3RpbWUiOjE3NDY0MzIyMDMsInVzZXJfaWQiOiI5TGVRUk5vRGNYRlFIQW0xZmNiVm53RHoxZ3ZPIiwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJkYXNkQGdhc2lsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6InBhc3N3b3JkIn0sImlhdCI6MTc0NjQzMjIwMywiZXhwIjoxNzQ2NDM1ODAzLCJhdWQiOiJxdWFsdGlyZGVtb2Zyb21sZW8iLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vcXVhbHRpcmRlbW9mcm9tbGVvIiwic3ViIjoiOUxlUVJOb0RjWEZRSEFtMWZjYlZud0R6MWd2TyJ9'; // Replace with emulator token
  }
  try {
    const user = auth?.currentUser;
    if (!user) {
      console.log('No user signed in');
      return null;
    }
    const token = await user.getIdToken(true);
    console.log('Fetched ID token');
    return token;
  } catch (error) {
    console.error('Error getting ID token:', error);
    return null;
  }
};

export { auth };