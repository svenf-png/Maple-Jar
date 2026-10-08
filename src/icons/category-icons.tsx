import type { ComponentType } from 'react';
import { IconBase, type IconProps } from './icon-base';

const Lebensmittel = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M3 4h2l2.4 11h10.2L20 7H6.2" />
    <circle cx="9" cy="19.5" r="1.5" />
    <circle cx="17" cy="19.5" r="1.5" />
  </IconBase>
);

const Restaurant = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />
    <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
    <path d="M8 3.5v2.5M12 3.5v2.5" />
  </IconBase>
);

const Haushalt = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M4 11l8-7 8 7v9H4z" />
    <path d="M10 20v-5h4v5" />
  </IconBase>
);

const Freizeit = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M2.5 20l6.5-11 4 6.5 3-4 5.5 8.5z" />
    <circle cx="17" cy="5.5" r="2" />
  </IconBase>
);

const Reisen = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M10.5 13.5L3 10.5l2-2 7 1.5 4.5-4.5c1-1 2.6-1.2 3.4-.4s.6 2.4-.4 3.4L15 13l1.5 7-2 2-3-7.5" />
  </IconBase>
);

const Kleidung = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M8.5 3.5L3 6.5l2 4.2 3-1.2V20h8V9.5l3 1.2 2-4.2-5.5-3a3.5 3.5 0 0 1-7 0z" />
  </IconBase>
);

const Gesundheit = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />
    <path d="M8.5 12h2l1-2 1.5 4 1-2h1.5" />
  </IconBase>
);

const Mobilitaet = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="5" y="3" width="14" height="15" rx="3" />
    <path d="M5 11h14M8 21v-3M16 21v-3" />
    <circle cx="8.5" cy="14.5" r=".6" fill="currentColor" />
    <circle cx="15.5" cy="14.5" r=".6" fill="currentColor" />
  </IconBase>
);

const Kommunikation = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  </IconBase>
);

const Geschenke = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="4" y="10" width="16" height="10.5" rx="1.5" />
    <path d="M3 10h18M12 10v10.5" />
    <path d="M12 10c-1.6-3.6-5.6-4.2-5.6-1.8C6.4 9.7 9 10 12 10zM12 10c1.6-3.6 5.6-4.2 5.6-1.8 0 1.5-2.6 1.8-5.6 1.8z" />
  </IconBase>
);

const Sonstiges = (p: IconProps) => (
  <IconBase {...p}>
    <circle cx="6" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="18" cy="12" r="1.4" fill="currentColor" />
  </IconBase>
);

const Streaming = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="3" y="5" width="18" height="13" rx="2.5" />
    <path d="M10.5 9l4 2.5-4 2.5z" />
    <path d="M8 21h8" />
  </IconBase>
);

const Sparplan = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </IconBase>
);

const Gehalt = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M6 9.5v5M18 9.5v5" />
  </IconBase>
);

const Schild = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M12 3l7.5 3v6c0 4.8-3.3 7.8-7.5 9-4.2-1.2-7.5-4.2-7.5-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </IconBase>
);

const Sonne = (p: IconProps) => (
  <IconBase {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </IconBase>
);

const Koffer = (p: IconProps) => (
  <IconBase {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <path d="M9 7V4.5h6V7M8 7v13M16 7v13" />
  </IconBase>
);

const Winter = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M12 2.5v19M4 7l16 10M20 7L4 17" />
    <path d="M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2" />
  </IconBase>
);

export const categoryIcons = {
  lebensmittel: Lebensmittel,
  restaurant: Restaurant,
  haushalt: Haushalt,
  freizeit: Freizeit,
  reisen: Reisen,
  kleidung: Kleidung,
  gesundheit: Gesundheit,
  mobilitaet: Mobilitaet,
  kommunikation: Kommunikation,
  geschenke: Geschenke,
  sonstiges: Sonstiges,
  streaming: Streaming,
  sparplan: Sparplan,
  gehalt: Gehalt,
  schild: Schild,
  sonne: Sonne,
  koffer: Koffer,
  winter: Winter,
} as const satisfies Record<string, ComponentType<IconProps>>;

export type CategoryIconKey = keyof typeof categoryIcons;
