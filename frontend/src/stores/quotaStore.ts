import { defineStore } from 'pinia';
import { ref } from 'vue';
import apiClient from '../api/client';

export const useQuotaStore = defineStore('quota', () => {
  const quota = ref<any[]>([]);
  const loading = ref(false);
  const syncing = ref(false);

  async function fetchQuota(refresh = false) {
    if (refresh) {
      syncing.value = true;
    } else {
      loading.value = true;
    }
    try {
      const { data } = await apiClient.get('/quota', {
        params: refresh ? { sync: 'true' } : undefined,
      });
      quota.value = data;
    } catch {
      quota.value = [];
    } finally {
      loading.value = false;
      syncing.value = false;
    }
  }

  return { quota, loading, syncing, fetchQuota };
});
