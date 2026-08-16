# Berechtigungsmatrix – LostDogTracer

> Automatisch aus dem Code abgeleitet. **Verbindlich ist immer das Backend** (Azure Functions,
> `ValidateTokenWithRole` in [`api/`](../api)). Frontend-Gates blenden UI nur aus Komfortgründen aus
> und sind **keine** Sicherheitsgrenze.
>
> Legende: **✓ = erlaubt**, **– = kein Zugriff**. Zugriff gilt „ab Level X aufwärts" (ein Manager
> kann alles, was PowerUser und User können).

## Rollenmodell

| Rolle | Level | Definiert in |
|-------|-------|--------------|
| User | 1 | [`AdminAuth.cs`](../api/Security/AdminAuth.cs) |
| PowerUser | 2 | " |
| Manager | 3 | " |
| Administrator | 4 | " |
| *Buchhalter (Zusatz-Flag)* | quer liegend | `isAccountant` – nur von Administrator vergebbar |

---

## 1. Seitenzugriff (Navigation / `requireRole`)

| Seite | User (1) | PowerUser (2) | Manager (3) | Admin (4) |
|-------|:--:|:--:|:--:|:--:|
| Erfassen (`field-home.html`), Karte, GPS-Daten (`gpsrecords.html`) | ✓ | ✓ | ✓ | ✓ |
| Einsatzzeiten (`deployments.html`)¹ | ✓ | ✓ | ✓ | ✓ |
| Profil (`profile.html`), Doku (`docs.html`) | ✓ | ✓ | ✓ | ✓ |
| Abrechnung (`deployment-accounting.html`) | nur Buchhalter | nur Buchhalter | nur Buchhalter | nur Buchhalter |
| Neuer Eintrag (`address-entry.html`) | – | ✓ | ✓ | ✓ |
| Equipment (`equipment.html`)¹ | – | ✓ | ✓ | ✓ |
| Hunde (`lostdogs.html`) | – | – | ✓ | ✓ |
| Benutzer (`users.html`) | – | – | ✓ | ✓ |
| Kategorien (`categories.html`) | – | – | – | ✓ |
| Wartung (`maintenance.html`) | – | – | – | ✓ |

¹ Zusätzlich per Feature-Flag (`featDeployment`, `featEquipment`) global abschaltbar.

**Öffentlich (kein Login erforderlich):** Login-Seite, alle `guest-*`- und `owner-*`-Seiten.

---

## 2. Funktionsrechte im Detail (Backend-durchgesetzt)

### GPS-Erfassung & eigene Datensätze

| Aktion | U | PU | M | A |
|--------|:--:|:--:|:--:|:--:|
| GPS-Standort erfassen (`/save-location`) | öffentlich (jeder, auch Gast) | | | |
| Eigene Datensätze ansehen/löschen (`/my-records`) | öffentlich (Gast-/Owner-Key) | | | |

### GPS-Verwaltung (`gpsrecords.html`)

| Aktion | U | PU | M | A |
|--------|:--:|:--:|:--:|:--:|
| GPS-Liste ansehen (`/manage/gps-records`) | ✓ | ✓ | ✓ | ✓ |
| GPS-Datensätze bearbeiten/löschen | – | ✓ | ✓ | ✓ |
| Export | – | ✓ | ✓ | ✓ |

> User (1) hat hier **Nur-Lese-Modus**: Checkboxen, Aktions- und Export-Buttons sind ausgeblendet.

### Neuer Eintrag – manuelle Adresseingabe (`address-entry.html`)

| Aktion | U | PU | M | A |
|--------|:--:|:--:|:--:|:--:|
| Seite aufrufen (`requireRole(2)`) | – | ✓ | ✓ | ✓ |
| Eintrag per Adresssuche speichern (`/save-location`) | – | ✓ | ✓ | ✓ |

### Einsatzzeiten (`deployments.html`)

