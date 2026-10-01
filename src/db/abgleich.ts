// Datensicherung und Geräte-Abgleich über eine passwortgeschützte Datei (ohne Server).
//
// - "Sicherung einspielen" ersetzt alle Daten durch den Stand der Datei.
// - "Abgleichen" führt die Datei mit den lokalen Daten zusammen: pro Datensatz gewinnt die jüngere
//   Änderung (geaendertAm), Löschungen werden über Löschvermerke übertragen, Nummernkreise werden
//   auf den höheren Stand gesetzt.
import { ABGLEICH_TABELLEN, db, newId, ohneStempel } from './db';
import { dateiEntschluesseln, dateiVerschluesseln, istVerschluesselteDatei } from './krypto';
import type { Einstellungen, Geloescht, Meta } from './types';

type Tabelle = (typeof ABGLEICH_TABELLEN)[number];
type Datensatz = { id: string; geaendertAm?: string } & Record<string, unknown>;

interface Inhalt {
  app: 'mobi';
  version: 2;
  geraeteId: string;
  exportiertAm: string;
  daten: Record<Tabelle, Datensatz[]>;
  geloescht: Geloescht[];
}

export async function geraeteId(): Promise<string> {
  const m = (await db.meta.get('geraet')) as Extract<Meta, { id: 'geraet' }> | undefined;
  if (m) return m.geraeteId;
  const id = newId();
  await db.meta.put({ id: 'geraet', geraeteId: id });
  return id;
}

export async function exportiereDatei(passwort: string): Promise<string> {
  const daten = {} as Record<Tabelle, Datensatz[]>;
  for (const t of ABGLEICH_TABELLEN) daten[t] = (await db.table(t).toArray()) as Datensatz[];
  const inhalt: Inhalt = {
    app: 'mobi',
    version: 2,
    geraeteId: await geraeteId(),
    exportiertAm: new Date().toISOString(),
    daten,
    geloescht: await db.geloescht.toArray(),
  };
  return dateiVerschluesseln(passwort, JSON.stringify(inhalt));
}

async function leseDatei(text: string, passwort: string): Promise<Inhalt> {
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine Mobi-Datei.');
  }
  if (istVerschluesselteDatei(roh)) {
    const inhalt = JSON.parse(await dateiEntschluesseln(passwort, roh)) as Inhalt;
    if (inhalt.app !== 'mobi') throw new Error('Die Datei ist keine Mobi-Datei.');
    return inhalt;
  }
  // unverschlüsselte Sicherung aus Version 0.1
  const alt = roh as { app?: string; daten?: Record<string, Datensatz[]> };
  if (alt?.app !== 'mobi' || !alt.daten) throw new Error('Die Datei ist keine Mobi-Datei.');
  return { app: 'mobi', version: 2, geraeteId: 'alt', exportiertAm: '', daten: alt.daten as Inhalt['daten'], geloescht: [] };
}

export const brauchtPasswort = (text: string) => {
  try {
    return istVerschluesselteDatei(JSON.parse(text));
  } catch {
    return false;
  }
};

/** Sicherung einspielen: ersetzt alle lokalen Daten */
export async function sicherungEinspielen(text: string, passwort: string) {
  const inhalt = await leseDatei(text, passwort);
  const tabellen = [...ABGLEICH_TABELLEN.map((t) => db.table(t)), db.geloescht];
  await ohneStempel(() =>
    db.transaction('rw', tabellen, async () => {
      for (const t of ABGLEICH_TABELLEN) {
        await db.table(t).clear();
        const rows = inhalt.daten[t] ?? [];
        if (rows.length) await db.table(t).bulkPut(rows.map(migriere(t)));
      }
      await db.geloescht.clear();
      if (inhalt.geloescht.length) await db.geloescht.bulkPut(inhalt.geloescht);
    }),
  );
}

export interface AbgleichErgebnis {
  neu: number;
  aktualisiert: number;
  geloescht: number;
  warnungen: string[];
}

