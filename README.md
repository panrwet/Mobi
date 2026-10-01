# Mobi – Praxissoftware für Reha-Fachkräfte Orientierung & Mobilität (O&M)

Mobile-first Web-App (PWA) zur Verwaltung von Patienten, Verordnungen, Kostenvoranschlägen,
Terminen, Dokumentation und Rechnungen. **Alle Daten bleiben lokal im Browser des Geräts**
(IndexedDB) – es gibt keinen Server.

> ⚠️ Testversion mit **fiktiven Beispieldaten**. Keine echten Patientendaten eingeben, solange
> Datensicherung/Verschlüsselung nicht geklärt sind (siehe „Datenschutz“).

## Funktionen

| Bereich | Inhalt |
|---|---|
| **Startseite** | Schnellzugriff, Kennzahlen, Termine heute, **Eingangsliste** aller offenen Rezepte (mit nächstem Schritt und Hinweisen), offene Rechnungen, abgeschlossene Rezepte |
| **Patienten** | Stammdaten, Versicherung/Kostenträger, Versichertennummer, Zuzahlungsbefreiung, Sehstatus, Visus, GdB/Merkzeichen, Einwilligungen (Datenschutz, Schweigepflichtentbindung), Archiv |
| **Rezepte** | Verordnung (Arzt, Diagnose, ICD-10, Einheiten), Status-Pipeline, Verlauf/Audit-Trail, Stornierung |
| **Kostenvoranschlag** | Positionen aus Leistungskatalog, Begründung, Ziele, **PDF**, „versendet“, Genehmigung / Teilgenehmigung / Ablehnung mit Genehmigungsnummer |
| **Termine** | Einzeltermine und **Serienplanung** (Wochentage, Anzahl, Konfliktprüfung), Status (geplant, durchgeführt, abgesagt, ausgefallen), km |
| **Dokumentation** | Je Termin Inhalte / Verlauf / nächste Schritte, **Unterschrift per Finger**, Leistungsnachweis als PDF |
| **Kalender** | Tag (mit Wochenleiste), Woche, Monat |
| **Rechnungen** | Automatisch aus KV + geleisteten Einheiten + km, fortlaufende Nummern, **PDF**, Zahlungseingang, Erinnerung, Storno (keine Löschung, GoBD) |
| **Stammdaten** | Name, Berufsbezeichnung, Adresse, IK, Steuernummer, USt-Hinweis, Bankverbindung (IBAN-Prüfung), Leistungen & Preise, Kostenträger, Ärzte |
| **Einstellungen** | Fristen (KV-Wiedervorlage, Verordnungsgültigkeit), Zahlungsziel, Nummernkreise, Zuzahlung, Farbschema, **Datensicherung (Export/Import)**, Beispieldaten neu laden |

### Status eines Rezepts

`Neu → KV in Arbeit → KV versendet → Genehmigt → Termine verplant → In Behandlung → (Doku offen) → Abrechenbar → Rechnung gestellt → Abgeschlossen`
(+ `KV abgelehnt`, `Storniert`)

Der Status wird **automatisch** aus KV, Terminen, Dokumentation und Rechnungen berechnet
(`src/lib/status.ts`). Zusätzliche Hinweise erscheinen z. B. bei unbeantwortetem KV,
Terminen ohne Status, fehlender Doku, überfälligen Rechnungen oder alten Verordnungen.

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Unit-Tests (Statuslogik, Abrechnung, Beispieldaten, PDFs)
npm run build      # Produktions-Build nach dist/
```

Technik: React 19, TypeScript, Vite, Dexie (IndexedDB), jsPDF. Routing per Hash, daher als
statische Seite überall hostbar.

## Auf dem Smartphone nutzen

Der Workflow `.github/workflows/deploy.yml` veröffentlicht jeden Stand von `main` auf GitHub Pages.
Einmalig im Repo unter **Settings → Pages → Source: „GitHub Actions“** aktivieren. Danach die
Seite im Smartphone-Browser öffnen und „Zum Startbildschirm hinzufügen“ – die App läuft dann
wie eine installierte App und auch offline.

## Datenschutz & Recht (Kurzfassung)

- Gesundheitsdaten (Art. 9 DSGVO): lokale Speicherung, keine Cloud → kein C5-Testat nach § 393 SGB V nötig.
  Gerät mit PIN/Verschlüsselung schützen, Sicherungen verschlüsselt ablegen.
- Aufbewahrung: Dokumentation 10 Jahre (§ 630f BGB), Rechnungen 8 Jahre (§ 147 AO).
- GKV-Abrechnung: § 302 SGB V sieht elektronische Abrechnung vor; Papier-/PDF-Rechnungen können
  mit 5 % Abzug belegt werden (§ 303 SGB V). Eigenes IK erforderlich.
- Diese Software ersetzt keine Rechts- oder Steuerberatung.

## Mögliche nächste Schritte

- Verschlüsselung der lokalen Daten mit Passwort/PIN, automatische Sperre
- Elektronische Abrechnung nach § 302 (oder Export für ein Abrechnungszentrum)
- Abschluss-/Verlaufsbericht an Arzt/Kostenträger als PDF-Vorlage
- Folgeverordnung aus bestehendem Rezept erzeugen
- Synchronisation zwischen Geräten (Ende-zu-Ende-verschlüsselt)
