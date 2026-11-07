<script setup lang="ts">
import { APP_NAME, GITHUB } from '@/core/config/env.ts'
</script>

<template>
  <h1>{{ APP_NAME }}</h1>
  <div class="w-120">
    <p class="text-xl">
      {{ $t('about_thanks') }}
    </p>
    <p>
      {{ $t('github_address') }}<a :href="GITHUB" target="_blank">{{ GITHUB }}</a>
    </p>
    <div class="flex flex-col gap-2 mt-20">
      <div class="">常见问题： <RouterLink to="/help">常见问题解答</RouterLink></div>
    </div>
  </div>
</template>

<style scoped lang="scss"></style>
