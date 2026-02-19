<template>
  <div
    class="card b"
    :class="cardClass"
    data-testid="content-card"
    @mouseenter="onHover"
    @mouseleave="onLeave"
    @click="$emit('pick')"
  >
    <div v-if="entry.image" class="card-img-wrap">
      <img :src="'/images/' + entry.image" :alt="entry.name" class="card-img" />
    </div>
    <div v-else class="card-img-wrap card-img-placeholder">?</div>
    <div class="card-name">{{ entry.name }}</div>
    <span class="card-badge" :class="categoryColor">{{ entry.category }}</span>
    <div v-if="revealed" class="card-date yellow">{{ formatDate(entry.releaseDate) }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ContentEntry } from '../services/quiz'

const props = defineProps<{
  entry: ContentEntry
  revealed: boolean
  isCorrect: boolean | null
  focused: boolean
}>()

defineEmits<{ pick: [] }>()

const CATEGORY_COLORS: Record<string, string> = {
  quest: 'green', item: 'orange', npc: 'yellow',
  location: 'white', minigame: 'red', music: 'green', skill: 'yellow',
}

const categoryColor = computed(() => CATEGORY_COLORS[props.entry.category] || 'white')

const cardClass = computed(() => {
  if (!props.revealed) return props.focused ? 'card-interactive card-focused' : 'card-interactive'
  return props.isCorrect ? 'card-correct' : 'card-incorrect'
})

function onHover(e: MouseEvent) {
  if (!props.revealed) (e.currentTarget as HTMLElement).style.borderColor = '#ff3030'
}
function onLeave(e: MouseEvent) {
  if (!props.revealed) (e.currentTarget as HTMLElement).style.borderColor = ''
}

function formatDate(d: string): string {
  const parts = d.split('-')
  const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${parseInt(parts[2] ?? '0')} ${months[parseInt(parts[1] ?? '0')] ?? ''} ${parts[0] ?? ''}`
}
</script>

<style scoped>
.card {
  display: inline-block;
  vertical-align: top;
  width: 46%;
  margin: 0 1.5%;
  padding: 8px;
  text-align: center;
  box-sizing: border-box;
  background: #1a1a1a;
}
@media (max-width: 500px) {
  .card {
    display: block;
    width: 100%;
    margin: 0 0 8px 0;
  }
}
.card-interactive { cursor: pointer; }
.card-focused { border-color: #ff3030 !important; }
.card-correct { border-color: #04A800 !important; }
.card-incorrect { border-color: #E10505 !important; }

.card-img-wrap {
  width: 100%;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-bottom: 6px;
}
.card-img {
  max-width: 100%;
  max-height: 120px;
  object-fit: contain;
}
.card-img-placeholder {
  font-size: 48px;
  color: #555;
}

.card-name {
  font-weight: bold;
  margin-bottom: 4px;
  word-break: break-word;
}
.card-badge {
  font-size: 11px;
  display: inline-block;
  margin-bottom: 4px;
}
.card-date {
  margin-top: 4px;
  font-weight: bold;
}
</style>
