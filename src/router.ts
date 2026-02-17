import { createRouter, createWebHashHistory } from 'vue-router'
import QuizView from './views/QuizView.vue'
import StatsView from './views/StatsView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: QuizView },
    { path: '/stats', component: StatsView },
  ],
})
