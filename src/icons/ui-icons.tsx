import { IconBase, type IconProps } from './icon-base';

const W = 1.8;

export const OverviewIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={W}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </IconBase>
);

export const HistoryIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={W}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </IconBase>
);

export const PlanningIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={W}>
    <path d="M4 4v16h16" />
    <path d="M8 14l3.5-3.5 3 3L20 8" />
  </IconBase>
);

export const SettingsIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={W}>
    <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="17" r="2" />
  </IconBase>
);

export const PlusIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={2.4}>
    <path d="M12 5v14M5 12h14" />
  </IconBase>
);

export const CheckIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={2.4}>
    <path d="M5 12l5 5L20 7" />
  </IconBase>
);

export const WarnIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={W}>
    <path d="M12 4L2.8 19.5h18.4z" />
    <path d="M12 10v4M12 17v.2" />
  </IconBase>
);

export const InfoIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={W}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2-2.4 3.4M12 17v.2" />
  </IconBase>
);

export const CloudUpIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={W}>
    <path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.6 4.6 4.6 0 0 1 17.5 18z" />
    <path d="M12 16v-5M9.8 13l2.2-2.2 2.2 2.2" />
  </IconBase>
);

export const CloudOkIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={W}>
    <path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.6 4.6 4.6 0 0 1 17.5 18z" />
    <path d="M9.5 13l2 2 3.5-3.5" />
  </IconBase>
);

export const ChevronRightIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={W}>
    <path d="M9 6l6 6-6 6" />
  </IconBase>
);

export const KeyIcon = (p: IconProps) => (
  <IconBase {...p} strokeWidth={W}>
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h9M18 12v3M21 12v2" />
  </IconBase>
);
