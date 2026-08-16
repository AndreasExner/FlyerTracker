# LostDogTracer

**Support App für die Suche vermisster Hunde**

LostDogTracer ist eine mobile-first Progressive Web App (PWA) zur Dokumentation von GPS-Standorten bei der Suche nach vermissten Hunden. Die App läuft als **Azure Static Web App** mit Azure Functions API und Azure Table Storage.

> **Lizenz:** MIT — siehe [LICENSE](LICENSE)

---

## Features

### Feldarbeit (Erfassen)
- GPS-Standort mit Kategorie, Kommentar und optionalem Foto speichern
- Automatische Erkennung des angemeldeten Benutzers
- Einträge und Karte zum ausgewählten Hund anzeigen
- **Meine/Alle Standorte**: Umschalten zwischen eigenen und allen Einträgen (Tabelle + Karte)
- Live-Standort-Tracking auf der Karte
- **Offline-Support**: Einträge werden in IndexedDB zwischengespeichert und bei Verbindung automatisch übertragen
- PWA-installierbar auf iOS und Android

### Neuer Eintrag (Manuelle Adresseingabe)
- Eigene Seite (ab PowerUser) zum nachträglichen Erfassen eines Standorts ohne GPS-Gerät
- Adresssuche über Nominatim (DE/NL) mit Kartenvorschau und verschiebbarem Marker zur Feinkorrektur
- Auswahl von Name, Hund, Kategorie, Kommentar und Zeitpunkt

### GPS-Daten (Verwaltung)
- Alle Einträge filtern (Name, Hund, Kategorie), sortieren und paginieren
- Einzel- und Massenbearbeitung (inkl. Zeitpunkt)
- Export als KML und CSV
- Kartenansicht mit Marker-Clustering, farbcodierten Routen, Kategorie-SVG-Icons
- Navigation zu Standorten via Google Maps, Apple Maps, Waze

### Einsätze & Abrechnung
- **Ein-/Auschecken**: Einsatz zu einem Hund starten und beenden; Dauer wird automatisch berechnet
- Optionale Erfassung von Kilometerstand (Start/Ende) und Tätigkeitsnotiz
- Eigene Einsätze filtern (Hund), bearbeiten, löschen und als CSV exportieren
- Manuelles Anlegen nachträglicher Einsätze möglich
- **Abrechnung / Statistik** (nur Buchhalter): Auswertung aller Einsätze über alle Benutzer mit Filtern (Benutzer, Hund, Zeitraum), Summen für Dauer und gefahrene Kilometer, CSV-Export

### Gast-Zugang
- Linkbasierter Zugang über einen 6-Zeichen-Schlüssel pro Hund
- Standorterfassung mit fester Kategorie (konfigurierbar)
- Keine Registrierung erforderlich
- **Persönlicher Token**: Gäste erhalten beim ersten Zugriff einen eindeutigen Token-Link, um eigene Einträge zu identifizieren und löschen zu können
- **Optionaler Spitzname**: Wird intern zur Zuordnung der Flyer-Standorte verwendet
- **Meine/Alle Flyer**: Gäste können zwischen eigenen und allen Flyer-Einträgen wechseln
- **Link teilen**: Share-Dialog (Web Share API) zum Versenden des persönlichen Links
- Begrüßung mit Spitzname auf der Startseite

### Owner-Zugang (Hundebesitzer)
- Eigener linkbasierter Zugang für den tatsächlichen Hundebesitzer über einen kryptografischen Owner-Schlüssel pro Hund
- Schlüssel wird ab Manager auf der Hunde-Seite erzeugt und als Link (`owner-home.html?key=…`) geteilt
- Kein Login erforderlich; Begrüßung mit Hundename
- Standort erfassen (mit Foto/Kommentar), eigene und alle Einträge in Tabelle und Karte anzeigen, eigene Einträge löschen

