import { auth } from '../firebaseInit';
import { User, signInWithEmailAndPassword } from 'firebase/auth';

// Mock user mimicking the real user from Firebase emulator
const MOCK_USER = {
  uid: 'some-uid', // Replace with the emulator user's UID
  email: 'dasd@gasil.com', // Replace with the emulator user's email
  displayName: 'Test User',
  getIdToken: async () => 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJlbWFpbCI6ImRhc2RAZ2FzaWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOmZhbHNlLCJhdXRoX3RpbWUiOjE3NDY0MzIyMDMsInVzZXJfaWQiOiI5TGVRUk5vRGNYRlFIQW0xZmNiVm53RHoxZ3ZPIiwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJlbWFpbCI6WyJkYXNkQGdhc2lsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6InBhc3N3b3JkIn0sImlhdCI6MTc0NjQzMjIwMywiZXhwIjoxNzQ2NDM1ODAzLCJhdWQiOiJxdWFsdGlyZGVtb2Zyb21sZW8iLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vcXVhbHRpcmRlbW9mcm9tbGVvIiwic3ViIjoiOUxlUVJOb0RjWEZRSEFtMWZjYlZud0R6MWd2TyJ9'
};

export const signIn = async (email: string, password: string) => {
  try {
    if (__DEV__) {
      // In development, simulate sign-in without Firebase Auth
      console.log('Mock sign-in in development:', email, password);
      if (email === MOCK_USER.email && password === 'password123') {
        return MOCK_USER as User;
      }
      throw new Error('Invalid mock credentials');
    } else {
      // In production, use Firebase Auth with emulator
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      console.log('Signed in successfully:', userCredential.user.email);
      return userCredential.user;
    }
  } catch (error: any) {
    console.error('Sign-in error:', error);
    throw error;
  }
};

// Mock auth state listener
type AuthStateCallback = (user: User | null) => void;

export const onAuthStateChanged = (callback: AuthStateCallback) => {
  if (__DEV__) {
    // In development, simulate the authenticated user
    console.log('Using mock auth in development with hardcoded token');
    callback(MOCK_USER as User);
    return () => {}; // No-op unsubscribe
  } else {
    // In production, use Firebase Auth
    return auth.onAuthStateChanged(callback);
  }
};

// Mock signOut function
export const signOut = async () => {
  if (__DEV__) {
    console.log('Mock sign out in development');
    return Promise.resolve();
  } else {
    return auth.signOut();
  }
};

// Get current user
export const getCurrentUser = () => {
  if (__DEV__) {
    return MOCK_USER as User;
  } else {
    return auth.currentUser;
  }
};