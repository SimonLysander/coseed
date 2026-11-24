import { Button } from 'antd';
import { useEffect, useRef } from 'react';
import { SunIcon, type SunIconHandle } from '@animateicons/react/lucide/sun-icon';
import { MoonIcon } from '@animateicons/react/lucide/moon-icon';
import { useAppearance } from './DesignSystemProvider.js';
import { foundations } from './tokens.js';

export function AppearanceToggle() {
  const { preference, setPreference } = useAppearance();
  const ref = useRef<SunIconHandle>(null);
  const previous = useRef(preference);
  useEffect(() => {
    if (previous.current !== preference) {
      previous.current = preference;
      ref.current?.startAnimation();
    }
  }, [preference]);
  const dark = preference === 'dark';
  const Icon = dark ? MoonIcon : SunIcon;
  const label = dark ? '切换到浅色' : '切换到深色';
  return (
    <Button
      type="text"
      className="ds-nav-item appearance-trigger"
      aria-label={label}
      onClick={() => setPreference(dark ? 'light' : 'dark')}
      icon={
        <Icon
          key={preference}
          ref={ref}
          isAnimated={false}
          className="ds-icon"
          size={foundations.size.navIcon}
          aria-hidden="true"
        />
      }
    >
      <span className="appearance-label">{dark ? '深色模式' : '浅色模式'}</span>
    </Button>
  );
}
