# FlyerTracker – GPS Standort Tracker für vermisste Hunde

Mobile-first Web-App zum Speichern von GPS-Standorten, gehostet als **Azure Static Web App** mit integrierter Azure Functions API und Azure Table Storage.

## Architektur

```
Frontend (HTML/CSS/JS)
    │
    ├── GET /api/names          → Table: Names
    ├── GET /api/lost-dogs        → Table: LostDogs
    └── POST /api/save-location  → Table: GPSRecords
    │
Azure Table Storage (3 Tabellen)
```

## Tabellen

| Tabelle        | PartitionKey | RowKey          | Felder                                          |
|----------------|-------------|-----------------|--------------------------------------------------|
| `Names`        | `names`     | `<id>`          | `name`                                           |
| `LostDogs`     | `locations` | `<id>`          | `location`                                       |
| `GPSRecords`   | `<name>`    | `<rev-timestamp>`| `lostDog`, `latitude`, `longitude`, `accuracy`, `recordedAt` |

## Lokal starten

### Voraussetzungen
- [.NET 10 SDK](https://dotnet.microsoft.com/)
- [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) v4
- [Azurite](https://learn.microsoft.com/azure/storage/common/storage-use-azurite) — VS Code Extension „Azurite" oder als npm-Paket
- VS Code Extension „Live Server" (für das Frontend)

### Setup
```bash
# 1. Azurite starten (VS Code: Ctrl+Shift+P → "Azurite: Start")

# 2. API bauen
cd Api
dotnet build

# 3. Stammdaten laden (einmalig)
cd ../scripts/SeedTables
dotnet run

# 4. API starten (in separatem Terminal)
cd ../../Api
func start --dotnet-isolated --port 7071

# 5. Frontend öffnen: index.html mit Live Server in VS Code öffnen
#    (Rechtsklick → "Open with Live Server")
```

Die API läuft auf http://localhost:7071, das Frontend erkennt localhost automatisch.

## Deployment nach Azure

```bash
# SWA erstellen
az staticwebapp create -n flyertracker-app -g <resource-group> --sku Free

# Storage Account Connection String setzen
az staticwebapp appsettings set -n flyertracker-app \
  --setting-names STORAGE_CONNECTION_STRING="<connection-string>"

# Deployen (mit SWA CLI oder GitHub Actions)
swa deploy . --api-location Api --deployment-token <token>
```

## Funktionen

- [x] Name auswählen (zentral bereitgestellt)
- [x] Hund – Ort auswählen (zentral bereitgestellt)
- [x] GPS-Standort speichern
- [x] Auswahl wird im Browser gespeichert (localStorage)
- [x] Mobile-first UI
- [ ] PWA-Installation (Icons hinzufügen)
- [ ] Standort-Historie anzeigen
