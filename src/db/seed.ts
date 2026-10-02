// Fiktive Beispieldaten zum Testen. Alle Personen, Kassen und Nummern sind frei erfunden.
// Datumsangaben werden relativ zum heutigen Tag erzeugt, damit die Daten immer "frisch" wirken.
import { db } from './db';
import { defaultEinstellungen } from './defaults';
import type { Arzt, Bericht, Dokument, Einstellungen, Kostentraeger, Patient, Position, Rechnung, Rezept, Termin } from './types';
import { berechneZuzahlung, formatNummer, rechnungsPositionen, summePositionen } from '../lib/abrechnung';
import { addDays, isoDate, round2 } from '../lib/format';

const kostentraeger: Kostentraeger[] = [
  { id: 'kt-1', name: 'Musterkasse Nord', typ: 'GKV', ik: '109900001', adresse: { strasse: 'Kassenweg 1', plz: '24103', ort: 'Kiel' }, telefon: '0431 111111', email: 'hilfsmittel@musterkasse-nord.example', fax: '0431 111112' },
  { id: 'kt-2', name: 'BKK Beispiel', typ: 'GKV', ik: '109900002', adresse: { strasse: 'Am Hafen 7', plz: '20457', ort: 'Hamburg' }, telefon: '040 222222', email: 'kv@bkk-beispiel.example' },
  { id: 'kt-3', name: 'Ersatzkasse Muster', typ: 'GKV', ik: '109900003', adresse: { strasse: 'Hauptstraße 100', plz: '10115', ort: 'Berlin' }, telefon: '030 333333', email: 'genehmigung@ek-muster.example' },
  { id: 'kt-4', name: 'Muster Private Krankenversicherung AG', typ: 'PKV', ik: '', adresse: { strasse: 'Versicherungsallee 3', plz: '50667', ort: 'Köln' }, telefon: '0221 444444' },
  { id: 'kt-5', name: 'Kreis Musterland – Eingliederungshilfe', typ: 'Eingliederungshilfe', ik: '', adresse: { strasse: 'Rathausplatz 1', plz: '24768', ort: 'Rendsburg' }, telefon: '04331 555555' },
  { id: 'kt-6', name: 'Berufsgenossenschaft Muster', typ: 'BG', ik: '120900006', adresse: { strasse: 'Unfallstraße 5', plz: '30159', ort: 'Hannover' } },
];

const aerzte: Arzt[] = [
  { id: 'a-1', titel: 'Dr. med.', name: 'Julia Augenstein', fachrichtung: 'Augenheilkunde', bsnr: '019900001', lanr: '999990101', adresse: { strasse: 'Holtenauer Straße 50', plz: '24105', ort: 'Kiel' }, telefon: '0431 600001', fax: '0431 600002' },
  { id: 'a-2', titel: 'Dr. med.', name: 'Peter Sehmann', fachrichtung: 'Augenheilkunde', bsnr: '019900002', lanr: '999990202', adresse: { strasse: 'Bahnhofstraße 9', plz: '24534', ort: 'Neumünster' }, telefon: '04321 700001' },
  { id: 'a-3', titel: 'Prof. Dr. med.', name: 'Lena Netzhaut', fachrichtung: 'Universitäts-Augenklinik', bsnr: '019900003', lanr: '999990303', adresse: { strasse: 'Klinikring 1', plz: '24105', ort: 'Kiel' }, telefon: '0431 800001' },
  { id: 'a-4', titel: '', name: 'Martin Hausmann', fachrichtung: 'Allgemeinmedizin', bsnr: '019900004', lanr: '999990404', adresse: { strasse: 'Dorfstraße 3', plz: '24211', ort: 'Preetz' }, telefon: '04342 900001' },
];

