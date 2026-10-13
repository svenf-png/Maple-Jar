import { needsRateCatchUp } from '../../domain/fx';
import type { Currency } from '../../domain/money';
import type { MapleJarDb } from '../db';
import { todayIso } from '../today';
import { appendLocalEvent } from '../write';

export interface RateLookup {
  rateMicro: bigint;
  date: string;
  stale: boolean;
}

/**
 * Zieht den Tageskurs für vorläufig erfasste EUR-Einträge nach, die dieses Gerät erstellt hat.
 * Fehler beim Kursabruf lassen den Eintrag vorläufig (nächster Lauf versucht es erneut).
 */
export async function catchUpRates(
  db: MapleJarDb,
  getRate: (date: string, provider: 'ECB' | 'BOC') => Promise<RateLookup>,
  today: string = todayIso(),
): Promise<number> {
  const deviceId = (await db.meta.get('deviceId'))?.value as string | undefined;
  const provider = (
    (await db.meta.get('household'))?.value as {
      settings?: { fxProvider?: 'ECB' | 'BOC' };
    }
  )?.settings?.fxProvider;
  if (!deviceId || !provider) return 0;
  const rows = await db.entry
    .filter(
      (r) =>
        !r.deleted &&
        needsRateCatchUp(
          {
            currency: r.currency as Currency,
            fxProvisional: r.fxProvisional === true,
            createdByDevice: r.createdByDevice,
          },
          deviceId,
        ),
    )
    .toArray();
  let updated = 0;
  for (const row of rows) {
    try {
      const rate = await getRate(row.bookedOn as string, provider);
      if (rate.stale) continue;
      // Für heute oder später ist ein Kurs mit früherem Datum nur ein Notbehelf: vorläufig lassen.
      if (rate.date !== row.bookedOn && (row.bookedOn as string) >= today) continue;
      await appendLocalEvent(db, {
        entity: 'entry',
        rowId: row.id,
        op: 'update',
        data: { fxRateMicro: Number(rate.rateMicro), fxRateDate: rate.date, fxProvisional: false },
      });
      updated++;
    } catch {
      // Kurs nicht abrufbar oder Ereignis ungültig: vorläufig lassen.
    }
  }
  return updated;
}
