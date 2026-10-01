// Schreibende Operationen auf der Datenbank. Alle fachlichen Abläufe (Nummernvergabe,
// Statuswechsel, Rechnungserstellung) laufen hier zentral, damit die Seiten schlank bleiben.
import { db, newId } from './db';
import { defaultEinstellungen } from './defaults';
import type { Bericht, Einstellungen, Kostenvoranschlag, Rechnung, Rezept, Termin } from './types';
import { berechneZuzahlung, formatNummer, rechnungsPositionen, summePositionen } from '../lib/abrechnung';
import { addDaysIso, isoDate, patientName, round2 } from '../lib/format';

export async function getEinstellungen(): Promise<Einstellungen> {
  const e = await db.einstellungen.get('main');
  return e ? { ...defaultEinstellungen, ...e } : defaultEinstellungen;
}

export async function saveEinstellungen(patch: Partial<Einstellungen>) {
  const e = await getEinstellungen();
  await db.einstellungen.put({ ...e, ...patch, id: 'main' });
}

type Zaehler = 'naechsteRechnungsnummer' | 'naechsteKvNummer' | 'naechsteRezeptNummer';
type Praefix = 'rechnungPraefix' | 'kvPraefix' | 'rezeptPraefix';

/** Vergibt die nächste fortlaufende Nummer (muss innerhalb einer Transaktion mit einstellungen laufen) */
async function naechsteNummer(zaehler: Zaehler, praefix: Praefix): Promise<string> {
  const e = await getEinstellungen();
  const n = e[zaehler];
  await db.einstellungen.put({ ...e, [zaehler]: n + 1 });
  return formatNummer(e[praefix], new Date().getFullYear(), n);
}

const verlauf = (text: string) => ({ datum: new Date().toISOString(), text });

async function addVerlauf(rezeptId: string, text: string) {
  const r = await db.rezepte.get(rezeptId);
  if (r) await db.rezepte.update(rezeptId, { verlauf: [...r.verlauf, verlauf(text)] });
}

export async function createRezept(data: Omit<Rezept, 'id' | 'nummer' | 'verlauf' | 'erstelltAm'>): Promise<string> {
  return db.transaction('rw', db.rezepte, db.einstellungen, async () => {
    const id = newId();
    const nummer = await naechsteNummer('naechsteRezeptNummer', 'rezeptPraefix');
    await db.rezepte.add({
      ...data,
      id,
      nummer,
      verlauf: [verlauf('Rezept erfasst')],
      erstelltAm: new Date().toISOString(),
    });
    return id;
  });
}

export async function updateRezept(id: string, patch: Partial<Rezept>) {
  await db.rezepte.update(id, patch);
}

export async function storniereRezept(id: string, grund: string) {
  await db.rezepte.update(id, { storniert: true });
  await addVerlauf(id, `Rezept storniert${grund ? ': ' + grund : ''}`);
}

export async function reaktiviereRezept(id: string) {
  await db.rezepte.update(id, { storniert: false });
  await addVerlauf(id, 'Rezept reaktiviert');
}

export async function saveKV(rezeptId: string, kv: Omit<Kostenvoranschlag, 'nummer'> & { nummer?: string }) {
  await db.transaction('rw', db.rezepte, db.einstellungen, async () => {
    const r = await db.rezepte.get(rezeptId);
    if (!r) throw new Error('Rezept nicht gefunden');
    const nummer = kv.nummer || r.kv?.nummer || (await naechsteNummer('naechsteKvNummer', 'kvPraefix'));
    const neu = !r.kv;
    await db.rezepte.update(rezeptId, {
      kv: { ...kv, nummer },
      verlauf: neu ? [...r.verlauf, verlauf(`Kostenvoranschlag ${nummer} angelegt`)] : r.verlauf,
    });
  });
}

export async function kvVersenden(rezeptId: string, datum: string) {
  const r = await db.rezepte.get(rezeptId);
  if (!r?.kv) return;
  await db.rezepte.update(rezeptId, {
    kv: { ...r.kv, status: 'versendet', versendetAm: datum },
    verlauf: [...r.verlauf, verlauf(`KV ${r.kv.nummer} an Kostenträger versendet`)],
  });
}

