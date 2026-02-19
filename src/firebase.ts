import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCujvHA71n_ue57JrUhCQvRcdT7azZOwlY',
  authDomain: 'rshistoryquiz.firebaseapp.com',
  projectId: 'rshistoryquiz',
  appId: '1:709279364806:web:2a54780bcaa22d68d449c7',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  console.log('Connected to Firebase Auth emulator')
  connectFirestoreEmulator(db, '127.0.0.1', 8081)
  console.log('Connected to Firestore emulator')
}
