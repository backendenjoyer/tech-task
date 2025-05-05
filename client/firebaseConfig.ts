import firebase from '@react-native-firebase/app';
import '@react-native-firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyASsaw34Y5e8XF3gKnnJyqii5fqbT_YlZQ',
  authDomain: 'qualtirdemofromleo.firebaseapp.com',
  projectId: 'qualtirdemofromleo',
  storageBucket: 'qualtirdemofromleo.firebasestorage.app',
  messagingSenderId: '469133056987',
  appId: '1:469133056987:web:a6964a37d5ec330f82e5fe',
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export default firebase;