export async function kvAntwort(
  rezeptId: string,
  antwort: Pick<Kostenvoranschlag, 'status' | 'antwortAm' | 'genehmigungsnummer' | 'genehmigteEinheiten' | 'antwortNotiz'>,
) {
  const r = await db.rezepte.get(rezeptId);
  if (!r?.kv) return;
  const text =
    antwort.status === 'abgelehnt'
      ? 'KV abgelehnt'
      : antwort.status === 'teilgenehmigt'
        ? `KV teilweise genehmigt (${antwort.genehmigteEinheiten} Einheiten)`
        : `KV genehmigt (${antwort.genehmigteEinheiten} Einheiten)`;
  await db.rezepte.update(rezeptId, {
    kv: { ...r.kv, ...antwort },
    verlauf: [...r.verlauf, verlauf(text + (antwort.genehmigungsnummer ? `, Nr. ${antwort.genehmigungsnummer}` : ''))],
  });
}

export async function saveTermin(t: Omit<Termin, 'id'> & { id?: string }): Promise<string> {
  const id = t.id ?? newId();
  const alt = t.id ? await db.termine.get(t.id) : undefined;
  await db.termine.put({ ...t, id } as Termin);
  if (!alt) await addVerlauf(t.rezeptId, `Termin am ${new Date(t.start).toLocaleDateString('de-DE')} geplant`);
  else if (alt.status !== t.status && t.status === 'durchgefuehrt')
    await addVerlauf(t.rezeptId, `Termin am ${new Date(t.start).toLocaleDateString('de-DE')} durchgeführt`);
  return id;
}

export async function deleteTermin(id: string) {
  const t = await db.termine.get(id);
  if (t?.rechnungId) throw new Error('Der Termin ist bereits abgerechnet und kann nicht gelöscht werden.');
  await db.termine.delete(id);
}

/**
 * Erstellt eine Teil- oder Schlussrechnung als unveränderlichen Schnappschuss aus KV, Terminen und Stammdaten.
 * Abgerechnete Termine werden mit der Rechnung verknüpft, damit sie nicht doppelt berechnet werden.
 */
export async function createRechnung(rezeptId: string, art: 'teil' | 'schluss' = 'schluss'): Promise<string> {
  return db.transaction('rw', [db.rezepte, db.termine, db.rechnungen, db.einstellungen, db.patienten, db.kostentraeger], async () => {
    const r = await db.rezepte.get(rezeptId);
    if (!r?.kv) throw new Error('Kein Kostenvoranschlag vorhanden');
    const p = await db.patienten.get(r.patientId);
    if (!p) throw new Error('Patient nicht gefunden');
    const kt = r.kostentraegerId ? await db.kostentraeger.get(r.kostentraegerId) : undefined;
    const termine = await db.termine.where('rezeptId').equals(rezeptId).toArray();
    const frueher = (await db.rechnungen.where('rezeptId').equals(rezeptId).toArray()).filter((x) => x.status !== 'storniert');
    if (frueher.some((x) => x.art !== 'teil')) throw new Error('Für dieses Rezept gibt es bereits eine Schlussrechnung.');
    const e = await getEinstellungen();

    const positionen = rechnungsPositionen(r.kv.positionen, termine, frueher.flatMap((x) => x.positionen), art);
    if (positionen.length === 0) throw new Error('Keine (weiteren) abrechenbaren Leistungen');
    const datum = isoDate();
    const summe = summePositionen(positionen);
    // Zuzahlung gilt für die gesamte Verordnung – bereits erhobene Beträge abziehen
    const bisherSumme = frueher.reduce((s, x) => s + x.summe, 0);
    const bisherZuzahlung = frueher.reduce((s, x) => s + x.zuzahlung, 0);
    const zuzahlung = round2(Math.max(0, berechneZuzahlung(bisherSumme + summe, p, e.zuzahlungAktiv, datum) - bisherZuzahlung));
    const abgerechnet = termine.filter((t) => t.status === 'durchgefuehrt' && !t.rechnungId);
    const daten = abgerechnet.map((t) => t.start.slice(0, 10)).sort();

    const nummer = await naechsteNummer('naechsteRechnungsnummer', 'rechnungPraefix');
    const id = newId();
    const rechnung: Rechnung = {
      id,
      nummer,
      art,
      rezeptId,
      patientId: p.id,
      kostentraegerId: r.kostentraegerId,
      datum,
      leistungszeitraum: { von: daten[0] ?? datum, bis: daten[daten.length - 1] ?? datum },
      faelligAm: addDaysIso(datum, e.zahlungszielTage),
      positionen,
      zuzahlung,
      summe,
      zahlbetrag: round2(summe - zuzahlung),
      status: 'offen',
      mahnstufe: 0,
      empfaenger: kt
        ? { name: kt.name, adresse: kt.adresse, ik: kt.ik }
        : { name: patientName(p, 'vn'), adresse: p.adresse },
      patientInfo: {
        name: patientName(p, 'vn'),
        geburtsdatum: p.geburtsdatum,
        versichertennummer: p.versicherung.versichertennummer,
      },
      genehmigungsnummer: r.kv.genehmigungsnummer,
    };
    await db.rechnungen.add(rechnung);
    for (const t of abgerechnet) await db.termine.update(t.id, { rechnungId: id });
    await db.rezepte.update(rezeptId, {
      verlauf: [...r.verlauf, verlauf(`${art === 'teil' ? 'Teilrechnung' : 'Schlussrechnung'} ${nummer} erstellt`)],
    });
    return id;
  });
}

