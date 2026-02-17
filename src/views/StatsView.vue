<template>
  <MainLayout>
    <div class="stats-table">
      <div class="stat-row e">
        <span>ELO Rating</span>
        <span class="yellow">{{ elo }}</span>
      </div>
      <div class="stat-row e">
        <span>Games Played</span>
        <span class="yellow">{{ gamesPlayed }}</span>
      </div>
      <div class="stat-row e">
        <span>Accuracy</span>
        <span class="yellow">{{ accuracy }}%</span>
      </div>
      <div class="stat-row e">
        <span>Current Streak</span>
        <span class="yellow">{{ currentStreak }}</span>
      </div>
      <div class="stat-row e">
        <span>Best Streak</span>
        <span class="yellow">{{ bestStreak }}</span>
      </div>
    </div>

    <div style="text-align:center;margin-top:12px">
      <router-link to="/">Back to Quiz</router-link>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGameState } from '../composables/useGameState'
import MainLayout from '../layouts/MainLayout.vue'

const { elo, gamesPlayed, correctAnswers, currentStreak, bestStreak } = useGameState()

const accuracy = computed(() => {
  if (gamesPlayed.value === 0) return 0
  return Math.round((correctAnswers.value / gamesPlayed.value) * 100)
})
</script>

<style scoped>
.stats-table {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 8px;
}
</style>
