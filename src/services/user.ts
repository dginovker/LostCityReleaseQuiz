import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

const defaultUser = {
  elo: 1200,
  gamesPlayed: 0,
  correctAnswers: 0,
  currentStreak: 0,
  bestStreak: 0,
}

export async function getOrCreateUser(uid: string) {
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return snap.data()
  const data = { ...defaultUser, createdAt: serverTimestamp() }
  await setDoc(ref, data)
  return data
}

export async function updateUser(uid: string, data: Partial<typeof defaultUser>) {
  const ref = doc(db, 'users', uid)
  await updateDoc(ref, data)
}
