import { describe, expect, it } from 'vitest';
import { buildSetupLink, parseSetupLink, projectHost } from './setup-link';

const config = { projectUrl: 'https://example-ref.supabase.co', anonKey: 'public-key-a.b_c' };

describe('Einrichtungslink', () => {
  it('Rundlauf: bauen und lesen', () => {
    const link = buildSetupLink('https://app.example/maple-jar/', config);
    expect(link.startsWith('https://app.example/maple-jar/#/verbinden?')).toBe(true);
    expect(parseSetupLink(link)).toEqual(config);
  });

  it('liest Hash-Fragment und reine Query', () => {
    const link = buildSetupLink('https://app.example/', config);
    expect(parseSetupLink(link.slice(link.indexOf('#')))).toEqual(config);
    expect(parseSetupLink(link.slice(link.indexOf('?')))).toEqual(config);
  });

  it('toleriert Leerraum um den eingefügten Link', () => {
    expect(parseSetupLink(`  ${buildSetupLink('https://app.example/', config)}\n`)).toEqual(config);
  });

  it('lehnt fremde Hosts, Nicht-HTTPS und Pfade ab', () => {
    for (const u of [
      'https://evil.example.com',
      'http://example-ref.supabase.co',
      'https://example-ref.supabase.co/rest/v1',
      'https://example-ref.supabase.co.evil.example',
    ]) {
      expect(parseSetupLink(`#/verbinden?u=${encodeURIComponent(u)}&k=x`), u).toBeNull();
    }
  });

  it('lehnt fehlenden, leeren, zu langen oder Leerraum enthaltenden Schlüssel ab', () => {
    const u = encodeURIComponent(config.projectUrl);
    expect(parseSetupLink(`#/verbinden?u=${u}`)).toBeNull();
    expect(parseSetupLink(`#/verbinden?u=${u}&k=`)).toBeNull();
    expect(parseSetupLink(`#/verbinden?u=${u}&k=${'a'.repeat(5000)}`)).toBeNull();
    expect(parseSetupLink(`#/verbinden?u=${u}&k=a%20b`)).toBeNull();
  });

  it('lehnt Text ohne Query ab', () => {
    expect(parseSetupLink('')).toBeNull();
    expect(parseSetupLink('hallo')).toBeNull();
    expect(parseSetupLink('#/verbinden')).toBeNull();
  });

  it('zeigt nur den Host', () => {
    expect(projectHost(config.projectUrl)).toBe('example-ref.supabase.co');
  });
});
