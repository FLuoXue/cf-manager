<template>
  <div class="ai-stats-root">
    <!-- 汇总信息 -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <div style="font-size: 16px; font-weight: 600;">{{ t('aiStats.title', 'AI 使用量统计') }}</div>
      <n-button secondary type="primary" size="small" :loading="loading" @click="fetchUsage">{{ t('common.refresh') }}</n-button>
    </div>
    <n-spin :show="loading">
    <div class="ai-stats-summary">
      <div class="stats-summary-card">
        <span class="stats-summary-label">{{ t('aiStats.totalAccounts') }}</span>
        <span class="stats-summary-value">{{ usageData.length }}</span>
      </div>
      <div class="stats-summary-card">
        <span class="stats-summary-label">{{ t('aiStats.totalNeurons') }}</span>
        <span class="stats-summary-value">{{ totalNeurons.toLocaleString() }}</span>
      </div>
      <div class="stats-summary-card">
        <span class="stats-summary-label">{{ t('aiStats.totalRequests') }}</span>
        <span class="stats-summary-value">{{ totalRequests.toLocaleString() }}</span>
      </div>
      <div class="stats-summary-card">
        <span class="stats-summary-label">{{ t('aiStats.activeModels') }}</span>
        <span class="stats-summary-value">{{ activeModelCount }}</span>
      </div>
    </div>

    <!-- 账户用量卡片 -->
    <div class="ai-stats-cards">
      <div v-if="usageData.length === 0" class="ai-stats-empty">
        {{ t('common.noData') }}
      </div>
      <n-grid v-else :x-gap="12" :y-gap="12" cols="1 s:2 m:3 l:4" responsive="screen">
        <n-gi v-for="u in usageData" :key="u.accountId">
          <div class="ai-stats-card">
            <div class="ai-stats-card-header">
              <span class="ai-stats-card-name" :title="u.accountName">{{ u.accountName }}</span>
              <span
                class="ai-stats-card-badge"
                :class="{ 'badge-warning': u.totalNeurons > 8000, 'badge-danger': u.totalNeurons > 9500 }"
              >
                {{ Math.min(u.totalNeurons / 100, 100).toFixed(0) }}%
              </span>
            </div>
            <n-progress
              type="line"
              :percentage="Math.min(u.totalNeurons / 100, 100)"
              :color="u.totalNeurons > 8000 ? '#e03050' : '#2080f0'"
              :rail-color="'var(--app-border)'"
              :height="10"
              :show-indicator="false"
              style="margin: 8px 0;"
            />
            <div class="ai-stats-card-info">
              <span>{{ u.totalNeurons.toLocaleString() }} / 10,000 {{ t('aiStats.neurons') }}</span>
            </div>
            <div v-if="u.models.length > 0" class="ai-stats-card-models">
              <div class="ai-stats-card-models-title">
                {{ t('ai.modelDetail', { count: u.models.length }) }}
              </div>
              <div
                v-for="m in u.models"
                :key="m.modelId"
                class="ai-stats-model-row"
              >
                <span class="ai-stats-model-name" :title="m.modelId">{{ m.modelId.replace(/^@cf\//, '') }}</span>
                <span class="ai-stats-model-meta">
                  {{ m.neurons.toLocaleString() }} ⚡ · {{ m.requests.toLocaleString() }} {{ t('ai.requests') }}
                </span>
              </div>
            </div>
          </div>
        </n-gi>
      </n-grid>
    </div>
    </n-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import apiClient from '../api/client';

interface AiUsageItem {
  accountId: string;
  accountName: string;
  totalNeurons: number;
  models: Array<{ modelId: string; neurons: number; requests: number }>;
}

const { t } = useI18n();
const loading = ref(false);
const usageData = ref<AiUsageItem[]>([]);

const totalNeurons = computed(() => usageData.value.reduce((sum, u) => sum + (u.totalNeurons || 0), 0));
const totalRequests = computed(() => usageData.value.reduce((sum, u) => sum + u.models.reduce((s, m) => s + (m.requests || 0), 0), 0));
const activeModelCount = computed(() => {
  const set = new Set<string>();
  usageData.value.forEach(u => u.models.forEach(m => set.add(m.modelId)));
  return set.size;
});

async function fetchUsage() {
  loading.value = true;
  try {
    const { data: result } = await apiClient.get('/ai/usage');
    const data = (result as any)?.data || result;
    usageData.value = (data || []).map((d: any) => ({
      ...d,
      totalNeurons: d.totalNeurons || 0,
    }));
  } catch (error) {
    console.error('[AiStatsView] Failed to fetch usage:', error);
    usageData.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchUsage();
});
</script>

<style scoped>
.ai-stats-root {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  overflow-y: auto;
  padding: 16px 20px;
}

.ai-stats-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.stats-summary-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 20px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--n-color-modal);
  min-width: 140px;
}

.stats-summary-label {
  font-size: 12px;
  color: var(--app-text-muted);
}

.stats-summary-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--app-text-primary);
}

.ai-stats-cards {
  max-width: 1200px;
}

.ai-stats-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--app-text-muted);
  font-size: 15px;
}

.ai-stats-card {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  padding: 14px 16px;
  background: var(--n-color-modal);
  transition: border-color 0.2s;
}

.ai-stats-card:hover {
  border-color: var(--n-border-color-hover, #2080f0);
}

.ai-stats-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.ai-stats-card-name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.ai-stats-card-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--n-color-tag);
  color: var(--app-text-muted);
  flex-shrink: 0;
}

.badge-warning {
  background: rgba(240, 160, 32, 0.15);
  color: #e0a020;
}

.badge-danger {
  background: rgba(224, 48, 80, 0.15);
  color: #e03050;
}

.ai-stats-card-info {
  font-size: 12px;
  color: var(--app-text-muted);
}

.ai-stats-card-models {
  margin-top: 10px;
  border-top: 1px solid var(--app-border);
  padding-top: 8px;
}

.ai-stats-card-models-title {
  font-size: 11px;
  color: var(--app-text-muted);
  margin-bottom: 6px;
}

.ai-stats-model-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--app-border-light, rgba(0,0,0,0.04));
}

.ai-stats-model-row:last-child {
  border-bottom: none;
}

.ai-stats-model-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-text-secondary);
  margin-right: 8px;
}

.ai-stats-model-meta {
  flex-shrink: 0;
  color: var(--app-text-muted);
  white-space: nowrap;
}

@media (max-width: 768px) {
  .ai-stats-summary {
    gap: 8px;
  }
  .stats-summary-card {
    min-width: 100px;
    padding: 10px 14px;
  }
  .stats-summary-value {
    font-size: 20px;
  }
}
</style>
