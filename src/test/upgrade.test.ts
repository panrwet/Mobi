import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';

it('Testdaten der PIN-Version (v2, verschlüsselt) werden verworfen und neu geladen', async () => {
  const alt = new Dexie('mobi');
  alt.version(2).stores({ patienten: 'id', einstellungen: 'id', rezepte: 'id, patientId, nummer', termine: 'id, rezeptId, patientId, start, status', rechnungen: 'id, rezeptId, patientId, nummer, status', kostentraeger: 'id, name', aerzte: 'id, name', dokumente: 'id, patientId, rezeptId', meta: 'id', geloescht: 'id, tabelle' });
  await alt.open();
  await alt.table('patienten').put({ id: 'p-x', _enc: 'xyz' });
  await alt.table('einstellungen').put({ id: 'main', name: 'Alt' });
  await alt.table('meta').put({ id: 'krypto' });
  alt.close();

  const { db } = await import('../db/db');
  const { initDatenbank } = await import('../db/seed');
  await initDatenbank();
  expect(await db.patienten.get('p-x')).toBeUndefined();
  expect((await db.patienten.get('p-1'))?.nachname).toBe('Holm');
  expect(db.tables.map((t) => t.name)).not.toContain('meta');
});
