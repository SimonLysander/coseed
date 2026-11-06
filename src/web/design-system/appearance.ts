import type { ColorMode } from './tokens.js';

export type Appearance = 'light' | 'dark' | 'system';

// The build embeds this same reader before the application module runs.
export function readAppearance(storageKey: string, fallback: Appearance = 'system'): Appearance {
  try {
    const raw = globalThis.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const saved: unknown = JSON.parse(raw);
    const value = saved && typeof saved === 'object' && 'mode' in saved ? saved.mode : saved;
    return value === 'light' || value === 'dark' || value === 'system' ? value : fallback;
  } catch (error) {
    console.warn('无法读取显示偏好，使用默认设置。', error);
    return fallback;
  }
}

export function saveAppearance(storageKey: string, mode: Appearance) {
  try {
    globalThis.localStorage.setItem(storageKey, JSON.stringify({ mode }));
  } catch (error) {
    console.warn('显示偏好无法保存，本次切换仅在当前页面生效。', error);
  }
}

export function resolveColorMode(preference: Appearance, systemDark: boolean): ColorMode {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}
