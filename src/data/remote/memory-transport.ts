import { type HouseholdMember, normalizeUsername } from '../household';
import {
  AuthError,
  ForbiddenError,
  type HouseholdInput,
  type HouseholdRow,
  type HouseholdStatus,
  NetworkError,
  type ProfileInput,
  type PulledEvent,
  type Session,
  type SyncTransport,
  type WireEvent,
} from './sync-transport';

export interface MemoryUser {
  username: string;
  password: string;
  userId: string;
}

/** Simulierter Server (Konten, Haushalt, Ereignisprotokoll mit RLS-ähnlichen Prüfungen). Für Tests und E2E. */
export class MemoryServer {
  readonly users: MemoryUser[];
  household: Omit<HouseholdRow, 'members'> | null = null;
  members: HouseholdMember[] = [];
  readonly events: PulledEvent[] = [];
  #seq = 0;
  #tokenCounter = 0;
  readonly accessTokens = new Map<string, string>();
  readonly refreshTokens = new Map<string, string>();
  /** Verzögerung je Aufruf in ms (simuliert langsames Netz). */
  delayMs = 0;
  /** Anzahl Aufrufe je Methode, für Tests. */
  readonly calls: Record<string, number> = {};

  constructor(users: MemoryUser[]) {
    this.users = users;
  }

  client(): MemoryTransport {
    return new MemoryTransport(this);
  }

  issue(userId: string): Session {
    const n = ++this.#tokenCounter;
    const accessToken = `access-${n}`;
    const refreshToken = `refresh-${n}`;
    this.accessTokens.set(accessToken, userId);
    this.refreshTokens.set(refreshToken, userId);
    return { accessToken, refreshToken, userId };
  }

  nextSeq(): number {
    return ++this.#seq;
  }

  /** Alle ausgegebenen Zugriffstoken ungültig machen (Refresh-Token bleiben gültig). */
  expireAccessTokens(): void {
    this.accessTokens.clear();
  }

  /** Auch Refresh-Token ungültig: Anmeldung muss erneuert werden. */
  revokeSessions(): void {
    this.accessTokens.clear();
    this.refreshTokens.clear();
  }

  // --- Serverseitige Operationen (RLS-ähnliche Prüfungen), gemeinsam für MemoryTransport und den Fetch-Fake ---

  isMember(uid: string): boolean {
    return this.members.some((m) => m.userId === uid);
  }

  status(uid: string): HouseholdStatus {
    return {
      exists: this.household !== null,
      memberCount: this.members.length,
      isMember: this.isMember(uid),
    };
  }

  usernameOf(uid: string): string {
    return this.users.find((u) => u.userId === uid)?.username ?? 'unknown';
  }

