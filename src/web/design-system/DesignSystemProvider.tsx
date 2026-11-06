import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { MotionConfig, useReducedMotion } from 'motion/react';
import { createAntdTheme } from './antd-theme.js';
import { readAppearance, saveAppearance, type Appearance } from './appearance.js';
import { installTheme, themes, type ColorMode } from './tokens.js';
import './global.css';

const AppearanceContext = createContext<{
  preference: Appearance;
  mode: ColorMode;
  setPreference: (value: Appearance) => void;
} | null>(null);

export function DesignSystemProvider({
  children,
  storageKey = themes.preferences.applicationKey,
}: {
  children: ReactNode;
  storageKey?: string;
}) {
  const [preference, setPreference] = useState<Appearance>(() => readAppearance(storageKey));
  const mode = preference;
  const reduced = Boolean(useReducedMotion());
  useLayoutEffect(() => {
    installTheme(mode);
  }, [mode]);
  useEffect(() => {
    saveAppearance(storageKey, preference);
  }, [storageKey, preference]);
  const theme = useMemo(() => createAntdTheme(mode, reduced), [mode, reduced]);
  return (
    <AppearanceContext.Provider value={{ preference, mode, setPreference }}>
      <ConfigProvider locale={zhCN} theme={theme} wave={{ disabled: true }}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </ConfigProvider>
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('显示设置必须位于全局设计系统内');
  return value;
}
