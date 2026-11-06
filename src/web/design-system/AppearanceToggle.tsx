import { Button } from 'antd';
import { useIconHover } from '@animateicons/react';
import { SunIcon } from '@animateicons/react/lucide/sun-icon';
import { MoonIcon } from '@animateicons/react/lucide/moon-icon';
import { useAppearance } from './DesignSystemProvider.js';
import { foundations } from './tokens.js';

export function AppearanceToggle() {
  const { preference, setPreference } = useAppearance();
  const { ref, triggerProps } = useIconHover();
  const dark = preference === 'dark';
  const Icon = dark ? MoonIcon : SunIcon;
  const label = dark ? '切换到浅色' : '切换到深色';
  return (
    <Button
      {...triggerProps}
      type="text"
      className="appearance-trigger"
      aria-label={label}
      onFocus={() => triggerProps.onMouseEnter?.()}
      onBlur={() => triggerProps.onMouseLeave?.()}
      onClick={() => setPreference(dark ? 'light' : 'dark')}
      icon={
        <Icon
          key={preference}
          ref={ref}
          className="ds-icon"
          size={foundations.size.standaloneIcon}
          aria-hidden="true"
        />
      }
    />
  );
}
