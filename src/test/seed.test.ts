import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { createRechnung, getEinstellungen, rechnungBezahlt } from '../db/actions';
import { ladeBeispieldaten } from '../db/seed';
import { werteRezeptAus } from '../lib/status';

async function phasen() {
  const e = await getEinstellungen();
  const [rs, ts, res] = await Promise.all([db.rezepte.toArray(), db.termine.toArray(), db.rechnungen.toArray()]);
  return Object.fromEntries(
    rs.map((r) => [r.id, werteRezeptAus(r, ts.filter((t) => t.rezeptId === r.id), res.filter((x) => x.rezeptId === r.id), e)]),
  );
}

describe('Beispieldaten', () => {
  it('decken alle wichtigen Status ab', async () => {
    await ladeBeispieldaten();
    const p = await phasen();
    expect(p['r-1'].phase).toBe('in_behandlung');
    expect(p['r-2'].phase).toBe('neu');
    expect(p['r-3'].phase).toBe('kv_versendet');
    expect(p['r-4'].phase).toBe('abrechenbar');
    expect(p['r-5'].phase).toBe('genehmigt');
    expect(p['r-6'].phase).toBe('abgerechnet');
    expect(p['r-7'].phase).toBe('abgeschlossen');
    expect(p['r-8'].phase).toBe('doku_offen');
    expect(p['r-9'].phase).toBe('kv_abgelehnt');
    expect(p['r-10'].phase).toBe('kv_entwurf');
    expect(p['r-11'].phase).toBe('abgeschlossen');
    expect(p['r-1'].warnungen.length).toBeGreaterThan(0);
    expect(p['r-3'].warnungen.length).toBeGreaterThan(0);
  });

  it('Rechnung erstellen und bezahlen schließt das Rezept ab', async () => {
    await ladeBeispieldaten();
    const vorher = (await getEinstellungen()).naechsteRechnungsnummer;
    const id = await createRechnung('r-4');
    const re = (await db.rechnungen.get(id))!;
    expect(re.nummer).toMatch(new RegExp(`RE-\\d{4}-${String(vorher).padStart(4, '0')}`));
    expect(re.positionen.find((x) => x.typ === 'einheit')?.menge).toBe(10);
    expect((await getEinstellungen()).naechsteRechnungsnummer).toBe(vorher + 1);
    expect((await phasen())['r-4'].phase).toBe('abgerechnet');
    await rechnungBezahlt(id, '2026-10-01');
    expect((await phasen())['r-4'].phase).toBe('abgeschlossen');
  });

  it('PDFs lassen sich erzeugen', async () => {
    await ladeBeispieldaten();
    const { kvPdf, rechnungPdf, dokuPdf } = await import('../lib/pdf');
    const e = await getEinstellungen();
    const r = (await db.rezepte.get('r-1'))!;
    const p = (await db.patienten.get('p-1'))!;
    const ts = await db.termine.where('rezeptId').equals('r-1').toArray();
    expect(kvPdf(r, p, e).output('arraybuffer').byteLength).toBeGreaterThan(2000);
    expect(dokuPdf(r, p, ts, e).output('arraybuffer').byteLength).toBeGreaterThan(2000);
    const re = (await db.rechnungen.toArray())[0];
    expect(rechnungPdf(re, e).output('arraybuffer').byteLength).toBeGreaterThan(2000);
  });
});
