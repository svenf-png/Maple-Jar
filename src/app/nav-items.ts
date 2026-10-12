import type { ComponentType } from 'react';
import type { MessageKey } from '../i18n/de';
import type { IconProps } from '../icons/icon-base';
import { HistoryIcon, OverviewIcon, PlanningIcon, SettingsIcon } from '../icons/ui-icons';

export interface NavItem {
  to: string;
  label: MessageKey;
  icon: ComponentType<IconProps>;
  end?: boolean;
}

export const navItems: readonly NavItem[] = [
  { to: '/', label: 'nav.overview', icon: OverviewIcon, end: true },
  { to: '/verlauf', label: 'nav.history', icon: HistoryIcon },
  { to: '/planung', label: 'nav.planning', icon: PlanningIcon },
  { to: '/einstellungen', label: 'nav.settings', icon: SettingsIcon },
];