export async function rechnungBezahlt(id: string, datum: string) {
  const re = await db.rechnungen.get(id);
  if (!re) return;
  await db.rechnungen.update(id, { status: 'bezahlt', bezahltAm: datum });
  await addVerlauf(re.rezeptId, `Zahlungseingang zu Rechnung ${re.nummer}`);
}

export async function rechnungOffen(id: string) {
  await db.rechnungen.update(id, { status: 'offen', bezahltAm: undefined });
}

export async function rechnungMahnen(id: string) {
  const re = await db.rechnungen.get(id);
  if (!re) return;
  await db.rechnungen.update(id, { mahnstufe: re.mahnstufe + 1, mahnungen: [...(re.mahnungen ?? []), isoDate()] });
  await addVerlauf(re.rezeptId, `${re.mahnstufe + 1}. Zahlungserinnerung zu Rechnung ${re.nummer}`);
}

/** Rechnungen werden nie gelöscht, sondern storniert (GoBD). Die Termine werden wieder abrechenbar. */
export async function rechnungStornieren(id: string, grund: string) {
  const re = await db.rechnungen.get(id);
  if (!re) return;
  await db.transaction('rw', db.rechnungen, db.termine, db.rezepte, async () => {
    await db.rechnungen.update(id, { status: 'storniert', storniertAm: isoDate(), stornoGrund: grund });
    const termine = await db.termine.where('rezeptId').equals(re.rezeptId).toArray();
    for (const t of termine.filter((x) => x.rechnungId === id)) await db.termine.update(t.id, { rechnungId: undefined });
    await addVerlauf(re.rezeptId, `Rechnung ${re.nummer} storniert${grund ? ': ' + grund : ''}`);
  });
}

export async function kvWiderspruch(rezeptId: string, datum: string, begruendung: string) {
  const r = await db.rezepte.get(rezeptId);
  if (!r?.kv) return;
  await db.rezepte.update(rezeptId, {
    kv: { ...r.kv, status: 'widerspruch', widerspruchAm: datum, widerspruchBegruendung: begruendung },
    verlauf: [...r.verlauf, verlauf('Widerspruch gegen die Ablehnung eingelegt')],
  });
}

// ---------- Berichte ----------

export async function saveBericht(rezeptId: string, b: Bericht) {
  const r = await db.rezepte.get(rezeptId);
  if (!r) return;
  const liste = r.berichte ?? [];
  const neu = !liste.some((x) => x.id === b.id);
  await db.rezepte.update(rezeptId, {
    berichte: neu ? [...liste, b] : liste.map((x) => (x.id === b.id ? b : x)),
    verlauf: neu ? [...r.verlauf, verlauf(`${BERICHT_TITEL[b.typ]} erstellt`)] : r.verlauf,
  });
}

export async function deleteBericht(rezeptId: string, berichtId: string) {
  const r = await db.rezepte.get(rezeptId);
  if (!r) return;
  await db.rezepte.update(rezeptId, { berichte: (r.berichte ?? []).filter((x) => x.id !== berichtId) });
}

export const BERICHT_TITEL: Record<Bericht['typ'], string> = {
  eingang: 'Eingangsbefund',
  verlauf: 'Verlaufsbericht',
  abschluss: 'Abschlussbericht',
};

// ---------- Datensicherung ----------


export async function allesLoeschen() {
  const { TABELLEN } = await import('./sicherung');
  await db.transaction('rw', TABELLEN.map((t) => db.table(t)), async () => {
    for (const t of TABELLEN) await db.table(t).clear();
  });
}