| Aktion | U | PU | M | A |
|--------|:--:|:--:|:--:|:--:|
| Ein-/Ausstempeln, eigene Einsätze verwalten | ✓ | ✓ | ✓ | ✓ |
| Einsatzliste gesamt / CSV-Export | ✓ | ✓ | ✓ | ✓ |
| Abrechnungsdaten (`/manage/deployments/accounting`) | nur Buchhalter | nur Buchhalter | nur Buchhalter | nur Buchhalter |

### Equipment (`equipment.html`)

| Aktion | U | PU | M | A |
|--------|:--:|:--:|:--:|:--:|
| Equipment-Liste ansehen | – | ✓ | ✓ | ✓ |
| **Standort** ändern | – | ✓ | ✓ | ✓ |
| Name / Kommentar / Typ ändern | – | – | ✓ | ✓ |
| Equipment anlegen / löschen | – | – | ✓ | ✓ |
| UID-Feld sehen & bearbeiten (nur Kamera-Typen) | – | – | ✓ | ✓ |
| SMS **Scharf/Unscharf** (nur Typ *Falle*) | – | – | ✓ | ✓ |

> Die **UID** wird in der Equipment-Liste erst ab Level 3 überhaupt an den Client ausgeliefert
> (nicht nur clientseitig ausgeblendet).

### Hunde (`lostdogs.html`)

| Aktion | U | PU | M | A |
|--------|:--:|:--:|:--:|:--:|
| Hunde anlegen/bearbeiten/löschen | – | – | ✓ | ✓ |
| Owner-Key generieren | – | – | ✓ | ✓ |

### Benutzerverwaltung (`users.html` / [`UsersFunction.cs`](../api/Functions/UsersFunction.cs))

| Aktion | U | PU | M | A |
|--------|:--:|:--:|:--:|:--:|
| Benutzerliste ansehen | – | – | ✓ | ✓ |
| Benutzer anlegen | – | – | ✓ (nur Rolle *User*) | ✓ (jede Rolle) |
| Rolle / Buchhalter-Flag / Standort ändern | – | – | – | ✓ |
| Passwort zurücksetzen | – | – | – | ✓ |
| Benutzer löschen (nicht sich selbst) | – | – | – | ✓ |

### Konfiguration & System

| Aktion | U | PU | M | A |
|--------|:--:|:--:|:--:|:--:|
| Öffentliche Config lesen (`/config`) | öffentlich | | | |
| Config ändern (Banner, Feature-Flags, Doku-Links) | – | – | ✓ | ✓ |
| Kategorien verwalten (anlegen/ändern/löschen/seed) | – | – | – | ✓ |
| Backup exportieren / Restore importieren | – | – | – | ✓ |
| Datenbereinigung (Cleanup Vorschau/Ausführen) | – | – | – | ✓ |

### Eigenes Konto (jeder eingeloggte Nutzer)

| Aktion | U | PU | M | A |
|--------|:--:|:--:|:--:|:--:|
| Eigenes Passwort ändern | ✓ | ✓ | ✓ | ✓ |
| Eigenes Profil (Anzeigename, Standort) ändern | ✓ | ✓ | ✓ | ✓ |

---

## 3. Sonderfall „Buchhalter" (`isAccountant`)

- **Quer liegendes Flag**, unabhängig vom Rollen-Level – wird **nur vom Administrator** über den
  Benutzer-Edit gesetzt (`lostdogtracer_accountant`).
- Schaltet frei: Zugriff auf `deployment-accounting.html` und den Abrechnungs-Button in den
  Einsatzzeiten.
- Ohne Flag → automatische Weiterleitung zurück zu `deployments.html`.

---

## 4. Hinweise

- **Verbindlich ist das Backend:** Jeder `/manage/*`-Endpunkt prüft das Level serverseitig
  (`ValidateTokenWithRole`). Frontend-Gates sind reiner UX-Komfort.
- **Öffentliche Endpunkte** (Erfassung, Gast-/Owner-Abfragen, Login, Config-GET, Kategorien-GET)
  haben **bewusst keine** Rollenprüfung – Teil des Gast-/Owner-Konzepts.
- **Feature-Flags** (`featDeployment`, `featEquipment`, gesetzt ab Manager) blenden Navigationspunkte
  aus, selbst wenn das Rollen-Level ausreicht.
