<template>
  <div class="page-wrap">
    <div class="frame b stone-bg">
      <!-- Corner GIFs -->
      <img class="corner corner-tl" src="/img/fm_topleft.gif" alt="">
      <img class="corner corner-tr" src="/img/fm_topright.gif" alt="">
      <img class="corner corner-bl" src="/img/fm_bottomleft.gif" alt="">
      <img class="corner corner-br" src="/img/fm_bottomright.gif" alt="">

      <!-- Title -->
      <div class="title-bar b2">
        <span class="yellow title-text">Lost City Quiz</span>
      </div>

      <!-- Navigation -->
      <div class="nav-bar">
        <router-link to="/">Play</router-link>
        <span class="white"> - </span>
        <router-link to="/stats">Stats</router-link>
      </div>

      <!-- Content -->
      <div class="content e">
        <slot />
      </div>

      <!-- Footer -->
      <div class="footer">
        <span class="white">Fan project &mdash; not affiliated with Jagex</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.page-wrap {
  display: flex;
  justify-content: center;
  padding: 16px 8px;
  box-sizing: border-box;
}

.frame {
  position: relative;
  width: 100%;
  max-width: 530px;
  padding: 12px;
  box-sizing: border-box;
}

.corner {
  position: absolute;
  width: 6px;
  height: 6px;
  z-index: 1;
}
.corner-tl { top: -3px; left: -3px; }
.corner-tr { top: -3px; right: -3px; }
.corner-bl { bottom: -3px; left: -3px; }
.corner-br { bottom: -3px; right: -3px; }

.title-bar {
  text-align: center;
  padding: 6px 0;
  margin-bottom: 8px;
}

.title-text {
  font-size: 16px;
  font-weight: bold;
}

.nav-bar {
  text-align: center;
  padding: 4px 0;
  margin-bottom: 8px;
}

.content {
  padding: 8px;
  margin-bottom: 8px;
}

.footer {
  text-align: center;
  padding: 4px 0;
  font-size: 11px;
}
</style>
