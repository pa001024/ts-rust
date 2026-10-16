<script setup lang="ts">
import { ref } from 'vue';
import Hello from './Hello.vue';

const count = ref(0);
const msg: string = 123;
</script>

<template>
	<div>{{ count }}</div>
	<Hello :title="count" />
	<div>{{ missingVar }}</div>
</template>
