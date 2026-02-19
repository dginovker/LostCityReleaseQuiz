<template>
  <MainLayout>
    <GameHud />

    <p class="yellow" style="text-align:center;font-weight:bold;margin-bottom:8px">
      Which was released first?
    </p>

    <div class="cards-row">
      <ContentCard
        ref="card0"
        :entry="pair[0]"
        :revealed="revealed"
        :is-correct="revealed ? correctIndex === 0 : null"
        :focused="!revealed && focusedIndex === 0"
        @pick="onPick(0)"
      />
      <ContentCard
        ref="card1"
        :entry="pair[1]"
        :revealed="revealed"
        :is-correct="revealed ? correctIndex === 1 : null"
        :focused="!revealed && focusedIndex === 1"
        @pick="onPick(1)"
      />
    </div>

    <div v-if="revealed" style="text-align:center;margin-top:8px">
      <p :class="lastCorrect ? 'green' : 'red'" style="font-weight:bold">
        {{ lastCorrect ? 'Correct!' : 'Wrong!' }}
        <span class="white">({{ eloDelta >= 0 ? '+' : '' }}{{ eloDelta }} ELO)</span>
      </p>
      <button class="next-btn b" @click="nextRound">Next &gt;</button>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useGameState } from '../composables/useGameState'
import { auth } from '../firebase'
import { selectPair, getDifficulty, _testOverridePair, getContentById } from '../services/quiz'
import type { ContentEntry } from '../services/quiz'
import { calculateElo, isCorrect } from '../services/scoring'
import MainLayout from '../layouts/MainLayout.vue'
import GameHud from '../components/GameHud.vue'
import ContentCard from '../components/ContentCard.vue'

const { elo, currentStreak, bestStreak, gamesPlayed, correctAnswers, readyPromise, recordAnswer } = useGameState()

const pair = ref<[ContentEntry, ContentEntry]>([
  { id: '', name: '', category: '', releaseDate: '', image: '' },
  { id: '', name: '', category: '', releaseDate: '', image: '' },
])
const revealed = ref(false)
const correctIndex = ref(0)
const lastCorrect = ref(false)
const eloDelta = ref(0)
const focusedIndex = ref(-1)
const card0 = ref<InstanceType<typeof ContentCard> | null>(null)
const card1 = ref<InstanceType<typeof ContentCard> | null>(null)

const previousPairs = new Set<string>()

function clearCardGlow() {
  card0.value?.$el?.style.removeProperty('border-color')
  card1.value?.$el?.style.removeProperty('border-color')
}

function newPair() {
  revealed.value = false
  focusedIndex.value = -1
  clearCardGlow()
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
  eloDelta.value = newElo - elo.value

  lastCorrect.value = won
  revealed.value = true
  if (won) spawnConfetti()

  recordAnswer(won, newElo)
}

function spawnConfetti() {
  const colors = ['#04A800', '#FFE139', '#ff3030', '#39c0ff', '#ff9900', '#ffffff']
  const container = document.querySelector('.cards-row') as HTMLElement
  if (!container) return
  const rect = container.getBoundingClientRect()
  for (let i = 0; i < 30; i++) {
    const el = document.createElement('div')
    el.className = 'confetti-particle'
    el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)]!
    el.style.left = (rect.left + rect.width / 2) + 'px'
    el.style.top = (rect.top + rect.height / 2) + 'px'
    el.style.setProperty('--dx', (Math.random() - 0.5) * 300 + 'px')
    el.style.setProperty('--dy', (Math.random() - 1) * 250 - 50 + 'px')
    el.style.setProperty('--rot', Math.random() * 720 - 360 + 'deg')
    document.body.appendChild(el)
    el.addEventListener('animationend', () => el.remove())
  }
}

function nextRound() {
  newPair()
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft' || e.key === '1') {
    e.preventDefault()
    if (!revealed.value) onPick(0)
  } else if (e.key === 'ArrowRight' || e.key === '2') {
    e.preventDefault()
    if (!revealed.value) onPick(1)
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (revealed.value) {
      nextRound()
    } else if (focusedIndex.value >= 0) {
      onPick(focusedIndex.value)
    }
  }
}

onMounted(() => {
  newPair()
  window.addEventListener('keydown', onKeyDown)

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

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
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
