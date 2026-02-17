<template>
  <MainLayout>
    <GameHud />

    <p class="yellow" style="text-align:center;font-weight:bold;margin-bottom:8px">
      Which was released first?
    </p>

    <div class="cards-row">
      <ContentCard
        :entry="pair[0]"
        :revealed="revealed"
        :is-correct="revealed ? correctIndex === 0 : null"
        @pick="onPick(0)"
      />
      <ContentCard
        :entry="pair[1]"
        :revealed="revealed"
        :is-correct="revealed ? correctIndex === 1 : null"
        @pick="onPick(1)"
      />
    </div>

    <div v-if="revealed" style="text-align:center;margin-top:8px">
      <p :class="lastCorrect ? 'green' : 'red'" style="font-weight:bold">
        {{ lastCorrect ? 'Correct!' : 'Wrong!' }}
        <span class="white">({{ lastPoints >= 0 ? '+' : '' }}{{ lastPoints }} pts)</span>
      </p>
      <button class="next-btn b" @click="nextRound">Next &gt;</button>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useGameState } from '../composables/useGameState'
import { auth } from '../firebase'
import { selectPair, getDifficulty, _testOverridePair, getContentById } from '../services/quiz'
import type { ContentEntry } from '../services/quiz'
import { calculateElo, calculatePoints, isCorrect } from '../services/scoring'
import MainLayout from '../layouts/MainLayout.vue'
import GameHud from '../components/GameHud.vue'
import ContentCard from '../components/ContentCard.vue'

const { elo, currentStreak, bestStreak, gamesPlayed, correctAnswers, sessionScore, readyPromise, recordAnswer } = useGameState()

const pair = ref<[ContentEntry, ContentEntry]>([
  { id: '', name: '', category: '', releaseDate: '', image: '' },
  { id: '', name: '', category: '', releaseDate: '', image: '' },
])
const revealed = ref(false)
const correctIndex = ref(0)
const lastCorrect = ref(false)
const lastPoints = ref(0)

const previousPairs = new Set<string>()

function newPair() {
  revealed.value = false
  pair.value = selectPair(elo.value, previousPairs)
  const key = [pair.value[0].id, pair.value[1].id].sort().join('|')
  previousPairs.add(key)
  if (previousPairs.size > 200) {
    const first = previousPairs.values().next().value!
    previousPairs.delete(first)
  }
}

function onPick(index: number) {
  if (revealed.value) return

  const chosen = pair.value[index]!
  const other = pair.value[1 - index]!
  const won = isCorrect(chosen.releaseDate, other.releaseDate)
  const diff = getDifficulty(pair.value[0], pair.value[1])

  const dateA = pair.value[0].releaseDate
  const dateB = pair.value[1].releaseDate
  correctIndex.value = dateA === dateB ? index : (dateA < dateB ? 0 : 1)

  const newElo = calculateElo(elo.value, diff, won)
  const streak = won ? currentStreak.value + 1 : 0
  const pts = calculatePoints(diff, won, won ? streak : currentStreak.value)

  lastCorrect.value = won
  lastPoints.value = pts
  revealed.value = true

  recordAnswer(won, pts, newElo)
}

function nextRound() {
  newPair()
}

onMounted(() => {
  newPair()

  if (import.meta.env.DEV) {
    ;(window as any).__testApi = {
      forcePair(idA: string, idB: string) {
        const a = getContentById(idA)
        const b = getContentById(idB)
        if (a && b) _testOverridePair.value = [a, b]
      },
      nextRound() {
        newPair()
      },
      waitReady() {
        return readyPromise
      },
      getState() {
        return {
          uid: auth.currentUser?.uid ?? '',
          elo: elo.value,
          streak: currentStreak.value,
          score: sessionScore.value,
          gamesPlayed: gamesPlayed.value,
          correctAnswers: correctAnswers.value,
          bestStreak: bestStreak.value,
          revealed: revealed.value,
          pair: [pair.value[0].id, pair.value[1].id],
        }
      },
    }
  }
})
</script>

<style scoped>
.cards-row {
  text-align: center;
}
.next-btn {
  margin-top: 8px;
  padding: 4px 16px;
  background: #333;
  color: #FFE139;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  cursor: pointer;
}
.next-btn:hover {
  background: #444;
}
</style>
