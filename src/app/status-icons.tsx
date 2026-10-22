import { IconBase, type IconProps } from '../icons/icon-base';

/** Offline-Symbol: Wlan-Bögen mit Diagonale (Status nie nur über Farbe). */
export const WifiOffIcon = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M5 12.5a10 10 0 0 1 4-2.3" />
    <path d="M8.5 16a5 5 0 0 1 7 0" />
    <path d="M12 19.5h.01" />
    <path d="M4 4l16 16" />
  </IconBase>
);
