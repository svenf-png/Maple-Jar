import {
  AuthError,
  NetworkError,
  NoAccessError,
  RateLimitError,
} from '../../data/remote/remote-store';
import { getLang, localeOf, t } from '../../i18n/t';

/** Wandelt Fehler der Remote-Schicht in Texte um. Nie Token oder Rohfehler ausgeben. */
export function remoteErrorMessage(err: unknown): string {
  if (err instanceof AuthError) return t('connect.error.auth');
  if (err instanceof NoAccessError) return t('connect.error.noAccess');
  if (err instanceof RateLimitError) {
    const time = err.resetAt
      ? new Intl.DateTimeFormat(localeOf(getLang()), { hour: '2-digit', minute: '2-digit' }).format(
          err.resetAt,
        )
      : '?';
    return t('connect.error.rateLimit', { time });
  }
  if (err instanceof NetworkError) return t('connect.error.network');
  return t('connect.error.unknown');
}