### Equipment
- Kameras und Fallen verwalten (📷)
- Standort zuweisen über drei Modi: Ort (Adresssuche), Mitglied (aus Benutzerliste) oder Im Einsatz (aus GPS-Records mit Kategorie Standort-Falle/Futterstelle)
- Equipment-Typ: Falle, Kamera (Abo), Kamera (SIM) oder Sonstiges
- Kommentar-, UserName-, Telefonnummer- (E.164) und SIM-Ablaufdatum-Felder
- SIM-Ablaufdatum nur bei Typ Falle und Kamera (SIM) relevant
- Typabhängiger Status-Badge in der Liste: SIM-Status (Guthaben / Läuft ab / Abgelaufen / n/a) bei Falle und Kamera (SIM), grünes "Abo" bei Kamera (Abo), kein Badge bei Sonstiges
- Detailansicht mit allen Feldern; Löschen ab Manager
- **Kartenansicht** (Read-only): Standard-Pin je Standort, Klick öffnet Modal mit allen dort gelagerten Einheiten
- **SMS Scharf/Unscharf** (ab Manager, nur Typ Falle): öffnet die SMS-App des Geräts mit vorbefülltem Steuerbefehl an die hinterlegte Telefonnummer, um die Falle fernzusteuern
- Berechtigungen: ab PowerUser sichtbar und Standort bearbeitbar, ab Manager Vollzugriff

### Administration
- Benutzer, Hunde und Kategorien verwalten
- Daten-Backup (JSON) und Wiederherstellung
- Konfiguration (Banner, Links, Dokumentation) über Config-Tabelle

### Sicherheit & Rollen
- API-Key-Schutz aller Endpunkte
- Rollenbasierte Zugriffskontrolle (Backend + Frontend):

| Rolle | Level | Zugriff |
|-------|-------|---------|
| User | 1 | Erfassen, Einsätze, Profil, Dokumentation |
| PowerUser | 2 | + GPS-Daten, Equipment (Standort bearbeiten) |
| Manager | 3 | + Hunde (inkl. Owner-Schlüssel), Benutzer (anlegen), Equipment (Vollzugriff + SMS) |
| Administrator | 4 | + Kategorien, Wartung, Benutzer bearbeiten/löschen, Config |

- **Buchhalter**: querliegendes Flag, unabhängig von der Rolle. Nur Administratoren setzen es je Benutzer. Schaltet die Abrechnungs-/Statistikansicht (`deployment-accounting.html`) und den Endpunkt `/deployments/accounting` frei — unabhängig vom Rollen-Level.
- **Owner-Zugang**: öffentlicher, tokenbasierter Zugang (24-Zeichen-Schlüssel je Hund) ohne Login — keine Rolle.
- PBKDF2-gehashte Passwörter, HMAC-signierte Tokens (48h Lebensdauer, im `localStorage` gehalten)
- Eingabe-Sanitisierung serverseitig (`InputSanitizer`, XSS-Schutz) plus Escaping bei der Anzeige
- Rate-Limiting: Read 120/min, Write 15/min, Auth 10/min pro IP
- Passwort-Sichtbarkeit-Toggle auf allen Kennwortfeldern

---

## Architektur

```
┌─────────────────────────────────────────────┐
│  Frontend (Vanilla HTML/CSS/JS, PWA)        │
│  Hosted: Azure Static Web App               │
├─────────────────────────────────────────────┤
│  API (Azure Functions, .NET 8 Isolated)     │
│  /api/save-location, /api/config            │
│  /api/lost-dogs, /api/categories            │
│  /api/manage/gps-records, /api/manage/...   │
│  /api/deployments, /api/deployments/...     │
│  /api/auth/login, /api/auth/verify          │
├─────────────────────────────────────────────┤
│  Azure Table Storage (8 Tabellen)           │
│  Azure Blob Storage (Fotos)                 │
└─────────────────────────────────────────────┘
```

### Tabellen

