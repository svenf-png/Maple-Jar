import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeGitHub } from './fake-github';
import { GitHubStore } from './github-store';
import { MemoryStore } from './memory-store';
import { ConflictError, NoAccessError, type RemoteStore } from './remote-store';

interface Setup {
  store: RemoteStore;
}

const TOKEN = 'test-token-value';
const TEXT = 'Grüße aus dem Test: äöüß 🍁 — Zeile 2\n';

const implementations: Array<{
  name: string;
  create: (files: Record<string, string>, accessible: boolean) => Setup;
}> = [
  {
    name: 'MemoryStore',
    create: (files, accessible) => ({ store: new MemoryStore({ files, accessible }) }),
  },
  {
    name: 'GitHubStore (gemocktes fetch)',
    create: (files, accessible) => {
      const fake = createFakeGitHub({ token: TOKEN, files, repoAccessible: accessible });
      vi.stubGlobal('fetch', fake.fetch);
      return { store: new GitHubStore('org-x/repo-y', TOKEN) };
    },
  },
];

afterEach(() => vi.unstubAllGlobals());

describe.each(implementations)('RemoteStore-Vertrag: $name', ({ create }) => {
  let store: RemoteStore;
  const setup = (files: Record<string, string> = {}, accessible = true) => {
    store = create(files, accessible).store;
  };
  beforeEach(() => setup());

  it('whoAmI liefert den Login', async () => {
    expect((await store.whoAmI()).login).toBe('person-a');
  });

  it('checkRepoAccess wirft NoAccessError ohne Zugriff', async () => {
    setup({}, false);
    await expect(store.checkRepoAccess()).rejects.toBeInstanceOf(NoAccessError);
  });

  it('checkRepoAccess ist mit Zugriff erfolgreich', async () => {
    await expect(store.checkRepoAccess()).resolves.toBeUndefined();
  });

  it('readFile liefert null für fehlende Dateien', async () => {
    expect(await store.readFile('household.json')).toBeNull();
  });

  it('legt Dateien an und liest sie UTF-8-korrekt zurück', async () => {
    const { sha } = await store.writeFile('household.json', TEXT, null, 'chore: test');
    const read = await store.readFile('household.json');
    expect(read).toEqual({ path: 'household.json', sha, text: TEXT });
  });

  it('ändert Dateien mit aktueller SHA und liefert eine neue SHA', async () => {
    const first = await store.writeFile('a.txt', 'eins', null, 'm');
    const second = await store.writeFile('a.txt', 'zwei', first.sha, 'm');
    expect(second.sha).not.toBe(first.sha);
    expect((await store.readFile('a.txt'))?.text).toBe('zwei');
  });

  it('wirft ConflictError bei veralteter SHA', async () => {
    const first = await store.writeFile('a.txt', 'eins', null, 'm');
    await store.writeFile('a.txt', 'zwei', first.sha, 'm');
    await expect(store.writeFile('a.txt', 'drei', first.sha, 'm')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('wirft ConflictError beim Anlegen einer vorhandenen Datei', async () => {
    await store.writeFile('a.txt', 'eins', null, 'm');
    await expect(store.writeFile('a.txt', 'zwei', null, 'm')).rejects.toBeInstanceOf(ConflictError);
  });

  it('listFiles filtert nach Präfix und liefert nur Dateien', async () => {
    await store.writeFile('household.json', '{}', null, 'm');
    await store.writeFile('log/dev-1/2027-01.jsonl', 'x', null, 'm');
    const all = await store.listFiles();
    expect(all.map((f) => f.path).sort()).toEqual(['household.json', 'log/dev-1/2027-01.jsonl']);
    const logs = await store.listFiles('log/');
    expect(logs.map((f) => f.path)).toEqual(['log/dev-1/2027-01.jsonl']);
  });

  it('headCommit meldet Änderungen genau einmal', async () => {
    const first = await store.headCommit();
    expect(first.changed).toBe(true);
    expect((await store.headCommit()).changed).toBe(false);
    await store.writeFile('a.txt', 'x', null, 'm');
    const after = await store.headCommit();
    expect(after.changed).toBe(true);
    expect(after.sha).not.toBe(first.sha);
  });

  it('verarbeitet große Texte (Chunking)', async () => {
    const big = 'äö🍁'.repeat(100_000);
    await store.writeFile('big.txt', big, null, 'm');
    expect((await store.readFile('big.txt'))?.text).toBe(big);
  });
});

describe('MemoryStore: simulierbare Fehler', () => {
  it('simuliert Konflikt, Offline und Auth', async () => {
    const store = new MemoryStore();
    store.failNext('conflict');
    await expect(store.writeFile('a', 'x', null, 'm')).rejects.toBeInstanceOf(ConflictError);
    store.failNext('offline');
    await expect(store.whoAmI()).rejects.toMatchObject({ name: 'NetworkError' });
    store.failNext('auth');
    await expect(store.whoAmI()).rejects.toMatchObject({ name: 'AuthError' });
    store.setOffline(true);
    await expect(store.readFile('a')).rejects.toMatchObject({ name: 'NetworkError' });
  });
});
