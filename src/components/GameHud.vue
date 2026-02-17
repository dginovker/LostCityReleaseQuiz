<template>
  <div class="hud e">
    <span>ELO: <span class="yellow">{{ elo }}</span></span>
    <span>
      Streak: <span class="yellow">{{ currentStreak }}</span>
      <span v-if="currentStreak >= 5" class="streak-fire">🔥</span>
    </span>
    <span>Score: <span class="yellow">{{ sessionScore }}</span></span>
  </div>
</template>

<script setup lang="ts">
import { useGameState } from '../composables/useGameState'
const { elo, currentStreak, sessionScore } = useGameState()
</script>

<style scoped>
.hud {
  display: flex;
  justify-content: space-between;
  padding: 4px 8px;
  font-size: 12px;
  margin-bottom: 8px;
}
.streak-fire { font-size: 11px; }
</style>