| Tabelle | PartitionKey | RowKey | Beschreibung |
|---------|-------------|--------|--------------|
| `GPSRecords` | Username / `GUEST` | Rev-Timestamp | GPS-Einträge mit FK auf Users, LostDogs, Categories |
| `Users` | `users` | Username | Benutzerkonten mit Rolle, DisplayName, Standort und Buchhalter-Flag |
| `LostDogs` | `lostdogs` | Name_Suffix | Vermisste Hunde mit DisplayName, Gast-Schlüssel und Owner-Schlüssel |
| `Categories` | `categories` | Timestamp-ID | Kategorien mit DisplayName und SVG-Symbol |
| `Equipment` | `equipment` | Timestamp-ID | Kameras/Fallen mit Typ, Standort, Kommentar, UserName, Telefonnummer und SIM-Ablaufdatum |
| `Deployments` | Username | Rev-Timestamp | Einsätze mit Hund, Start-/Endzeit, Dauer, Kilometer und Tätigkeit |
| `GuestTokens` | `guest` | UUID | Gast-Registrierungen mit Token und optionalem NickName |
| `Config` | `config` | `settings` | App-Konfiguration (Banner, Links, Dokumente) |

---

## Projektstruktur

```
LostDogTracer/
├── index.html                    # Login & Hauptmenü (rollenbasiert)
├── field-home.html               # Feldarbeit: Standort erfassen
├── field-records.html            # Feldarbeit: Einträge
├── field-map.html                # Feldarbeit: Karte├── deployments.html             # Einsätze: Ein-/Auschecken + eigene Liste
├── deployment-records.html      # Einsätze: Detailtabelle (bearbeiten/löschen)
├── deployment-accounting.html   # Einsätze: Abrechnung/Statistik (nur Buchhalter)├── gpsrecords.html               # GPS-Daten Verwaltung
├── map.html                      # Kartenansicht (Verwaltung)
├── lostdogs.html                 # Hunde verwalten
├── categories.html               # Kategorien verwalten
├── users.html                    # Benutzerverwaltung
├── maintenance.html              # Wartung (Backup/Restore/Cleanup)
├── profile.html                  # Eigenes Profil
├── docs.html                     # Dokumentation (PDF-Links)
├── equipment.html                # Equipment verwalten
├── equipment-map.html            # Equipment: Kartenansicht (Read-only)
├── guest-home.html               # Gast: Standort erfassen
├── guest-records.html            # Gast: Einträge
├── guest-map.html                # Gast: Karte
├── owner-home.html               # Owner: Standort erfassen
├── owner-records.html            # Owner: Einträge
├── owner-map.html                # Owner: Karte
├── sw.js                         # Service Worker (versionierter Cache)
├── manifest.json                 # PWA Manifest
│
├── js/
│   ├── auth.js                   # Auth-Helper (Token, Rolle, API-Key)
│   ├── theme.js                  # Theme, Config-Loader, App-Reset
│   ├── nav.js                    # Hamburger-Menü (Hauptseiten)
│   ├── field-nav.js              # Hamburger-Menü (Feldarbeit)
│   ├── guest-nav.js              # Hamburger-Menü (Gast)
│   ├── field-app.js              # Feldarbeit: GPS-Erfassung + Offline
│   ├── gpsrecords.js             # GPS-Daten: Tabelle, Filter, Edit
│   ├── deployments.js            # Einsätze: Ein-/Auschecken + Liste
│   ├── deployment-records.js     # Einsätze: Detailtabelle
│   ├── deployment-accounting.js  # Einsätze: Abrechnung/Statistik
│   ├── map.js                    # Karte: Marker, Routen, Edit
│   ├── lostdogs.js               # Hunde: CRUD mit Modalen
│   ├── categories.js             # Kategorien: CRUD + SVG-Picker
│   ├── users.js                  # Benutzer: CRUD (rollenabhängig)
│   ├── profile.js                # Profil: Passwort + Anzeigename
│   ├── backup.js                 # Backup: Export/Import
│   ├── offline-store.js          # IndexedDB Queue + Dropdown-Cache
│   ├── svg-icons.js              # SVG-Markersymbole
│   ├── equipment.js              # Equipment: CRUD + Standort-Modi
│   ├── equipment-map.js          # Equipment: Kartenansicht (gruppiert nach Standort)
│   ├── guest-app.js              # Gast: Erfassung + Token-Handling
│   ├── guest-map.js              # Gast: Karte
│   ├── guest-records.js          # Gast: Einträge
│   ├── owner-app.js              # Owner: Erfassung + Key-Handling
│   ├── owner-nav.js              # Hamburger-Menü (Owner)
│   ├── owner-map.js              # Owner: Karte
│   └── owner-records.js          # Owner: Einträge
│
├── api/
│   ├── Program.cs                # Azure Functions Host + DI
│   ├── Functions/
│   │   ├── SaveLocationFunction.cs
│   │   ├── GPSRecordsFunction.cs
│   │   ├── LostDogsFunction.cs
│   │   ├── CategoriesFunction.cs
│   │   ├── UsersFunction.cs
│   │   ├── AuthFunction.cs
│   │   ├── BackupRestoreFunction.cs
│   │   ├── CleanupFunction.cs
│   │   ├── ConfigFunction.cs
│   │   ├── DeploymentFunction.cs
│   │   ├── EquipmentFunction.cs
│   │   └── GuestTokenFunction.cs
│   └── Security/
│       ├── AdminAuth.cs          # Authentifizierung + Rollenverwaltung
│       ├── ApiKeyValidator.cs
│       ├── InputSanitizer.cs     # XSS-Schutz (Eingabe-Sanitisierung)
│       ├── PasswordHasher.cs
│       └── RateLimiter.cs
│
├── docs/                         # Rechtliche Seiten & PDF-Dokumentation
│   ├── datenschutz.html          # Datenschutzerklärung
│   ├── impressum.html            # Impressum
│   ├── LostDogTracer-1-Einrichtung_und_erste_Schritte.pdf
│   ├── LostDogTracer-2-Benutzer_Handbuch.pdf
│   └── LostDogTracer-3-Admin_Handbuch.pdf
│
├── scripts/
│   ├── SeedTables/               # Tabellen-Seeding
│   └── QueryGPS/                 # GPS-Abfrage-Tool
│
└── .github/workflows/
    └── azure-static-web-apps.yml # CI/CD (API-Key + Version Injection)
```

