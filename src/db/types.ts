// Datenmodell der App. Alle Datumswerte als ISO-Strings (YYYY-MM-DD bzw. volle ISO-Zeit bei Terminen).

export type ID = string;

export type KostentraegerTyp = 'GKV' | 'PKV' | 'Beihilfe' | 'Sozialhilfe' | 'Eingliederungshilfe' | 'BG' | 'DRV' | 'Agentur' | 'Selbstzahler' | 'Sonstige';

export interface Adresse {
  strasse: string;
  plz: string;
  ort: string;
}

export interface Kostentraeger {
  id: ID;
  name: string;
  typ: KostentraegerTyp;
  ik: string; // Institutionskennzeichen (9-stellig)
  adresse: Adresse;
  telefon?: string;
  email?: string;
  fax?: string;
  notiz?: string;
}

export interface Arzt {
  id: ID;
  titel?: string;
  name: string;
  fachrichtung: string;
  bsnr?: string; // Betriebsstättennummer
  lanr?: string; // Lebenslange Arztnummer
  adresse: Adresse;
  telefon?: string;
  fax?: string;
}

export type Sehstatus = 'blind' | 'hochgradig sehbehindert' | 'sehbehindert' | 'sonstige';

export interface Patient {
  id: ID;
  anrede: 'Frau' | 'Herr' | 'Divers' | '';
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  adresse: Adresse;
  telefon?: string;
  email?: string;
  notfallkontakt?: string;
  // Medizinisches / Teilhabe
  sehstatus: Sehstatus;
  diagnoseText?: string; // z. B. Retinitis pigmentosa
  visus?: string;
  gdb?: number;
  merkzeichen?: string; // z. B. "Bl, G, B"
  hilfsmittel?: string; // vorhandene Hilfsmittel
  // Versicherung
  versicherung: {
    kostentraegerId: ID | '';
    versichertennummer: string;
    status: 'Mitglied' | 'Familienversichert' | 'Rentner' | '';
    zuzahlungsbefreit: boolean;
    befreitBis?: string;
  };
  // Einwilligungen
  datenschutzEinwilligung?: string; // Datum
  schweigepflichtentbindung?: string; // Datum
  notizen?: string;
  archiviert?: boolean;
  erstelltAm: string;
}

export type KVStatus = 'entwurf' | 'versendet' | 'genehmigt' | 'teilgenehmigt' | 'abgelehnt';

/** einheit = Menge richtet sich nach geleisteten Einheiten, pauschal = fester Betrag, km = Fahrtkosten */
export type PositionTyp = 'einheit' | 'pauschal' | 'km';

export interface Position {
  leistungId?: ID;
  typ: PositionTyp;
  bezeichnung: string;
  positionsnummer?: string;
  menge: number;
  einheit: string;
  einzelpreis: number; // EUR
}

export interface Kostenvoranschlag {
  nummer: string;
  datum: string;
  positionen: Position[];
  begruendung: string;
  ziele: string;
  status: KVStatus;
  versendetAm?: string;
  antwortAm?: string;
  genehmigungsnummer?: string;
  genehmigteEinheiten?: number;
  antwortNotiz?: string;
}

export interface VerlaufEintrag {
  datum: string; // ISO-Zeit
  text: string;
}

export type Leistungsart = 'O&M' | 'LPF' | 'Sonstige';

export interface Rezept {
  id: ID;
  nummer: string;
  patientId: ID;
  arztId: ID | '';
  kostentraegerId: ID | '';
  leistungsart: Leistungsart;
  ausstellungsdatum: string;
  eingangsdatum: string;
  diagnose: string;
  icd10: string;
  verordnung: string; // Text der Verordnung
  verordneteEinheiten: number;
  kv?: Kostenvoranschlag;
  notizen?: string;
  verlauf: VerlaufEintrag[];
  storniert?: boolean;
  erstelltAm: string;
}

export type TerminStatus = 'geplant' | 'durchgefuehrt' | 'abgesagt_patient' | 'abgesagt_praxis' | 'ausgefallen';

export interface Dokumentation {
  inhalte: string;
  verlauf: string;
  naechsteSchritte: string;
  erstelltAm: string;
}

export interface Termin {
  id: ID;
  rezeptId: ID;
  patientId: ID;
  start: string; // ISO-Zeit
  dauerMin: number;
  einheiten: number; // abgerechnete Einheiten
  ort: string;
  status: TerminStatus;
  km?: number;
  doku?: Dokumentation;
  unterschrift?: string; // DataURL der Patientenunterschrift
  notiz?: string;
}

export type RechnungStatus = 'offen' | 'bezahlt' | 'storniert';

export interface Rechnung {
  id: ID;
  nummer: string;
  rezeptId: ID;
  patientId: ID;
  kostentraegerId: ID | '';
  datum: string;
  leistungszeitraum: { von: string; bis: string };
  faelligAm: string;
  positionen: Position[];
  zuzahlung: number;
  summe: number; // Summe Positionen
  zahlbetrag: number; // vom Kostenträger zu zahlen (summe - zuzahlung)
  status: RechnungStatus;
  bezahltAm?: string;
  storniertAm?: string;
  stornoGrund?: string;
  mahnstufe: number;
  // Schnappschüsse: Rechnungen sind nach Erstellung unveränderlich (GoBD)
  empfaenger: { name: string; adresse: Adresse; ik?: string };
  patientInfo: { name: string; geburtsdatum: string; versichertennummer: string };
  genehmigungsnummer?: string;
}

export interface Leistung {
  id: ID;
  bezeichnung: string;
  positionsnummer: string;
  einheit: string;
  preis: number;
  typ: PositionTyp;
  leistungsart: Leistungsart;
}

export interface Einstellungen {
  id: 'main';
  // Praxis / Reha-Fachkraft
  name: string;
  berufsbezeichnung: string;
  praxisname: string;
  adresse: Adresse;
  telefon: string;
  email: string;
  ik: string;
  steuernummer: string;
  ustHinweis: string;
  // Bank
  kontoinhaber: string;
  iban: string;
  bic: string;
  bank: string;
  // Preise & Leistungen
  leistungen: Leistung[];
  kmPauschale: number;
  // Abläufe
  standardDauerMin: number;
  zahlungszielTage: number;
  kvWiedervorlageTage: number;
  verordnungGueltigTage: number;
  rechnungPraefix: string;
  naechsteRechnungsnummer: number;
  kvPraefix: string;
  naechsteKvNummer: number;
  rezeptPraefix: string;
  naechsteRezeptNummer: number;
  zuzahlungAktiv: boolean;
  // Darstellung
  theme: 'auto' | 'hell' | 'dunkel';
}