/** Geräte-Abgleich: Datei mit den lokalen Daten zusammenführen */
export async function abgleichen(text: string, passwort: string): Promise<AbgleichErgebnis> {
  const inhalt = await leseDatei(text, passwort);
  if (inhalt.geraeteId === (await geraeteId())) {
    throw new Error('Diese Datei stammt von diesem Gerät. Bitte die Datei des anderen Geräts wählen.');
  }
  const erg: AbgleichErgebnis = { neu: 0, aktualisiert: 0, geloescht: 0, warnungen: [] };
  const tabellen = [...ABGLEICH_TABELLEN.map((t) => db.table(t)), db.geloescht, db.meta];

  await ohneStempel(() =>
    db.transaction('rw', tabellen, async () => {
      const lokaleVermerke = new Map((await db.geloescht.toArray()).map((g) => [g.id, g]));
      const einstVorher = (await db.einstellungen.get('main')) as Einstellungen | undefined;

      for (const t of ABGLEICH_TABELLEN) {
        for (const fremd of (inhalt.daten[t] ?? []).map(migriere(t))) {
          const vermerk = lokaleVermerke.get(`${t}:${fremd.id}`);
          if (vermerk && vermerk.am >= (fremd.geaendertAm ?? '')) continue; // hier nach der fremden Änderung gelöscht
          const lokal = (await db.table(t).get(fremd.id)) as Datensatz | undefined;
          if (!lokal) {
            await db.table(t).put(fremd);
            erg.neu++;
          } else if ((fremd.geaendertAm ?? '') > (lokal.geaendertAm ?? '')) {
            await db.table(t).put(fremd);
            erg.aktualisiert++;
          }
        }
      }

      for (const v of inhalt.geloescht) {
        const lokal = (await db.table(v.tabelle).get(v.schluessel)) as Datensatz | undefined;
        if (lokal && (lokal.geaendertAm ?? '') <= v.am) {
          await db.table(v.tabelle).delete(v.schluessel);
          erg.geloescht++;
        }
        const bisher = lokaleVermerke.get(v.id);
        if (!bisher || bisher.am < v.am) await db.geloescht.put(v);
      }

      // Nummernkreise nie zurücksetzen: jeweils den höheren Zähler behalten
      const einst = (await db.einstellungen.get('main')) as Einstellungen | undefined;
      const fremdeEinst = inhalt.daten.einstellungen?.[0] as unknown as Einstellungen | undefined;
      if (einst) {
        const max = (k: 'naechsteRechnungsnummer' | 'naechsteKvNummer' | 'naechsteRezeptNummer') =>
          Math.max(einst[k] ?? 1, einstVorher?.[k] ?? 1, fremdeEinst?.[k] ?? 1);
        await db.einstellungen.put({
          ...einst,
          naechsteRechnungsnummer: max('naechsteRechnungsnummer'),
          naechsteKvNummer: max('naechsteKvNummer'),
          naechsteRezeptNummer: max('naechsteRezeptNummer'),
        });
      }

      const geraet = (await db.meta.get('geraet')) as Extract<Meta, { id: 'geraet' }>;
      await db.meta.put({ ...geraet, letzterAbgleich: new Date().toISOString() });
    }),
  );

  // doppelte Nummern (wenn auf beiden Geräten offline Rechnungen geschrieben wurden)
  for (const t of ['rechnungen', 'rezepte'] as const) {
    const zaehler = new Map<string, number>();
    for (const r of await db.table(t).toArray()) zaehler.set(r.nummer, (zaehler.get(r.nummer) ?? 0) + 1);
    for (const [nr, n] of zaehler) if (n > 1) erg.warnungen.push(`Nummer ${nr} ist ${n}× vergeben – bitte prüfen (${t === 'rechnungen' ? 'ggf. eine Rechnung stornieren' : 'Rezept umnummerieren'}).`);
  }
  return erg;
}

/** Ältere Datensätze auf das aktuelle Datenmodell heben */
function migriere(t: Tabelle) {
  return (r: Datensatz): Datensatz => {
    if (t === 'rechnungen' && !r.art) return { ...r, art: 'schluss' };
    return r;
  };
}

/** Datei teilen (Smartphone: Teilen-Menü, z. B. AirDrop/Mail/Cloud) oder herunterladen */
export async function dateiAusgeben(inhalt: string, dateiname: string) {
  const datei = new File([inhalt], dateiname, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [datei] }) && window.matchMedia('(pointer: coarse)').matches) {
    try {
      await nav.share({ files: [datei], title: dateiname });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(datei);
  a.download = dateiname;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