const dokuVorlagen = [
  ['Erstgespräch: Anamnese, Sehrest, Alltagswege, Ziele besprochen. Langstock angepasst (Länge bis Brustbein).', 'Motiviert, unsicher bei Bordsteinkanten.', 'Grundtechniken Langstock einführen.'],
  ['Pendeltechnik und Gleittechnik im ruhigen Wohngebiet geübt. Rhythmus Schritt/Stock.', 'Technik wird zunehmend gleichmäßig, Bogenbreite noch zu schmal.', 'Bogenbreite korrigieren, Bordsteine.'],
  ['Erkennen und Überwinden von Bordsteinkanten, Leitlinien (Hauswand, Rasenkante) nutzen.', 'Bordsteine werden sicher erkannt, Leitlinie wird gelegentlich verloren.', 'Leitlinientechnik vertiefen.'],
  ['Route Wohnung – Bushaltestelle (ca. 400 m) erarbeitet, Landmarken festgelegt.', 'Route mit verbaler Unterstützung bewältigt.', 'Route selbstständig gehen.'],
  ['Straßenquerung an Ampel mit Akustik- und Vibrationssignal, Verkehrsgeräusche analysiert.', 'Querung sicher, Ausrichtung zur Fahrbahn noch korrekturbedürftig.', 'Querung ohne Ampel an verkehrsarmer Straße.'],
  ['Busfahren: Haltestelle finden, Einstieg, Sitzplatz, Ausstieg ansagen lassen.', 'Patientin fährt erstmals allein eine Station, gute Fortschritte.', 'Umstieg am Hauptbahnhof.'],
  ['Treppen auf- und abwärts mit Langstock, Handlauf, Podeste.', 'Sicher, Tempo angemessen.', 'Orientierung in Innenräumen.'],
  ['Orientierung im Supermarkt: Eingangsbereich, Kasse, Hilfe anfordern.', 'Hilfe wird selbstbewusst angefragt.', 'Smartphone-Navigation ausprobieren.'],
  ['Taktiles Leitsystem am Bahnhof: Aufmerksamkeitsfelder, Abzweig- und Richtungsfelder.', 'System wird verstanden, Sicherheit wächst.', 'Bahnsteigwechsel üben.'],
  ['Smartphone-App zur Navigation (Sprachausgabe) eingerichtet und auf bekannter Route getestet.', 'App unterstützt gut, Bedienung braucht noch Übung.', 'Abschlussroute planen.'],
  ['Abschluss: Gesamtroute Wohnung – Arbeitsplatz selbstständig, Reflexion der Ziele.', 'Ziele überwiegend erreicht, Patient sicher und selbstständig.', 'Abschlussbericht schreiben.'],
];

const orte = ['Hausbesuch', 'Hausbesuch / Wohnumfeld', 'Innenstadt', 'Hauptbahnhof', 'Schulweg', 'Arbeitsweg'];

// einfacher deterministischer Zufall, damit die Beispieldaten reproduzierbar sind
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const SLOTS = [8.5, 10, 11.5, 13.5, 15, 16.5];

interface Ctx {
  heute: Date;
  belegt: Set<string>;
  rand: () => number;
  termine: Termin[];
}

/** Nächster freier Werktags-Slot ab Tagesversatz */
function slot(ctx: Ctx, tagOffset: number): Date {
  for (let tag = tagOffset; ; tag += 1) {
    const d = addDays(ctx.heute, tag);
    const wd = d.getDay();
    if (wd === 0 || wd === 6) continue;
    const start = Math.floor(ctx.rand() * SLOTS.length);
    for (let i = 0; i < SLOTS.length; i++) {
      const h = SLOTS[(start + i) % SLOTS.length];
      const key = `${isoDate(d)}-${h}`;
      if (!ctx.belegt.has(key)) {
        ctx.belegt.add(key);
        const r = new Date(d);
        r.setHours(Math.floor(h), (h % 1) * 60, 0, 0);
        return r;
      }
    }
  }
}

function termine(
  ctx: Ctx,
  rezept: Rezept,
  plan: { vergangen: number; zukunft: number; abstand: number; startTag: number; dokuLuecken?: number; ohneStatus?: number; abgesagt?: number },
) {
  let tag = plan.startTag;
  let dokuIndex = 0;
  const gesamt = plan.vergangen + plan.zukunft;
  for (let i = 0; i < gesamt; i++) {
    const vergangen = i < plan.vergangen;
    // erster zukünftiger Termin frühestens morgen
    if (!vergangen && tag < 1 && plan.vergangen > 0) tag = 1;
    const start = slot(ctx, tag);
    tag += plan.abstand;
    // vergangene Termine dürfen nicht in die Zukunft rutschen
    if (vergangen && start > ctx.heute) {
      start.setTime(addDays(ctx.heute, -1).getTime());
    }
    const istOhneStatus = vergangen && plan.ohneStatus && i >= plan.vergangen - plan.ohneStatus;
    const istAbgesagt = vergangen && plan.abgesagt && i === 1;
    const fehltDoku = vergangen && plan.dokuLuecken && i >= plan.vergangen - plan.dokuLuecken - (plan.ohneStatus ?? 0) && !istOhneStatus;
    const status: Termin['status'] = !vergangen || istOhneStatus ? 'geplant' : istAbgesagt ? 'abgesagt_patient' : 'durchgefuehrt';
    const vorlage = dokuVorlagen[Math.min(dokuIndex, dokuVorlagen.length - 1)];
    if (status === 'durchgefuehrt') dokuIndex++;
    const ort = orte[Math.floor(ctx.rand() * orte.length)];
    ctx.termine.push({
      id: `t-${rezept.id}-${i}`,
      rezeptId: rezept.id,
      patientId: rezept.patientId,
      start: start.toISOString(),
      dauerMin: 60,
      einheiten: 1,
      ort,
      status,
      km: ort.startsWith('Hausbesuch') ? Math.round(6 + ctx.rand() * 20) : 0,
      doku:
        status === 'durchgefuehrt' && !fehltDoku
          ? { inhalte: vorlage[0], verlauf: vorlage[1], naechsteSchritte: vorlage[2], erstelltAm: start.toISOString() }
          : undefined,
      notiz: istAbgesagt ? 'Patientin erkrankt, telefonisch abgesagt.' : undefined,
    });
  }
}

