import { db, getMeta } from './db';
import { parseProjectUrl } from './remote/project-url';

/** Zugang zum Supabase-Projekt, den die App für die Anmeldung braucht (kein Passwort, kein Token). */
export interface ProjectConfig {
  projectUrl: string;
  anonKey: string;
}

const PENDING_KEY = 'pendingProject';
const MAX_KEY_LENGTH = 4096;

/**
 * Einrichtungslink: `<Basis>#/verbinden?u=<Projekt-URL>&k=<Schlüssel>`. Das Fragment verlässt den Browser nie
 * (kein Referer, kein Server-Log). Die App speichert die Werte und entfernt das Fragment sofort.
 */
export function buildSetupLink(base: string, config: ProjectConfig): string {
  const query = new URLSearchParams({ u: config.projectUrl, k: config.anonKey });
  return `${base}#/verbinden?${query.toString()}`;
}

/**
 * Liest einen Einrichtungslink, ein Hash-Fragment (`#/verbinden?u=…&k=…`) oder eine reine Query (`?u=…&k=…`).
 * Gültig nur mit Projekt-URL im Format `https://<ref>.supabase.co` und einem nicht leeren Schlüssel ohne Leerraum.
 */
export function parseSetupLink(input: string): ProjectConfig | null {
  const text = input.trim();
  const hash = text.indexOf('#');
  const rest = hash >= 0 ? text.slice(hash) : text;
  const q = rest.indexOf('?');
  if (q < 0) return null;
  const params = new URLSearchParams(rest.slice(q + 1));
  const projectUrl = parseProjectUrl(params.get('u') ?? '');
  const anonKey = (params.get('k') ?? '').trim();
  if (!projectUrl || !anonKey) return null;
  if (anonKey.length > MAX_KEY_LENGTH || /\s/.test(anonKey)) return null;
  return { projectUrl, anonKey };
}

/** Anzeigename des Projekts für die Bestätigung (Host ohne Schema). */
export const projectHost = (projectUrl: string): string => new URL(projectUrl).hostname;

/** Vor der Anmeldung gespeicherter Zugang (aus Link oder Einfügen); nach der Anmeldung führend sind `projectUrl`/`anonKey`. */
export async function loadPendingProject(): Promise<ProjectConfig | null> {
  const value = await getMeta<ProjectConfig>(PENDING_KEY);
  if (!value) return null;
  const projectUrl = parseProjectUrl(value.projectUrl);
  return projectUrl && value.anonKey ? { projectUrl, anonKey: value.anonKey } : null;
}

export const savePendingProject = (config: ProjectConfig): Promise<unknown> =>
  db.meta.put({ key: PENDING_KEY, value: config });

export const clearPendingProject = (): Promise<void> => db.meta.delete(PENDING_KEY);

/** Gespeicherter Zugang eines verbundenen Geräts, z. B. um einen Link für das nächste Gerät zu erzeugen. */
export async function loadConnectedProject(): Promise<ProjectConfig | null> {
  const [projectUrl, anonKey] = await Promise.all([
    getMeta<string>('projectUrl'),
    getMeta<string>('anonKey'),
  ]);
  return projectUrl && anonKey ? { projectUrl, anonKey } : null;
}