---

## Dokumentation

Ausführliche Anleitungen als PDF im `docs/`-Ordner und über die App unter "Dokumentation":

| Dokument | Inhalt |
|----------|--------|
| **Einrichtung und erste Schritte** | Azure-Ressourcen, Deployment, Erstkonfiguration |
| **Benutzer Handbuch** | Feldarbeit, GPS-Erfassung, Karten, Offline-Nutzung |
| **Admin Handbuch** | Verwaltung, Rollen, Konfiguration, Backup (nur Administratoren) |

---

## Lokal starten

### Voraussetzungen
- [.NET 8 SDK](https://dotnet.microsoft.com/)
- [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) v4
- [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) (VS Code Extension)

### Setup
```bash
# 1. Azurite starten (VS Code: Ctrl+Shift+P → "Azurite: Start")

# 2. API starten
cd api
dotnet build
func start --dotnet-isolated --port 7071

# 3. Frontend: index.html mit Live Server öffnen
```

Standard-Seed-Login: `admin` / `LostDogTracer2026!`

---

## Deployment

Automatisch via GitHub Actions bei Push auf `main`:
- Prod API-Key aus GitHub Secrets injiziert (`%%PROD_API_KEY%%`)
- Build-Version generiert und in Navigation + Service Worker injiziert (`v1.5.N-hash`)
- Config-Tabelle wird beim ersten API-Aufruf auto-geseeded

---

## Technologie-Stack

| Komponente | Technologie |
|------------|-------------|
| Frontend | Vanilla HTML/CSS/JS (kein Framework) |
| Karte | Leaflet + MarkerCluster |
| API | Azure Functions v4 (.NET 8 Isolated) |
| Datenbank | Azure Table Storage |
| Dateispeicher | Azure Blob Storage (Fotos) |
| Hosting | Azure Static Web Apps |
| CI/CD | GitHub Actions |
| PWA | Service Worker, IndexedDB, Web App Manifest |

---

## Lizenz

MIT — siehe [LICENSE](LICENSE)