function kvPositionen(e: Einstellungen, einheiten: number, km: number, leistung = 'l-om'): Position[] {
  const l = (id: string) => e.leistungen.find((x) => x.id === id)!;
  const pos = (id: string, menge: number): Position => {
    const x = l(id);
    return { leistungId: x.id, typ: x.typ, zeitpunkt: x.zeitpunkt, bezeichnung: x.bezeichnung, positionsnummer: x.positionsnummer, menge, einheit: x.einheit, einzelpreis: x.preis };
  };
  return [pos('l-erst', 1), pos(leistung, einheiten), pos('l-bericht', 1), ...(km > 0 ? [pos('l-km', km)] : [])];
}

export async function ladeBeispieldaten() {
  const heute = new Date();
  heute.setHours(12, 0, 0, 0);
  const ctx: Ctx = { heute, belegt: new Set(), rand: rng(42), termine: [] };
  const d = (offset: number) => isoDate(addDays(heute, offset));
  const ts = (offset: number) => addDays(heute, offset).toISOString();
  const jahr = heute.getFullYear();
  const e: Einstellungen = { ...defaultEinstellungen };

  const pat = (p: Partial<Patient> & Pick<Patient, 'id' | 'vorname' | 'nachname' | 'geburtsdatum'>): Patient => ({
    anrede: '',
    adresse: { strasse: '', plz: '', ort: '' },
    sehstatus: 'blind',
    versicherung: { kostentraegerId: 'kt-1', versichertennummer: '', status: 'Mitglied', zuzahlungsbefreit: false },
    datenschutzEinwilligung: d(-60),
    schweigepflichtentbindung: d(-60),
    erstelltAm: ts(-60),
    ...p,
  });

  const patienten: Patient[] = [
    pat({ id: 'p-1', anrede: 'Frau', vorname: 'Margarete', nachname: 'Holm', geburtsdatum: '1948-03-14', adresse: { strasse: 'Lindenallee 4', plz: '24105', ort: 'Kiel' }, telefon: '0431 123401', notfallkontakt: 'Tochter Birgit Holm, 0170 0000001', sehstatus: 'hochgradig sehbehindert', diagnoseText: 'Altersbedingte Makuladegeneration (feucht), beidseits', visus: 'RA 0,04 / LA 0,02', gdb: 100, merkzeichen: 'Bl, G, B', hilfsmittel: 'Lupenbrille, Bildschirmlesegerät', versicherung: { kostentraegerId: 'kt-1', versichertennummer: 'A123456780', status: 'Rentner', zuzahlungsbefreit: true, befreitBis: `${jahr}-12-31` } }),
    pat({ id: 'p-2', anrede: 'Herr', vorname: 'Jonas', nachname: 'Petersen', geburtsdatum: '2002-07-22', adresse: { strasse: 'Am Wall 18', plz: '24103', ort: 'Kiel' }, telefon: '0151 000002', email: 'jonas.p@example.org', sehstatus: 'blind', diagnoseText: 'Retinitis pigmentosa, fortgeschritten', visus: 'Lichtscheinwahrnehmung', gdb: 100, merkzeichen: 'Bl, H, RF', versicherung: { kostentraegerId: 'kt-2', versichertennummer: 'B234567891', status: 'Mitglied', zuzahlungsbefreit: false }, datenschutzEinwilligung: d(-1), schweigepflichtentbindung: undefined }),
    pat({ id: 'p-3', anrede: 'Frau', vorname: 'Fatma', nachname: 'Yılmaz', geburtsdatum: '1980-11-02', adresse: { strasse: 'Ostring 77', plz: '24143', ort: 'Kiel' }, telefon: '0431 123403', sehstatus: 'hochgradig sehbehindert', diagnoseText: 'Diabetische Retinopathie, proliferativ', visus: 'RA 0,05 / LA HBW', gdb: 80, merkzeichen: 'G', versicherung: { kostentraegerId: 'kt-3', versichertennummer: 'C345678902', status: 'Mitglied', zuzahlungsbefreit: false } }),
    pat({ id: 'p-4', anrede: 'Herr', vorname: 'Klaus', nachname: 'Brandt', geburtsdatum: '1962-01-30', adresse: { strasse: 'Fördeblick 2', plz: '24159', ort: 'Kiel' }, telefon: '0431 123404', notfallkontakt: 'Ehefrau Ute Brandt, 0431 123404', sehstatus: 'blind', diagnoseText: 'Glaukom im Endstadium', visus: 'beidseits < 0,02', gdb: 100, merkzeichen: 'Bl, G, B, RF', hilfsmittel: 'Langstock, Sprachausgabe am PC', versicherung: { kostentraegerId: 'kt-1', versichertennummer: 'A456789013', status: 'Mitglied', zuzahlungsbefreit: false } }),
    pat({ id: 'p-5', anrede: 'Frau', vorname: 'Sophie', nachname: 'Lange', geburtsdatum: '2010-05-09', adresse: { strasse: 'Schulstraße 11', plz: '24211', ort: 'Preetz' }, telefon: '04342 1234', notfallkontakt: 'Mutter Katrin Lange, 0160 000005', sehstatus: 'blind', diagnoseText: 'Lebersche kongenitale Amaurose', visus: 'Lichtschein', gdb: 100, merkzeichen: 'Bl, H, B', notizen: 'Schülerin Klasse 10, Training auf dem Schulweg. Termine nachmittags.', versicherung: { kostentraegerId: 'kt-2', versichertennummer: 'B567890124', status: 'Familienversichert', zuzahlungsbefreit: true } }),
    pat({ id: 'p-6', anrede: 'Frau', vorname: 'Erika', nachname: 'Nissen', geburtsdatum: '1943-09-17', adresse: { strasse: 'Dorfring 5', plz: '24214', ort: 'Gettorf' }, telefon: '04346 1234', sehstatus: 'hochgradig sehbehindert', diagnoseText: 'Makuladegeneration (trocken)', visus: 'RA 0,05 / LA 0,03', gdb: 100, merkzeichen: 'Bl', versicherung: { kostentraegerId: 'kt-1', versichertennummer: 'A678901235', status: 'Rentner', zuzahlungsbefreit: false } }),
    pat({ id: 'p-7', anrede: 'Herr', vorname: 'Hans-Peter', nachname: 'Möller', geburtsdatum: '1970-12-01', adresse: { strasse: 'Werftstraße 30', plz: '24148', ort: 'Kiel' }, telefon: '0431 123407', sehstatus: 'blind', diagnoseText: 'Sehnervatrophie nach Arbeitsunfall', gdb: 100, merkzeichen: 'Bl', versicherung: { kostentraegerId: 'kt-6', versichertennummer: 'BG-2024-0815', status: 'Mitglied', zuzahlungsbefreit: true } }),
    pat({ id: 'p-8', anrede: 'Frau', vorname: 'Lea', nachname: 'Schulz', geburtsdatum: '1992-04-25', adresse: { strasse: 'Knooper Weg 120', plz: '24116', ort: 'Kiel' }, telefon: '0176 000008', email: 'lea.schulz@example.org', sehstatus: 'blind', diagnoseText: 'Morbus Stargardt', gdb: 100, merkzeichen: 'Bl, RF', versicherung: { kostentraegerId: 'kt-3', versichertennummer: 'C789012346', status: 'Mitglied', zuzahlungsbefreit: false } }),
    pat({ id: 'p-9', anrede: 'Herr', vorname: 'Ahmet', nachname: 'Kaya', geburtsdatum: '1955-06-12', adresse: { strasse: 'Elmschenhagener Allee 9', plz: '24146', ort: 'Kiel' }, telefon: '0431 123409', sehstatus: 'sehbehindert', diagnoseText: 'Katarakt mit Optikusatrophie', visus: 'RA 0,2 / LA 0,1', gdb: 50, versicherung: { kostentraegerId: 'kt-1', versichertennummer: 'A890123457', status: 'Rentner', zuzahlungsbefreit: false } }),
    pat({ id: 'p-10', anrede: 'Frau', vorname: 'Ingrid', nachname: 'Wolff', geburtsdatum: '1966-02-08', adresse: { strasse: 'Bergstraße 14', plz: '24534', ort: 'Neumünster' }, telefon: '04321 123410', sehstatus: 'hochgradig sehbehindert', diagnoseText: 'Retinitis pigmentosa (Usher-Syndrom Typ 2)', notizen: 'Hörgeräte beidseits – auf gute Akustik achten, deutlich sprechen.', gdb: 100, merkzeichen: 'Bl, Gl', versicherung: { kostentraegerId: 'kt-4', versichertennummer: 'PKV-778899', status: 'Mitglied', zuzahlungsbefreit: false } }),
  ];

  let rezeptNr = 1;
  let kvNr = 1;
  const rezepte: Rezept[] = [];
  const rez = (r: Partial<Rezept> & Pick<Rezept, 'id' | 'patientId' | 'ausstellungsdatum' | 'diagnose' | 'icd10' | 'verordneteEinheiten'>): Rezept => {
    const p = patienten.find((x) => x.id === r.patientId)!;
    const x: Rezept = {
      nummer: formatNummer(e.rezeptPraefix, jahr, rezeptNr++),
      arztId: 'a-1',
      kostentraegerId: p.versicherung.kostentraegerId,
      leistungsart: 'O&M',
      eingangsdatum: r.ausstellungsdatum,
      verordnung: `Training in Orientierung und Mobilität mit dem Blindenlangstock (${r.verordneteEinheiten} UE à 60 Min.), Erstversorgung`,
      verlauf: [{ datum: new Date(r.ausstellungsdatum + 'T09:00:00').toISOString(), text: 'Rezept erfasst' }],
      erstelltAm: new Date(r.ausstellungsdatum + 'T09:00:00').toISOString(),
      ...r,
    };
    rezepte.push(x);
    return x;
  };
  const kv = (einheiten: number, km: number, datumOffset: number, extra: Partial<NonNullable<Rezept['kv']>> = {}, leistung = 'l-om') => ({
    nummer: formatNummer(e.kvPraefix, jahr, kvNr++),
    datum: d(datumOffset),
    positionen: kvPositionen(e, einheiten, km, leistung),
    begruendung: 'Aufgrund der hochgradigen Sehbehinderung ist eine sichere, selbstständige Fortbewegung ohne Training mit dem Blindenlangstock nicht möglich. Das Training dient dem Erlernen der Langstocktechniken und dem Erarbeiten alltagsrelevanter Wege.',
    ziele: 'Sichere Anwendung des Langstocks, selbstständiges Bewältigen der Wege zu Einkauf, Arzt und ÖPNV-Haltestelle, sichere Straßenquerung.',
    status: 'entwurf' as const,
    ...extra,
  });

  // 1 Holm: in Behandlung, ein vergangener Termin ohne Status
  const r1 = rez({ id: 'r-1', patientId: 'p-1', ausstellungsdatum: d(-50), diagnose: 'Altersbedingte Makuladegeneration, feucht', icd10: 'H35.31', verordneteEinheiten: 20, arztId: 'a-3' });
  r1.kv = kv(20, 200, -45, { status: 'genehmigt', versendetAm: d(-44), antwortAm: d(-35), genehmigungsnummer: 'MKN-2026-44121', genehmigteEinheiten: 20 });
  termine(ctx, r1, { vergangen: 9, zukunft: 6, abstand: 3, startTag: -30, ohneStatus: 1, abgesagt: 1 });

  // 2 Petersen: neu eingegangen
  rez({ id: 'r-2', patientId: 'p-2', ausstellungsdatum: d(-3), eingangsdatum: d(-1), diagnose: 'Retinitis pigmentosa', icd10: 'H35.5', verordneteEinheiten: 30, arztId: 'a-1' });

  // 3 Yılmaz: KV versendet, keine Antwort seit 20 Tagen
  const r3 = rez({ id: 'r-3', patientId: 'p-3', ausstellungsdatum: d(-26), diagnose: 'Diabetische Retinopathie', icd10: 'E11.30', verordneteEinheiten: 24, arztId: 'a-2' });
  r3.kv = kv(24, 0, -21, { status: 'versendet', versendetAm: d(-20) });

  // 4 Brandt: alle Termine geleistet und dokumentiert -> abrechenbar
  const r4 = rez({ id: 'r-4', patientId: 'p-4', ausstellungsdatum: d(-70), diagnose: 'Glaukom, Endstadium', icd10: 'H40.1', verordneteEinheiten: 10 });
  r4.kv = kv(10, 150, -66, { status: 'genehmigt', versendetAm: d(-65), antwortAm: d(-58), genehmigungsnummer: 'MKN-2026-39007', genehmigteEinheiten: 10 });
  termine(ctx, r4, { vergangen: 10, zukunft: 0, abstand: 4, startTag: -50 });

  // 5 Lange: genehmigt, erst ein Teil der Termine geplant
  const r5 = rez({ id: 'r-5', patientId: 'p-5', ausstellungsdatum: d(-20), diagnose: 'Lebersche kongenitale Amaurose', icd10: 'H35.5', verordneteEinheiten: 40, arztId: 'a-3' });
  r5.kv = kv(40, 0, -18, { status: 'genehmigt', versendetAm: d(-17), antwortAm: d(-6), genehmigungsnummer: 'BKKB-55120', genehmigteEinheiten: 40 });
  termine(ctx, r5, { vergangen: 0, zukunft: 4, abstand: 2, startTag: 0 });

  // 6 Nissen: abgerechnet, Rechnung überfällig
  const r6 = rez({ id: 'r-6', patientId: 'p-6', ausstellungsdatum: d(-120), diagnose: 'Makuladegeneration, trocken', icd10: 'H35.30', verordneteEinheiten: 12, arztId: 'a-2' });
  r6.kv = kv(12, 250, -115, { status: 'genehmigt', versendetAm: d(-114), antwortAm: d(-105), genehmigungsnummer: 'MKN-2026-30550', genehmigteEinheiten: 12 });
  termine(ctx, r6, { vergangen: 12, zukunft: 0, abstand: 5, startTag: -100 });

  // 7 Möller: abgeschlossen (BG)
  const r7 = rez({ id: 'r-7', patientId: 'p-7', ausstellungsdatum: d(-160), diagnose: 'Sehnervatrophie nach Trauma', icd10: 'H47.2', verordneteEinheiten: 8, arztId: 'a-3' });
  r7.kv = kv(8, 0, -155, { status: 'genehmigt', versendetAm: d(-154), antwortAm: d(-148), genehmigungsnummer: 'BG-REHA-7781', genehmigteEinheiten: 8 });
  termine(ctx, r7, { vergangen: 8, zukunft: 0, abstand: 6, startTag: -140 });

  // 8 Schulz: alle Termine geleistet, aber Doku fehlt bei 2
  const r8 = rez({ id: 'r-8', patientId: 'p-8', ausstellungsdatum: d(-60), diagnose: 'Morbus Stargardt', icd10: 'H35.5', verordneteEinheiten: 8 });
  r8.kv = kv(8, 0, -56, { status: 'teilgenehmigt', versendetAm: d(-55), antwortAm: d(-45), genehmigungsnummer: 'EKM-88231', genehmigteEinheiten: 6, antwortNotiz: 'Zunächst 6 UE genehmigt, Folgeantrag mit Verlaufsbericht möglich.' });
  termine(ctx, r8, { vergangen: 6, zukunft: 0, abstand: 4, startTag: -30, dokuLuecken: 2 });

  // 9 Kaya: KV abgelehnt
  const r9 = rez({ id: 'r-9', patientId: 'p-9', ausstellungsdatum: d(-40), diagnose: 'Katarakt, Optikusatrophie', icd10: 'H47.2', verordneteEinheiten: 16, arztId: 'a-4' });
  r9.kv = kv(16, 0, -36, { status: 'abgelehnt', versendetAm: d(-35), antwortAm: d(-10), antwortNotiz: 'Ablehnung: Visus zu hoch für Langstockversorgung. Widerspruchsfrist 1 Monat ab Bescheid.' });

  // 10 Wolff: KV in Arbeit (LPF, privat)
  const r10 = rez({ id: 'r-10', patientId: 'p-10', ausstellungsdatum: d(-5), diagnose: 'Usher-Syndrom Typ 2', icd10: 'H35.5', verordneteEinheiten: 20, leistungsart: 'O&M' });
  r10.kv = kv(20, 120, -2, {});

  // 11 Brandt: älteres, abgeschlossenes Rezept (Folgeverordnung-Szenario)
  const r11 = rez({ id: 'r-11', patientId: 'p-4', ausstellungsdatum: d(-300), diagnose: 'Glaukom', icd10: 'H40.1', verordneteEinheiten: 6, leistungsart: 'LPF', verordnung: 'Training Lebenspraktische Fähigkeiten (6 UE)', kostentraegerId: 'kt-5' });
  r11.kv = kv(6, 0, -295, { status: 'genehmigt', versendetAm: d(-294), antwortAm: d(-280), genehmigungsnummer: 'EGH-2026-114', genehmigteEinheiten: 6 }, 'l-lpf');
  termine(ctx, r11, { vergangen: 6, zukunft: 0, abstand: 7, startTag: -270 });

  // 12 Holm, Termin heute: sorgt für Einträge in "Heute" -> eigener Termin über r-1 schon vorhanden
  // Kalender für heute zusätzlich mit Termin von Sophie Lange (r-5, startTag 0) belegt.

  // Rechnungen
  let reNr = 1;
  const rechnungen: Rechnung[] = [];
  const rechnung = (r: Rezept, datumOffset: number, status: Rechnung['status'], bezahltOffset?: number, mahnstufe = 0, art: Rechnung['art'] = 'schluss', bisTermin?: number) => {
    const p = patienten.find((x) => x.id === r.patientId)!;
    const kt = kostentraeger.find((x) => x.id === r.kostentraegerId);
    const alle = ctx.termine.filter((t) => t.rezeptId === r.id && t.status === 'durchgefuehrt' && !t.rechnungId);
    const ts = bisTermin !== undefined ? alle.slice(0, bisTermin) : alle;
    const frueher = rechnungen.filter((x) => x.rezeptId === r.id).flatMap((x) => x.positionen);
    const positionen = rechnungsPositionen(r.kv!.positionen, ts, frueher, art);
    const id = `re-${r.id}-${reNr}`;
    for (const t of ts) t.rechnungId = id;
    const summe = summePositionen(positionen);
    const datum = d(datumOffset);
    const zuzahlung = berechneZuzahlung(summe, p, e.zuzahlungAktiv, datum);
    const daten = ts.filter((t) => t.status === 'durchgefuehrt').map((t) => t.start.slice(0, 10)).sort();
    const nummer = formatNummer(e.rechnungPraefix, jahr, reNr++);
    rechnungen.push({
      id,
      nummer,
      art,
      rezeptId: r.id,
      patientId: p.id,
      kostentraegerId: r.kostentraegerId,
      datum,
      leistungszeitraum: { von: daten[0], bis: daten[daten.length - 1] },
      faelligAm: d(datumOffset + e.zahlungszielTage),
      positionen,
      zuzahlung,
      summe,
      zahlbetrag: round2(summe - zuzahlung),
      status,
      bezahltAm: bezahltOffset !== undefined ? d(bezahltOffset) : undefined,
      mahnstufe,
      empfaenger: kt ? { name: kt.name, adresse: kt.adresse, ik: kt.ik } : { name: `${p.vorname} ${p.nachname}`, adresse: p.adresse },
      patientInfo: { name: `${p.vorname} ${p.nachname}`, geburtsdatum: p.geburtsdatum, versichertennummer: p.versicherung.versichertennummer },
      genehmigungsnummer: r.kv!.genehmigungsnummer,
    });
    r.verlauf.push({ datum: new Date(d(datumOffset) + 'T10:00:00').toISOString(), text: `${art === 'teil' ? 'Teilrechnung' : 'Schlussrechnung'} ${nummer} erstellt` });
    if (status === 'bezahlt') r.verlauf.push({ datum: new Date(d(bezahltOffset!) + 'T10:00:00').toISOString(), text: `Zahlungseingang zu Rechnung ${nummer}` });
  };
  rechnung(r11, -220, 'bezahlt', -200);
  rechnung(r7, -90, 'bezahlt', -70);
  rechnung(r6, -45, 'offen', undefined, 1);
  // Teilrechnung während laufender Behandlung (Holm, erste 5 Termine)
  rechnung(r1, -8, 'offen', undefined, 0, 'teil', 5);
  rechnungen.find((x) => x.rezeptId === 'r-6')!.mahnungen = [d(-12)];

  // Berichte
  const bericht = (typ: Bericht['typ'], datumOffset: number, extra: Partial<Bericht>): Bericht => ({
    id: `b-${typ}-${datumOffset}`,
    typ,
    datum: d(datumOffset),
    empfaenger: 'beide',
    ausgangslage: '',
    ziele: '',
    verlauf: '',
    ergebnis: '',
    empfehlung: '',
    versendetAm: d(datumOffset),
    ...extra,
  });
  r1.berichte = [
    bericht('eingang', -29, {
      empfaenger: 'arzt',
      ausgangslage: 'Frau Holm (78 J.) leidet an einer feuchten AMD beidseits (Visus RA 0,04 / LA 0,02). Sie lebt allein, bewegt sich derzeit nur noch in Begleitung außer Haus. Stürze an Bordsteinen in den letzten Monaten.',
      ziele: 'Sichere Fortbewegung mit dem Langstock im Wohnumfeld, selbstständiger Weg zu Bäcker, Hausarzt und Bushaltestelle, sichere Straßenquerung an der Ampel.',
      ergebnis: 'Langstock angepasst, Grundtechniken eingeführt. Hohe Motivation, gute Restsehnutzung bei Tageslicht.',
      empfehlung: 'Training wie beantragt (20 UE) im häuslichen Umfeld.',
    }),
  ];
  r7.berichte = [
    bericht('abschluss', -95, {
      empfaenger: 'kostentraeger',
      ausgangslage: 'Herr Möller ist nach einem Arbeitsunfall erblindet (Sehnervatrophie). Vor dem Training keine selbstständige Mobilität.',
      ziele: 'Selbstständiger Arbeitsweg mit ÖPNV, sichere Orientierung im Betrieb.',
      verlauf: 'In 8 Einheiten wurden Langstocktechniken, Straßenquerung, Bus- und Bahnfahren sowie der Arbeitsweg erarbeitet.',
      ergebnis: 'Alle Ziele erreicht. Herr Möller bewältigt den Arbeitsweg (Bus + 600 m Fußweg) selbstständig und sicher.',
      empfehlung: 'Keine weitere Maßnahme erforderlich. Auffrischung bei Wohnort- oder Arbeitsplatzwechsel empfohlen.',
    }),
  ];

  // Folgeverordnung zu Lea Schulz (Teilgenehmigung 6 von 8 UE)
  const r12 = rez({ id: 'r-12', patientId: 'p-8', ausstellungsdatum: d(-2), diagnose: 'Morbus Stargardt', icd10: 'H35.5', verordneteEinheiten: 10, vorgaengerId: 'r-8', verordnung: 'Folgeverordnung: Training in Orientierung und Mobilität mit dem Blindenlangstock (10 UE à 60 Min.)' });
  r12.verlauf.push({ datum: ts(-2), text: `Folgeverordnung zu ${r8.nummer}` });

  // Beispiel-Dokument (Scan einer Verordnung, hier als Platzhaltergrafik)
  const dokumente: Dokument[] = [
    { id: 'd-1', patientId: 'p-2', rezeptId: 'r-2', titel: 'Verordnung Augenarzt (Scan)', kategorie: 'Verordnung', datum: d(-1), mime: 'image/svg+xml', groesse: MUSTER_SCAN.length, daten: MUSTER_SCAN, erstelltAm: ts(-1) },
    { id: 'd-2', patientId: 'p-1', rezeptId: 'r-1', titel: 'Genehmigung Musterkasse Nord', kategorie: 'Genehmigung', datum: d(-35), mime: 'image/svg+xml', groesse: MUSTER_GENEHMIGUNG.length, daten: MUSTER_GENEHMIGUNG, erstelltAm: ts(-35) },
  ];

  // Verlaufseinträge für KV-Schritte ergänzen
  for (const r of rezepte) {
    if (!r.kv) continue;
    r.verlauf.splice(1, 0, { datum: new Date(r.kv.datum + 'T11:00:00').toISOString(), text: `Kostenvoranschlag ${r.kv.nummer} angelegt` });
    if (r.kv.versendetAm) r.verlauf.push({ datum: new Date(r.kv.versendetAm + 'T11:00:00').toISOString(), text: `KV ${r.kv.nummer} an Kostenträger versendet` });
    if (r.kv.antwortAm)
      r.verlauf.push({
        datum: new Date(r.kv.antwortAm + 'T11:00:00').toISOString(),
        text: r.kv.status === 'abgelehnt' ? 'KV abgelehnt' : `KV ${r.kv.status === 'teilgenehmigt' ? 'teilweise ' : ''}genehmigt (${r.kv.genehmigteEinheiten} Einheiten), Nr. ${r.kv.genehmigungsnummer}`,
      });
    r.verlauf.sort((a, b) => a.datum.localeCompare(b.datum));
  }

  e.naechsteRezeptNummer = rezeptNr;
  e.naechsteKvNummer = kvNr;
  e.naechsteRechnungsnummer = reNr;

  await db.transaction('rw', [db.patienten, db.rezepte, db.termine, db.rechnungen, db.kostentraeger, db.aerzte, db.einstellungen, db.dokumente], async () => {
    await Promise.all([db.patienten.clear(), db.rezepte.clear(), db.termine.clear(), db.rechnungen.clear(), db.kostentraeger.clear(), db.aerzte.clear(), db.einstellungen.clear(), db.dokumente.clear()]);
    await db.dokumente.bulkAdd(dokumente);
    await db.kostentraeger.bulkAdd(kostentraeger);
    await db.aerzte.bulkAdd(aerzte);
    await db.patienten.bulkAdd(patienten);
    await db.rezepte.bulkAdd(rezepte);
    await db.termine.bulkAdd(ctx.termine);
    await db.rechnungen.bulkAdd(rechnungen);
    await db.einstellungen.put(e);
  });
}