  #newMember(uid: string, p: ProfileInput): HouseholdMember {
    return {
      userId: uid,
      username: this.usernameOf(uid),
      displayName: p.displayName,
      color: p.color,
      locale: p.locale,
      theme: 'auto',
    };
  }

  setup(uid: string, input: HouseholdInput): void {
    if (this.household) throw new ForbiddenError();
    this.household = {
      formatVersion: 1,
      householdId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      settings: input.settings,
    };
    this.members = [this.#newMember(uid, input)];
  }

  join(uid: string, profile: ProfileInput): void {
    if (!this.household || this.members.length >= 2 || this.isMember(uid))
      throw new ForbiddenError();
    this.members.push(this.#newMember(uid, profile));
  }

  insertEvents(uid: string, events: WireEvent[]): void {
    if (!this.isMember(uid)) throw new ForbiddenError();
    if (events.some((e) => e.author !== uid)) throw new ForbiddenError();
    for (const e of events) {
      if (this.events.some((x) => x.id === e.id)) continue; // Duplikate ignorieren
      this.events.push({ ...structuredClone(e), seq: this.nextSeq() });
    }
  }

  selectEvents(uid: string, afterSeq: number, limit: number): PulledEvent[] {
    if (!this.isMember(uid)) throw new ForbiddenError();
    return this.events
      .filter((e) => e.seq > afterSeq)
      .slice(0, limit)
      .map((e) => structuredClone(e));
  }

  snapshot(): HouseholdRow | null {
    return this.household ? { ...this.household, members: [...this.members] } : null;
  }
}

export class MemoryTransport implements SyncTransport {
  readonly #server: MemoryServer;
  #session: Session | null = null;
  #offline = false;
  #failNext: Error[] = [];

  constructor(server: MemoryServer, session: Session | null = null) {
    this.#server = server;
    this.#session = session;
  }

  setOffline(offline: boolean): void {
    this.#offline = offline;
  }

  /** Der nächste Aufruf wirft diesen Fehler. */
  failNext(err: Error): void {
    this.#failNext.push(err);
  }

  /** Übernimmt eine bereits ausgestellte Sitzung (Neustart der Seite im Testmodus). */
  adopt(session: Session): void {
    this.#session = session;
  }

  get session(): Session | null {
    return this.#session;
  }

  async #enter(name: string, needsAuth = true): Promise<string | null> {
    this.#server.calls[name] = (this.#server.calls[name] ?? 0) + 1;
    if (this.#offline) throw new NetworkError();
    if (this.#server.delayMs > 0) await new Promise((r) => setTimeout(r, this.#server.delayMs));
    const failure = this.#failNext.shift();
    if (failure) throw failure;
    if (!needsAuth) return null;
    const uid = this.#session ? this.#server.accessTokens.get(this.#session.accessToken) : null;
    if (uid) return uid;
    // Zugriffstoken abgelaufen: wie der echte Client einmal erneuern.
    if (this.#session) {
      try {
        await this.refresh();
        const again = this.#session
          ? this.#server.accessTokens.get(this.#session.accessToken)
          : null;
        if (again) return again;
      } catch (err) {
        if (!(err instanceof AuthError)) throw err;
      }
    }
    throw new AuthError();
  }

  async signIn(username: string, password: string): Promise<Session> {
    await this.#enter('signIn', false);
    const user = this.#server.users.find(
      (u) => u.username === normalizeUsername(username) && u.password === password,
    );
    if (!user) throw new AuthError();
    this.#session = this.#server.issue(user.userId);
    return this.#session;
  }

  async refresh(): Promise<Session> {
    this.#server.calls.refresh = (this.#server.calls.refresh ?? 0) + 1;
    if (this.#offline) throw new NetworkError();
    const token = this.#session?.refreshToken;
    const uid = token ? this.#server.refreshTokens.get(token) : undefined;
    if (!token || !uid) throw new AuthError();
    this.#server.refreshTokens.delete(token); // Rotation: der alte Token ist verbraucht
    this.#session = this.#server.issue(uid);
    return this.#session;
  }

  async getStatus(): Promise<HouseholdStatus> {
    return this.#server.status((await this.#enter('getStatus')) as string);
  }

  async getHousehold(): Promise<HouseholdRow | null> {
    const uid = (await this.#enter('getHousehold')) as string;
    return this.#server.isMember(uid) ? this.#server.snapshot() : null;
  }

  async createHousehold(input: HouseholdInput): Promise<HouseholdRow> {
    this.#server.setup((await this.#enter('createHousehold')) as string, input);
    return this.#server.snapshot() as HouseholdRow;
  }

  async joinHousehold(profile: ProfileInput): Promise<HouseholdRow> {
    this.#server.join((await this.#enter('joinHousehold')) as string, profile);
    return this.#server.snapshot() as HouseholdRow;
  }

  async pushEvents(events: WireEvent[]): Promise<void> {
    this.#server.insertEvents((await this.#enter('pushEvents')) as string, events);
  }

  async pullEvents(afterSeq: number, limit: number): Promise<PulledEvent[]> {
    return this.#server.selectEvents((await this.#enter('pullEvents')) as string, afterSeq, limit);
  }

  async keepAlive(): Promise<void> {
    await this.#enter('keepAlive', false);
  }
}
