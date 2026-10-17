import type { Household, HouseholdSettings, MemberColor } from '../household';

export interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/** Ereignis, wie es über die Leitung geht (Spalten in camelCase). Die Leseseite prüft danach mit Zod. */
export interface WireEvent {
  v: number;
  id: string;
  hlc: string;
  device: string;
  author: string;
  entity: string;
  rowId: string;
  op: string;
  base: string[];
  data?: Record<string, unknown>;
}

export type PulledEvent = WireEvent & { seq: number };

export interface HouseholdStatus {
  exists: boolean;
  memberCount: number;
  isMember: boolean;
}

export interface ProfileInput {
  displayName: string;
  color: MemberColor;
  locale: 'de-DE' | 'en-CA';
}

export interface HouseholdInput extends ProfileInput {
  settings: HouseholdSettings;
}

export type HouseholdRow = Household;

export interface SyncTransport {
  /** Bildet intern die synthetische Adresse aus dem Benutzernamen. */
  signIn(username: string, password: string): Promise<Session>;
  /** Löst den Refresh-Token ein (rotiert). Wirft AuthError, wenn das nicht gelingt. */
  refresh(): Promise<Session>;
  /** Auch für Konten, die noch nicht Mitglied sind. */
  getStatus(): Promise<HouseholdStatus>;
  /** null = nicht eingerichtet oder kein Mitglied. */
  getHousehold(): Promise<HouseholdRow | null>;
  createHousehold(input: HouseholdInput): Promise<HouseholdRow>;
  joinHousehold(profile: ProfileInput): Promise<HouseholdRow>;
  /** Idempotent: Duplikate auf `id` werden ignoriert. */
  pushEvents(events: WireEvent[]): Promise<void>;
  pullEvents(afterSeq: number, limit: number): Promise<PulledEvent[]>;
  keepAlive?(): Promise<void>;
}

// Fehlermeldungen sind fest: nie Token, Schlüssel, URL oder Antwortkörper.
export class AuthError extends Error {
  override name = 'AuthError';
  constructor() {
    super('Authentication failed');
  }
}

export class ForbiddenError extends Error {
  override name = 'ForbiddenError';
  constructor() {
    super('Access denied');
  }
}

export class RateLimitError extends Error {
  override name = 'RateLimitError';
  /** Zeitpunkt, ab dem wieder Anfragen möglich sind (oder null, wenn unbekannt). */
  readonly resetAt: Date | null;
  constructor(resetAt: Date | null = null) {
    super('Rate limit exceeded');
    this.resetAt = resetAt;
  }
}

export class NetworkError extends Error {
  override name = 'NetworkError';
  constructor() {
    super('Network unavailable');
  }
}

export class ServerError extends Error {
  override name = 'ServerError';
  /** Nur der Statuscode, nie der Körper. */
  readonly status: number;
  constructor(status = 500) {
    super('Server error');
    this.status = status;
  }
}
