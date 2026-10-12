// Nur für Tests: ein `fetch`, der die Supabase-REST/Auth-Endpunkte auf einem MemoryServer nachbildet.
// Die Endpunkte, Header und Fehlercodes sind nach bestem Wissen modelliert und nicht gegen ein echtes
// Projekt geprüft.

import type { MemoryServer } from './memory-transport';
import { ForbiddenError, type WireEvent } from './sync-transport';
import { ADDRESS_DOMAIN } from './synthetic-address';

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

export function createFakeSupabase(server: MemoryServer, origin: string) {
  const requests: RecordedRequest[] = [];
  const control = {
    /** Nächste n Antworten ersetzen: [status, body] */
    failWith: [] as Array<[number, unknown]>,
    offline: false,
  };

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    const headers = Object.fromEntries(
      Object.entries((init?.headers ?? {}) as Record<string, string>),
    );
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url: url.href, method: init?.method ?? 'GET', headers, body });
    if (control.offline) throw new TypeError('Failed to fetch');
    if (url.origin !== origin) throw new TypeError('unexpected host');
    server.calls[url.pathname] = (server.calls[url.pathname] ?? 0) + 1;
    if (server.delayMs > 0) await new Promise((r) => setTimeout(r, server.delayMs));
    const forced = control.failWith.shift();
    if (forced) return json(forced[0], forced[1]);

    const path = url.pathname;
    if (path === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const email = String(body?.email ?? '');
        const user = server.users.find(
          (u) => `${u.username}@${ADDRESS_DOMAIN}` === email && u.password === body?.password,
        );
        if (!user)
          return json(400, { error: 'invalid_grant', error_description: 'secret-body-text' });
        const s = server.issue(user.userId);
        return json(200, {
          access_token: s.accessToken,
          refresh_token: s.refreshToken,
          user: { id: user.userId },
        });
      }
      if (grant === 'refresh_token') {
        const uid = server.refreshTokens.get(String(body?.refresh_token));
        if (!uid)
          return json(400, { error: 'invalid_grant', error_description: 'secret-body-text' });
        server.refreshTokens.delete(String(body?.refresh_token));
        const s = server.issue(uid);
        return json(200, {
          access_token: s.accessToken,
          refresh_token: s.refreshToken,
          user: { id: uid },
        });
      }
      return json(400, { error: 'unsupported_grant_type' });
    }

    // Anonyme Anfrage: nur der Keep-Alive-Pfad liefert (leer) etwas, alles andere ist verboten.
    const auth = headers.Authorization ?? headers.authorization;
    const bearer = auth?.replace(/^Bearer /, '');
    const uid = bearer ? server.accessTokens.get(bearer) : undefined;
    if (path === '/rest/v1/household' && !bearer) return json(200, []);
    if (!uid) return json(401, { message: 'JWT expired secret-body-text' });

    try {
      if (path === '/rest/v1/rpc/household_status') return json(200, server.status(uid));
      if (path === '/rest/v1/rpc/setup_household') {
        server.setup(uid, {
          displayName: body.p_display_name,
          color: body.p_color,
          locale: body.p_locale,
          settings: {
            name: body.p_name,
            placeLabel: body.p_place_label,
            periodStart: body.p_period_start,
            periodEnd: body.p_period_end,
            baseCurrency: 'CAD',
            secondCurrency: 'EUR',
            fxProvider: body.p_fx_provider,
          },
        });
        return new Response(null, { status: 204 });
      }
      if (path === '/rest/v1/rpc/join_household') {
        server.join(uid, {
          displayName: body.p_display_name,
          color: body.p_color,
          locale: body.p_locale,
        });
        return new Response(null, { status: 204 });
      }
      if (path === '/rest/v1/household') {
        if (!server.household || !server.isMember(uid)) return json(200, []);
        const h = server.household;
        return json(200, [
          {
            id: true,
            format_version: h.formatVersion,
            household_id: h.householdId,
            created_at: h.createdAt,
            name: h.settings.name,
            place_label: h.settings.placeLabel,
            period_start: h.settings.periodStart,
            period_end: h.settings.periodEnd,
            base_currency: h.settings.baseCurrency,
            second_currency: h.settings.secondCurrency,
            fx_provider: h.settings.fxProvider,
          },
        ]);
      }
      if (path === '/rest/v1/members') {
        if (!server.isMember(uid)) return json(200, []);
        return json(
          200,
          server.members.map((m) => ({
            user_id: m.userId,
            username: m.username,
            display_name: m.displayName,
            color: m.color,
            locale: m.locale,
            theme: m.theme,
          })),
        );
      }
      if (path === '/rest/v1/events' && (init?.method ?? 'GET') === 'POST') {
        const rows = body as Array<Record<string, unknown>>;
        server.insertEvents(
          uid,
          rows.map(
            (r) =>
              ({
                v: r.v,
                id: r.id,
                hlc: r.hlc,
                device: r.device,
                author: r.author,
                entity: r.entity,
                rowId: r.row_id,
                op: r.op,
                base: r.base,
                ...(r.data === null ? {} : { data: r.data }),
              }) as WireEvent,
          ),
        );
        return new Response(null, { status: 201 });
      }
      if (path === '/rest/v1/events') {
        const after = Number(/^gt\.(\d+)$/.exec(url.searchParams.get('seq') ?? '')?.[1] ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 1000);
        return json(
          200,
          server.selectEvents(uid, after, limit).map((e) => ({
            seq: e.seq,
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
            received_at: '2027-01-01T00:00:00Z',
          })),
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenError)
        return json(403, { code: '42501', message: 'secret-body-text' });
      throw err;
    }
    return json(404, { message: 'not found' });
  };

  return { fetch: fakeFetch as typeof fetch, requests, control };
}
