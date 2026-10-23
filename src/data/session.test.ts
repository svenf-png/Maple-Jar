import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { disconnect, PendingDataError } from './session';

beforeEach(async () => {
  await db.open();
  await db.outbox.clear();
  await db.meta.put({ key: 'username', value: 'person-a' });
});

describe('disconnect', () => {
  it('löscht bei leerer Outbox', async () => {
    await disconnect();
    expect(await db.meta.get('username')).toBeUndefined();
  });

  it('verweigert bei nicht leerer Outbox ohne Bestätigung und lässt Daten unberührt', async () => {
    await db.outbox.put({ id: 'e1' });
    await expect(disconnect()).rejects.toBeInstanceOf(PendingDataError);
    await expect(disconnect({ discardPending: false })).rejects.toBeInstanceOf(PendingDataError);
    expect(await db.outbox.count()).toBe(1);
    expect((await db.meta.get('username'))?.value).toBe('person-a');
  });

  it('löscht bei nicht leerer Outbox mit ausdrücklicher Bestätigung', async () => {
    await db.outbox.put({ id: 'e1' });
    await disconnect({ discardPending: true });
    expect(await db.outbox.count()).toBe(0);
    expect(await db.meta.get('username')).toBeUndefined();
  });
});
