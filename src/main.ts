import { createApp } from 'vue'
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { auth } from './firebase'
import { router } from './router'
import './style.css'
import App from './App.vue'

// Only sign in anonymously if no persisted session exists
const unsub = onAuthStateChanged(auth, (user) => {
  unsub()
  if (!user) {
    signInAnonymously(auth).catch(err => {
      console.error('Anonymous sign-in failed:', err)
    })
  }
})

createApp(App).use(router).mount('#app')