/** Beim allerersten Start Beispieldaten laden */
let initPromise: Promise<void> | null = null;
export function initDatenbank(): Promise<void> {
  initPromise ??= db.einstellungen.get('main').then((vorhanden) => (vorhanden ? undefined : ladeBeispieldaten()));
  return initPromise;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const svgScan = (titel: string, zeilen: string[]) =>
  'data:image/svg+xml;base64,' +
  btoa(
    unescape(
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="595" height="842" viewBox="0 0 595 842"><rect width="595" height="842" fill="#fbfaf6"/><rect x="30" y="30" width="535" height="782" fill="none" stroke="#c9c4b5" stroke-width="2"/><text x="50" y="80" font-family="Arial" font-size="22" font-weight="bold" fill="#333">${xml(titel)}</text>${zeilen
          .map((z, i) => `<text x="50" y="${130 + i * 34}" font-family="Arial" font-size="15" fill="#444">${xml(z)}</text>`)
          .join('')}<text x="50" y="790" font-family="Arial" font-size="12" fill="#a33">MUSTER – fiktive Beispieldaten</text></svg>`,
      ),
    ),
  );

const MUSTER_SCAN = svgScan('Ärztliche Verordnung', [
  'Patient: Jonas Petersen, geb. 22.07.2002',
  'Kasse: BKK Beispiel · Vers.-Nr. B234567891',
  'Diagnose: Retinitis pigmentosa (H35.5)',
  'Verordnung: Blindenlangstock + Training O&M',
  'Umfang: 30 UE à 60 Min.',
  'Dr. med. Julia Augenstein, Augenheilkunde, Kiel',
]);

const MUSTER_GENEHMIGUNG = svgScan('Kostenzusage', [
  'Musterkasse Nord – Abteilung Hilfsmittel',
  'Versicherte: Margarete Holm',
  'Genehmigungsnummer: MKN-2026-44121',
  'Genehmigt: 20 UE Training O&M',
  'Fahrtkosten: nach Aufwand',
]);
