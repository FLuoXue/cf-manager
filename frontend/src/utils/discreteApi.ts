import { createDiscreteApi, darkTheme } from 'naive-ui';
import type { ConfigProviderProps, GlobalThemeOverrides } from 'naive-ui';
import { computed, ref } from 'vue';
import { getThemeOverrides } from './theme';

const themeRef = ref<'light' | 'dark'>('light');
const overridesRef = ref<GlobalThemeOverrides | null>(null);

const configProviderProps = computed<ConfigProviderProps>(() => ({
  theme: themeRef.value === 'dark' ? darkTheme : undefined,
  themeOverrides: overridesRef.value || getThemeOverrides(themeRef.value === 'dark'),
}));

const { message, notification, dialog, loadingBar } = createDiscreteApi(
  ['message', 'notification', 'dialog', 'loadingBar'],
  { configProviderProps }
);

export function setDiscreteTheme(dark: boolean, overrides?: GlobalThemeOverrides) {
  themeRef.value = dark ? 'dark' : 'light';
  if (overrides) {
    overridesRef.value = overrides;
  } else {
    overridesRef.value = getThemeOverrides(dark);
  }
}

export { message, notification, dialog, loadingBar };
