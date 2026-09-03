<template>
  <n-space align="center" class="toolbar" wrap>
    <n-input
      :value="searchText"
      @update:value="(v: string) => emit('update:searchText', v)"
      :placeholder="t('storeToolbar.searchPlaceholder')"
      clearable
      size="small"
      style="width: 220px"
    />
    <n-select
      :value="sortBy"
      @update:value="(v: string) => emit('update:sortBy', v as 'name' | 'version')"
      :options="sortOptions"
      size="small"
      style="width: 150px"
    />
    <n-button
      size="small"
      :type="favOnly ? 'primary' : 'default'"
      :secondary="favOnly"
      @click="emit('update:favOnly', !favOnly)"
    >
      <template #icon>
        <n-icon :component="favOnly ? Star : StarOutline" />
      </template>
      {{ favOnly ? t('storeToolbar.favOnly') : t('storeToolbar.favorites') }}
    </n-button>
    <n-button
      v-if="hasActiveFilter"
      size="small"
      quaternary
      @click="emit('clear')"
    >
      {{ t('storeToolbar.clearFilter') }}
    </n-button>
  </n-space>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Star, StarOutline } from '@vicons/ionicons5';

const { t } = useI18n();

defineProps<{
  searchText: string;
  sortBy: 'name' | 'version';
  favOnly: boolean;
  hasActiveFilter: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:searchText', value: string): void;
  (e: 'update:sortBy', value: 'name' | 'version'): void;
  (e: 'update:favOnly', value: boolean): void;
  (e: 'clear'): void;
}>();

const sortOptions = computed(() => [
  { label: t('storeToolbar.sortName'), value: 'name' },
  { label: t('storeToolbar.sortVersion'), value: 'version' },
]);
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
}
</style>
