import { householdSchema } from '../household-schema';
import { parseProjectUrl } from './project-url';
import {
  AuthError,
  ForbiddenError,
  type HouseholdInput,
  type HouseholdRow,
  type HouseholdStatus,
  NetworkError,
  type ProfileInput,
  type PulledEvent,
  RateLimitError,
  ServerError,
  type Session,
  type SyncTransport,
  type WireEvent,
} from './sync-transport';
import { syntheticAddress } from './synthetic-address';

export interface SupabaseTransportOptions {
  /** Muss `parseProjectUrl` bestehen. */
  projectUrl: string;
  anonKey: string;
  tokens?: { accessToken: string; refreshToken: string } | null;
  /** Wird nach jedem neuen Tokenpaar aufgerufen und abgewartet (Refresh-Token rotiert, sofort persistieren). */
  onTokens?: (tokens: {
    accessToken: string;
    refreshToken: string;
    userId: string;
  }) => Promise<void>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  /** false: nur apikey, kein Zugriffstoken (Auth-Endpunkte, Keep-Alive). */
  auth?: boolean;
}

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export class SupabaseTransport implements SyncTransport {
  readonly #origin: string;
  readonly #anonKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #onTokens: SupabaseTransportOptions['onTokens'];
  #tokens: { accessToken: string; refreshToken: string } | null;
  #refreshing: Promise<Session> | null = null;

  constructor(options: SupabaseTransportOptions) {
    const origin = parseProjectUrl(options.projectUrl);
    if (!origin) throw new Error('Invalid project URL');
    this.#origin = origin;
    this.#anonKey = options.anonKey;
    this.#fetch = options.fetchImpl ?? ((...args) => fetch(...args));
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#onTokens = options.onTokens;
    this.#tokens = options.tokens ?? null;
  }

  async #send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
    const headers: Record<string, string> = {
      apikey: this.#anonKey,
      Accept: 'application/json',
      ...opts.headers,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      // Immer relativ zum geprüften Projekt-Origin: kein anderer Host ist möglich.
      return await this.#fetch(`${this.#origin}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
        signal: controller.signal,
        credentials: 'omit',
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }
  }

  static #statusError(res: Response): Error {
    if (res.status === 401) return new AuthError();
    if (res.status === 403) return new ForbiddenError();
    if (res.status === 429) {
      const after = Number(res.headers.get('retry-after'));
      return new RateLimitError(
        Number.isFinite(after) && after > 0 ? new Date(Date.now() + after * 1000) : null,
      );
    }
    return new ServerError(res.status);
  }

  /** Anfrage mit Zugriffstoken: bei 401 einmal erneuern und wiederholen, dann AuthError. */
  async #authed(path: string, opts: RequestOptions = {}): Promise<Response> {
    const first = this.#tokens;
    if (!first) throw new AuthError();
    let res = await this.#send(path, opts, first.accessToken);
    if (res.status === 401) {
      // Hat ein paralleler Aufruf schon erneuert, genügt die Wiederholung mit dem neuen Token.
      if (this.#tokens?.accessToken === first.accessToken) await this.refresh();
      const next = this.#tokens;
      if (!next) throw new AuthError();
      res = await this.#send(path, opts, next.accessToken);
    }
    if (!res.ok) throw SupabaseTransport.#statusError(res);
    return res;
  }

  async #json(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      throw new ServerError(res.status);
    }
  }

  async #adopt(res: Response): Promise<Session> {
    const body = asRecord(await this.#json(res));
    const accessToken = body.access_token;
    const refreshToken = body.refresh_token;
    const userId = asRecord(body.user).id;
    if (
      typeof accessToken !== 'string' ||
      typeof refreshToken !== 'string' ||
      typeof userId !== 'string'
    ) {
      throw new ServerError(res.status);
    }
    this.#tokens = { accessToken, refreshToken };
    // Rotierten Refresh-Token sofort sichern, bevor irgendein anderer Aufruf ihn braucht.
    await this.#onTokens?.({ accessToken, refreshToken, userId });
    return { accessToken, refreshToken, userId };
  }

  async signIn(username: string, password: string): Promise<Session> {
    const res = await this.#send(
      '/auth/v1/token?grant_type=password',
      { method: 'POST', body: { email: syntheticAddress(username), password } },
      null,
    );
    if (res.status === 400 || res.status === 401 || res.status === 422) throw new AuthError();
    if (!res.ok) throw SupabaseTransport.#statusError(res);
    return this.#adopt(res);
  }

  refresh(): Promise<Session> {
    // Parallele Aufrufe teilen sich einen Refresh, sonst verbrauchen sie sich gegenseitig.
    this.#refreshing ??= this.#doRefresh().finally(() => {
      this.#refreshing = null;
    });
    return this.#refreshing;
  }

  async #doRefresh(): Promise<Session> {
    const current = this.#tokens;
    if (!current) throw new AuthError();
    const res = await this.#send(
      '/auth/v1/token?grant_type=refresh_token',
      { method: 'POST', body: { refresh_token: current.refreshToken } },
      null,
    );
    if (res.status >= 400 && res.status < 500 && res.status !== 429) throw new AuthError();
    if (!res.ok) throw SupabaseTransport.#statusError(res);
    return this.#adopt(res);
  }

  async getStatus(): Promise<HouseholdStatus> {
    const res = await this.#authed('/rest/v1/rpc/household_status', { method: 'POST', body: {} });
    const body = asRecord(await this.#json(res));
    if (
      typeof body.exists !== 'boolean' ||
      typeof body.memberCount !== 'number' ||
      typeof body.isMember !== 'boolean'
    ) {
      throw new ServerError(res.status);
    }
    return { exists: body.exists, memberCount: body.memberCount, isMember: body.isMember };
  }

  async getHousehold(): Promise<HouseholdRow | null> {
    const hRes = await this.#authed('/rest/v1/household?select=*');
    const rows: unknown = await this.#json(hRes);
    if (!Array.isArray(rows)) throw new ServerError(hRes.status);
    if (rows.length === 0) return null;
    const row = asRecord(rows[0]);
    const mRes = await this.#authed('/rest/v1/members?select=*&order=created_at.asc');
    const memberRows: unknown = await this.#json(mRes);
    if (!Array.isArray(memberRows)) throw new ServerError(mRes.status);
    const candidate = {
      formatVersion: row.format_version,
      householdId: row.household_id,
      createdAt: row.created_at,
      settings: {
        name: row.name,
        placeLabel: row.place_label ?? null,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        baseCurrency: row.base_currency,
        secondCurrency: row.second_currency,
        fxProvider: row.fx_provider,
      },
      members: memberRows.map((m) => {
        const r = asRecord(m);
        return {
          userId: r.user_id,
          username: r.username,
          displayName: r.display_name,
          color: r.color,
          locale: r.locale,
          theme: r.theme,
        };
      }),
    };
    const parsed = householdSchema.safeParse(candidate);
    if (!parsed.success) throw new ServerError(hRes.status);
    return parsed.data;
  }

  async #requireHousehold(): Promise<HouseholdRow> {
    const household = await this.getHousehold();
    if (!household) throw new ForbiddenError();
    return household;
  }

  async createHousehold(input: HouseholdInput): Promise<HouseholdRow> {
    const s = input.settings;
    await this.#authed('/rest/v1/rpc/setup_household', {
      method: 'POST',
      body: {
        p_name: s.name,
        p_place_label: s.placeLabel,
        p_period_start: s.periodStart,
        p_period_end: s.periodEnd,
        p_fx_provider: s.fxProvider,
        p_display_name: input.displayName,
        p_color: input.color,
        p_locale: input.locale,
      },
    });
    return this.#requireHousehold();
  }

  async joinHousehold(profile: ProfileInput): Promise<HouseholdRow> {
    await this.#authed('/rest/v1/rpc/join_household', {
      method: 'POST',
      body: {
        p_display_name: profile.displayName,
        p_color: profile.color,
        p_locale: profile.locale,
      },
    });
    return this.#requireHousehold();
  }

  async pushEvents(events: WireEvent[]): Promise<void> {
    if (events.length === 0) return;
    // ignore-duplicates entspricht ON CONFLICT DO NOTHING: Wiederholen ist immer sicher.
    await this.#authed('/rest/v1/events?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: events.map((e) => ({
        id: e.id,
        v: e.v,
        hlc: e.hlc,
        device: e.device,
        author: e.author,
        entity: e.entity,
        row_id: e.rowId,
        op: e.op,
        base: e.base,
        data: e.data ?? null,
      })),
    });
  }

  async pullEvents(afterSeq: number, limit: number): Promise<PulledEvent[]> {
    const q = `select=*&seq=gt.${Math.trunc(afterSeq)}&order=seq.asc&limit=${Math.trunc(limit)}`;
    const res = await this.#authed(`/rest/v1/events?${q}`);
    const rows: unknown = await this.#json(res);
    if (!Array.isArray(rows)) throw new ServerError(res.status);
    return rows.map((raw) => {
      const r = asRecord(raw);
      if (typeof r.seq !== 'number') throw new ServerError(res.status);
      // Typen werden erst in der Pull-Schicht per Zod geprüft; ungültige Ereignisse werden dort geparkt.
      return {
        seq: r.seq,
        id: r.id,
        v: r.v,
        hlc: r.hlc,
        device: r.device,
        author: r.author,
        entity: r.entity,
        rowId: r.row_id,
        op: r.op,
        base: r.base,
        ...(r.data === null || r.data === undefined ? {} : { data: r.data }),
      } as PulledEvent;
    });
  }

  async keepAlive(): Promise<void> {
    // Lesender Aufruf ohne Anmeldung; RLS liefert leer, die Datenbank wird trotzdem angefragt.
    const res = await this.#send('/rest/v1/household?select=id&limit=1', {}, null);
    if (!res.ok) throw SupabaseTransport.#statusError(res);
  }
}
