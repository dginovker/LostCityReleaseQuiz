import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'demo-key',
  authDomain: 'lostcity-quiz.firebaseapp.com',
  projectId: 'lostcity-quiz',
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
