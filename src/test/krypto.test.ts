import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, ohneStempel, loeschen } from '../db/db';
import { setzeSitzungsschluessel, istEntsperrt, dateiVerschluesseln, dateiEntschluesseln } from '../db/krypto';
import { entsperren, pinAendern, schutzEinrichten } from '../db/schutz';
import { ladeBeispieldaten } from '../db/seed';
import { abgleichen, exportiereDatei, sicherungEinspielen } from '../db/abgleich';

/** Rohdaten direkt aus IndexedDB lesen – ohne Entschlüsselungs-Middleware */
async function roh(tabelle: string) {
  const r = new Dexie('mobi');
  await r.open();
  const daten = await r.table(tabelle).toArray();
  r.close();
  return daten;
}

describe('Verschlüsselung', () => {
  beforeEach(async () => {
    setzeSitzungsschluessel(null);
    await db.delete();
    await db.open();
  });

  it('PIN einrichten, Daten verschlüsselt, Entsperren mit falscher/richtiger PIN', async () => {
    await schutzEinrichten('123456');
    expect(istEntsperrt()).toBe(true);
    await ladeBeispieldaten();
    const rohPatienten = await roh('patienten');
    expect(rohPatienten.length).toBe(10);
    expect(JSON.stringify(rohPatienten)).not.toContain('Holm');
    expect(rohPatienten[0]._enc).toBeTruthy();
    expect(JSON.stringify(await roh('rechnungen'))).not.toContain('Musterkasse');

    setzeSitzungsschluessel(null);
    await expect(db.patienten.get('p-1')).rejects.toThrow(/gesperrt/);
    await expect(entsperren('000000')).rejects.toThrow('Falsche PIN');
    await entsperren('123456');
    expect((await db.patienten.get('p-1'))?.nachname).toBe('Holm');
  });

  it('Abfragen, Filter, Update und Zählen funktionieren auf verschlüsselten Daten', async () => {
    await schutzEinrichten('123456');
    await ladeBeispieldaten();
    const heute = new Date();
    const vor60 = new Date(heute.getTime() - 60 * 86400000);
    expect((await db.termine.where('start').between(vor60.toISOString(), heute.toISOString()).toArray()).length).toBeGreaterThan(0);
    expect(await db.patienten.filter((p) => p.nachname === 'Holm').count()).toBe(1);
    await db.patienten.update('p-1', { telefon: '0000' });
    expect((await db.patienten.get('p-1'))?.telefon).toBe('0000');
    expect((await db.patienten.get('p-1'))?.geaendertAm).toBeTruthy();
    expect((await db.termine.where('rezeptId').equals('r-1').sortBy('start')).length).toBe(15);
  });

  it('PIN ändern behält die Daten', async () => {
    await schutzEinrichten('123456');
    await ladeBeispieldaten();
    await expect(pinAendern('999999', '654321')).rejects.toThrow();
    await pinAendern('123456', '654321');
    setzeSitzungsschluessel(null);
    await expect(entsperren('123456')).rejects.toThrow();
    await entsperren('654321');
    expect((await db.patienten.get('p-2'))?.vorname).toBe('Jonas');
  });

  it('Alt-Daten ohne Verschlüsselung werden beim Einrichten verschlüsselt', async () => {
    // Datensatz wie aus Version 0.1 (unverschlüsselt) direkt in IndexedDB schreiben
    db.close();
    const r = new Dexie('mobi');
    await r.open();
    await r.table('patienten').put({ id: 'alt', vorname: 'Alt', nachname: 'Daten' });
    r.close();
    await db.open();
    await schutzEinrichten('123456');
    expect(JSON.stringify(await roh('patienten'))).not.toContain('Daten');
    expect((await db.patienten.get('alt'))?.vorname).toBe('Alt');
  });
});

describe('Sicherung & Geräte-Abgleich', () => {
  beforeEach(async () => {
    setzeSitzungsschluessel(null);
    await db.delete();
    await db.open();
    await schutzEinrichten('123456');
    await ladeBeispieldaten();
  });

  it('Datei-Verschlüsselung mit Passwort', async () => {
    const f = await dateiVerschluesseln('geheim123', 'Hallo Welt');
    expect(f).not.toContain('Hallo');
    expect(await dateiEntschluesseln('geheim123', JSON.parse(f))).toBe('Hallo Welt');
    await expect(dateiEntschluesseln('falsch123', JSON.parse(f))).rejects.toThrow();
  });

  it('Sicherung einspielen stellt den Stand wieder her', async () => {
    const datei = await exportiereDatei('passwort1');
    expect(datei).not.toContain('Holm');
    await db.patienten.clear();
    await sicherungEinspielen(datei, 'passwort1');
    expect(await db.patienten.count()).toBe(10);
    expect((await db.patienten.get('p-1'))?.nachname).toBe('Holm');
  });

  it('Abgleich: jüngere Änderung gewinnt, Löschungen werden übertragen', async () => {
    // "Gerät B": ändert einen Patienten, löscht einen Termin und erzeugt die Abgleich-Datei
    await db.patienten.update('p-1', { telefon: '0431 999' });
    await loeschen('termine', 't-r-5-3');
    const vonB = await exportiereDatei('passwort1');

    // "Gerät A": ältere Stände derselben Datensätze, eigene Geräte-ID
    await db.meta.put({ id: 'geraet', geraeteId: 'geraet-a' });
    await db.geloescht.clear();
    await ohneStempel(async () => {
      const p1 = (await db.patienten.get('p-1'))!;
      await db.patienten.put({ ...p1, telefon: 'alt', geaendertAm: '2000-01-01T00:00:00.000Z' });
      await db.termine.put({ id: 't-r-5-3', rezeptId: 'r-5', patientId: 'p-5', start: new Date().toISOString(), dauerMin: 60, einheiten: 1, ort: 'x', status: 'geplant', geaendertAm: '2000-01-01T00:00:00.000Z' });
      const p2 = (await db.patienten.get('p-2'))!;
      await db.patienten.put({ ...p2, telefon: 'neuer auf A', geaendertAm: '2999-01-01T00:00:00.000Z' });
    });
    const e = await db.einstellungen.get('main');
    await db.einstellungen.put({ ...e!, naechsteRechnungsnummer: 1 });

    const erg = await abgleichen(vonB, 'passwort1');
    expect((await db.patienten.get('p-1'))?.telefon).toBe('0431 999');
    expect(await db.termine.get('t-r-5-3')).toBeUndefined();
    expect((await db.patienten.get('p-2'))?.telefon).toBe('neuer auf A');
    expect(erg.aktualisiert).toBeGreaterThan(0);
    expect(erg.geloescht).toBe(1);
    expect((await db.einstellungen.get('main'))!.naechsteRechnungsnummer).toBeGreaterThan(1);
  });

  it('Abgleich mit der eigenen Datei wird abgelehnt', async () => {
    const eigene = await exportiereDatei('passwort1');
    await expect(abgleichen(eigene, 'passwort1')).rejects.toThrow(/diesem Gerät/);
  });
});
