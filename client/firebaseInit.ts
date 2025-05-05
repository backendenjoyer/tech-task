import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import firebaseConfig from './firebaseConfig';

const USING_EMULATOR = true;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
console.log('Firebase initialized');

// Initialize Auth
const auth = getAuth(app);
console.log('Auth object:', auth);

// Configure emulator for local development
if (USING_EMULATOR) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  console.log('Connected to Firebase Auth emulator at http://localhost:9099');
}

// Utility to get ID token
export const getIdToken = async (): Promise<string | null> => {
  try {
    const user = auth.currentUser;
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