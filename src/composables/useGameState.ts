import { ref } from 'vue'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase'
import { getOrCreateUser, updateUser } from '../services/user'

const elo = ref(1200)
const currentStreak = ref(0)
const bestStreak = ref(0)
const gamesPlayed = ref(0)
const correctAnswers = ref(0)
const ready = ref(false)

let uid = ''
let initialized = false
let dataLoaded = false
let readyResolve: (() => void) | null = null
const readyPromise = new Promise<void>(r => { readyResolve = r })

function init() {
  if (initialized) return
  initialized = true

  onAuthStateChanged(auth, async (user) => {
    if (user && !dataLoaded) {
      uid = user.uid
      dataLoaded = true
      const data = await getOrCreateUser(uid)
      elo.value = data.elo ?? 1200
      gamesPlayed.value = data.gamesPlayed ?? 0
      correctAnswers.value = data.correctAnswers ?? 0
      currentStreak.value = data.currentStreak ?? 0
      bestStreak.value = data.bestStreak ?? 0
      ready.value = true
      readyResolve?.()
    }
  })
}

function recordAnswer(correct: boolean, newElo: number) {
  elo.value = newElo
  currentStreak.value = correct ? currentStreak.value + 1 : 0
  gamesPlayed.value++
  if (correct) correctAnswers.value++
  if (currentStreak.value > bestStreak.value) bestStreak.value = currentStreak.value

  if (uid) {
    updateUser(uid, {
      elo: newElo,
      gamesPlayed: gamesPlayed.value,
      correctAnswers: correctAnswers.value,
      currentStreak: currentStreak.value,
      bestStreak: bestStreak.value,
    }).catch(() => {})
  }
}

export function useGameState() {
  init()
  return { elo, currentStreak, bestStreak, gamesPlayed, correctAnswers, ready, readyPromise, recordAnswer }
}
