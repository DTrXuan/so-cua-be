// Only the Firebase pieces the app uses, bundled into ../firebase.js (npm run build:firebase).
export { initializeApp } from 'firebase/app';
export { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, query, orderBy, limit, onSnapshot, setDoc, deleteDoc, getDoc, deleteField,
} from 'firebase/firestore';
