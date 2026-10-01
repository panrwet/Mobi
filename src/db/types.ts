// Datenmodell der App. Alle Datumswerte als ISO-Strings (YYYY-MM-DD bzw. volle ISO-Zeit bei Terminen).

export type ID = string;

/** Wird von der Datenbank bei jeder Änderung automatisch gesetzt (für den Geräte-Abgleich) */
export interface Stempel {
  geaendertAm?: string;
}

export type KostentraegerTyp = 'GKV' | 'PKV' | 'Beihilfe' | 'Sozialhilfe' | 'Eingliederungshilfe' | 'BG' | 'DRV' | 'Agentur' | 'Selbstzahler' | 'Sonstige';

export interface Adresse {
  strasse: string;
  plz: string;
  ort: string;
}

export interface Kostentraeger extends Stempel {
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

export interface Arzt extends Stempel {
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

export interface Patient extends Stempel {
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

export type KVStatus = 'entwurf' | 'versendet' | 'genehmigt' | 'teilgenehmigt' | 'abgelehnt' | 'widerspruch';

/** einheit = Menge richtet sich nach geleisteten Einheiten, pauschal = fester Betrag, km = Fahrtkosten */
export type PositionTyp = 'einheit' | 'pauschal' | 'km';

export interface Position {
  leistungId?: ID;
  typ: PositionTyp;
  /** nur bei Pauschalen: mit der ersten Rechnung (beginn) oder erst mit der Schlussrechnung (ende) abrechnen */
  zeitpunkt?: 'beginn' | 'ende';
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
  widerspruchAm?: string;
  widerspruchBegruendung?: string;
}

export interface VerlaufEintrag {
  datum: string; // ISO-Zeit
  text: string;
}

export type Leistungsart = 'O&M' | 'LPF' | 'Sonstige';

export type BerichtTyp = 'eingang' | 'verlauf' | 'abschluss';

export interface Bericht {
  id: ID;
  typ: BerichtTyp;
  datum: string;
  empfaenger: 'arzt' | 'kostentraeger' | 'beide';
  ausgangslage: string;
  ziele: string;
  verlauf: string;
  ergebnis: string;
  empfehlung: string;
  versendetAm?: string;
}

export interface Rezept extends Stempel {
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
  berichte?: Bericht[];
  /** Folgeverordnung zu diesem Rezept */
  vorgaengerId?: ID;
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

export interface Termin extends Stempel {
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
  /** Rechnung, mit der dieser Termin abgerechnet wurde */
  rechnungId?: ID;
}

export type RechnungStatus = 'offen' | 'bezahlt' | 'storniert';

export interface Rechnung extends Stempel {
  id: ID;
  nummer: string;
  /** Teilrechnung (Abschlag während der Behandlung) oder Schlussrechnung */
  art: 'teil' | 'schluss';
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
  mahnungen?: string[]; // Daten der Zahlungserinnerungen
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
  zeitpunkt?: 'beginn' | 'ende';
  leistungsart: Leistungsart;
}

export type DokumentKategorie = 'Verordnung' | 'Genehmigung' | 'Bescheid' | 'Befund' | 'Schriftverkehr' | 'Einwilligung' | 'Sonstiges';

export interface Dokument extends Stempel {
  id: ID;
  patientId: ID;
  rezeptId?: ID;
  titel: string;
  kategorie: DokumentKategorie;
  datum: string;
  mime: string;
  groesse: number;
  daten: string; // DataURL (wird verschlüsselt gespeichert)
  erstelltAm: string;
}

/** Unverschlüsselte Verwaltungsdaten (Schlüsselablage, Geräte-ID) */
export type Meta =
  | { id: 'krypto'; salt: string; iterationen: number; dekVerpackt: string; erstelltAm: string }
  | { id: 'geraet'; geraeteId: string; letzterAbgleich?: string };

/** Löschvermerk, damit Löschungen beim Geräte-Abgleich übertragen werden */
export interface Geloescht {
  id: string; // `${tabelle}:${schluessel}`
  tabelle: string;
  schluessel: string;
  am: string;
}

export interface Einstellungen extends Stempel {
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
  autoSperreMin: number;
  // Darstellung
  theme: 'auto' | 'hell' | 'dunkel';
}
