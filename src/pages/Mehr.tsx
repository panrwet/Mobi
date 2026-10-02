import { Page } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Card, ListLink } from '../components/ui';

export function Mehr() {
  return (
    <Page title="Mehr">
      <Card>
        <ul className="list">
          <ListLink to="/rezepte" left={<Icon name="rx" />} title="Rezepte" sub="Alle Verordnungen nach Status" />
          <ListLink to="/rezepte/neu" left={<Icon name="plus" />} title="Neues Rezept erfassen" />
          <ListLink to="/suche" left={<Icon name="search" />} title="Suche" sub="Patienten, Rezepte, Rechnungen, Dokumente" />
          <ListLink to="/statistik" left={<Icon name="chart" />} title="Statistik & Export" sub="Umsatz, Einheiten, Kostenträger, CSV" />
          <ListLink to="/stammdaten?tab=praxis" left={<Icon name="briefcase" />} title="Stammdaten" sub="Name, IK, Bankverbindung" />
          <ListLink to="/stammdaten?tab=preise" left={<Icon name="euro" />} title="Leistungen & Preise" />
          <ListLink to="/stammdaten?tab=kostentraeger" left={<Icon name="file" />} title="Kostenträger" />
          <ListLink to="/stammdaten?tab=aerzte" left={<Icon name="users" />} title="Ärzte" />
          <ListLink to="/einstellungen" left={<Icon name="settings" />} title="Einstellungen" sub="Fristen, Nummernkreise, Datensicherung" />
          <ListLink to="/info" left={<Icon name="alert" />} title="Datenschutz & rechtliche Hinweise" />
        </ul>
      </Card>
    </Page>
  );
}

export function Info() {
  return (
    <Page title="Hinweise" back>
      <Card title="Datenspeicherung">
        <p>
          Mobi speichert alle Daten ausschließlich lokal im Browser dieses Geräts (IndexedDB). Es findet keine Übertragung an einen Server statt. Damit entfällt die
          Pflicht zu einem C5-Testat für Cloud-Dienste nach § 393 SGB V. Gleichzeitig gilt: Geht das Gerät verloren oder werden Browserdaten gelöscht, sind die Daten
          weg – bitte regelmäßig unter <i>Einstellungen → Datensicherung</i> sichern.
        </p>
        <p>Das Gerät sollte mit Bildschirmsperre (PIN/Biometrie) und Geräteverschlüsselung geschützt sein. Sicherungsdateien können mit einem Passwort verschlüsselt werden.</p>
      </Card>
      <Card title="Gesundheitsdaten (Art. 9 DSGVO)">
        <ul>
          <li>Datenschutz-Einwilligung und Schweigepflichtentbindung je Patient dokumentieren (Felder im Patientenprofil).</li>
          <li>Verzeichnis von Verarbeitungstätigkeiten führen.</li>
          <li>Sicherungsdateien nur verschlüsselt speichern oder versenden.</li>
        </ul>
      </Card>
      <Card title="Aufbewahrung">
        <ul>
          <li>Behandlungsdokumentation: 10 Jahre nach Abschluss (§ 630f BGB).</li>
          <li>Rechnungen und Buchungsbelege: 8 Jahre (§ 147 AO).</li>
          <li>Rechnungen werden deshalb nie gelöscht, sondern nur storniert; Patienten mit Rezepten nur archiviert.</li>
        </ul>
      </Card>
      <Card title="Abrechnung mit Krankenkassen">
        <ul>
          <li>Das O&M-Training wird als Einweisung in das Hilfsmittel Blindenlangstock (§ 33 Abs. 1 SGB V, PG 07 Hilfsmittelverzeichnis) übernommen; ärztliche Verordnung und Genehmigung (KV) sind Voraussetzung.</li>
          <li>Nach § 302 SGB V ist die elektronische Abrechnung vorgesehen. Bei Papierrechnungen kann die Kasse nach § 303 SGB V 5 % Nacherfassungsabzug einbehalten.</li>
          <li>Für die Abrechnung mit GKV wird ein Institutionskennzeichen (IK) benötigt.</li>
          <li>Ob Leistungen umsatzsteuerfrei sind (§ 4 Nr. 14 UStG), bitte steuerlich prüfen lassen.</li>
        </ul>
        <p className="small muted">Diese Hinweise ersetzen keine Rechts- oder Steuerberatung.</p>
      </Card>
    </Page>
  );
}
