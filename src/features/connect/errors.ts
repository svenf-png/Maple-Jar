import {
  AuthError,
  ForbiddenError,
  NetworkError,
  RateLimitError,
  ServerError,
} from '../../data/remote/sync-transport';
import { getLang, localeOf, t } from '../../i18n/t';

/** Wandelt Fehler der Remote-Schicht in Texte um. Nie Token, Schlüssel, URL oder Rohfehler ausgeben. */
export function remoteErrorMessage(err: unknown): string {
  if (err instanceof AuthError) return t('connect.error.auth');
  if (err instanceof ForbiddenError) return t('connect.error.forbidden');
  if (err instanceof RateLimitError) {
    const time = err.resetAt
      ? new Intl.DateTimeFormat(localeOf(getLang()), { hour: '2-digit', minute: '2-digit' }).format(
          err.resetAt,
        )
      : '?';
    return t('connect.error.rateLimit', { time });
  }
  if (err instanceof NetworkError) return t('connect.error.network');
  if (err instanceof ServerError) return t('connect.error.server');
  return t('connect.error.unknown');
}
