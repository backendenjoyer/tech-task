import { auth } from '../firebaseInit';
import { signInWithEmailAndPassword } from 'firebase/auth';

export const signIn = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('Signed in successfully:', userCredential.user.email);
    return userCredential.user;
  } catch (error: any) {
    console.error('Sign-in error:', error);
    throw error;
  }
};