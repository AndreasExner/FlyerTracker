# Sicherheitsreview: LostDogTracer

**Stand:** 16. August 2026  
**Umfang:** Azure Functions Backend, Browser-Frontend, Service Worker, Azure Static Web Apps-Konfiguration, direkte NuGet-Abhängigkeiten und Datenschutzangaben  
**Methode:** Statische, adversariale Codeanalyse. Es wurden keine Penetrationstests gegen eine bereitgestellte Azure-Umgebung durchgeführt.

## Zusammenfassung

Der Review ergab 12 relevante Findings:

| Schweregrad | Anzahl |
|---|---:|
| Kritisch | 2 |
| Hoch | 2 |
| Mittel | 6 |
| Niedrig | 2 |

Die dringendsten Risiken sind bekannte Fallback-Geheimnisse, fehlende Objektberechtigungen für GPS-Daten, ungeprüfte Standortzuordnungen und gespeichertes XSS mit möglichem Diebstahl eines Administrator-Tokens. Vor einem produktiven Einsatz sollten mindestens die kritischen und hohen Findings behoben werden.

## Findings

### 1. Kritisch: Bekannte Produktionsgeheimnisse als Fallback

**Betroffene Stellen:** [api/Program.cs](../api/Program.cs#L12-L26), [api/Security/AdminAuth.cs](../api/Security/AdminAuth.cs#L45-L76)

API-Key, HMAC-Secret, Admin-Benutzer und Admin-Passwort besitzen feste Standardwerte. Fehlt eine App-Einstellung, startet die Anwendung trotzdem mit öffentlich bekannten Werten. Ist die Benutzertabelle leer, wird das bekannte Administratorkonto automatisch angelegt. Mit dem Standard-HMAC-Secret können außerdem gültige Tokens für bekannte Benutzernamen erzeugt werden; die Rolle wird anschließend zwar aus der Datenbank gelesen, der Standardbenutzer `admin` ist jedoch vorhersehbar.

**Auswirkung:** Vollständige administrative Übernahme, Datenexport, Datenmanipulation und Massenlöschung.

**Empfehlung:**

- Außerhalb expliziter lokaler Entwicklung beim Fehlen aller sicherheitskritischen Einstellungen den Start abbrechen.
- Aktuelle Produktionswerte und alle damit signierten Tokens rotieren.
- Geheimnisse aus Azure Key Vault beziehen und möglichst Managed Identity statt Storage Account Keys verwenden.
- Kein permanentes Standardpasswort anlegen; initiale Administration über einen einmaligen, kontrollierten Bootstrap-Prozess einrichten.

### 2. Kritisch: GPS-Daten ohne Eigentumsnachweis löschbar

**Betroffene Stellen:** [api/Functions/GPSRecordsFunction.cs](../api/Functions/GPSRecordsFunction.cs#L274-L358), [api/Functions/GPSRecordsFunction.cs](../api/Functions/GPSRecordsFunction.cs#L386-L418), [js/guest-records.js](../js/guest-records.js#L75-L105), [js/owner-records.js](../js/owner-records.js#L64-L86), [js/auth.js](../js/auth.js#L8-L15)

Normale angemeldete Benutzer dürfen laut Produktvorgabe alle GPS-Daten sehen. Dieser Zugriff erfolgt über `GET /api/manage/gps-records` und ist durch einen gültigen Benutzer-Token geschützt; er ist daher nicht Teil dieses Findings.

Die öffentlichen Guest-/Owner-Flows verwenden dagegen `GET /api/my-records`. Dieser Endpunkt verlangt nur einen Hundeschlüssel. Guest- und Owner-Key dienen ausschließlich dazu, das Antwortfeld `isOwner` zu berechnen; sie beschränken nicht die zurückgegebenen Datensätze. Das entspricht der aktuellen UI: `guest-records.html` bietet ausdrücklich „Alle Flyer“ an, `owner-records.html` zeigt standardmäßig „Alle Daten“, und beide Karten laden ebenfalls alle Einträge des Hundes.

Falls auch Gäste und Besitzer alle Daten des ausgewählten Hundes sehen dürfen, ist dieses Leseverhalten beabsichtigt und keine Schwachstelle. Falls der Guest-/Owner-Link eine Zugriffsschranke darstellen soll, besteht hingegen ein Autorisierungs-Bypass: Ein direkter Request mit einem öffentlich ermittelbaren Hundeschlüssel liefert dieselben Daten auch ohne gültigen Guest-/Owner-Key.

`POST /api/my-records/delete` prüft Guest- beziehungsweise Owner-Key nur, wenn der Client freiwillig einen Wert mitsendet. Sind beide leer, genügt ein passender Hundeschlüssel, um jeden bekannten GPS-Datensatz dieses Hundes zu löschen.

Der gemeinsame API-Key ist im ausgelieferten Browsercode enthalten und stellt deshalb für öffentliche Clients keine Sicherheitsgrenze dar.

**Auswirkung:** Bestätigter Integritätsverlust der GPS-Daten einschließlich zugehöriger Fotos. Ein Vertraulichkeitsverlust liegt zusätzlich vor, wenn der Zugriff für Gäste oder Besitzer entgegen der aktuellen UI auf eigene Einträge begrenzt sein soll.

**Empfehlung:**

- Für Lesezugriffe ausdrücklich festlegen, ob Guest-/Owner-Seiten alle Daten eines Hundes sehen dürfen. Nur falls nicht, Guest-Tokens gegen `GuestTokens` prüfen, Owner-Keys gegen `LostDogs` prüfen und Ergebnisse serverseitig nach Eigentum filtern.
- Für Löschzugriffe immer genau eine gültige Identität verlangen; fehlende Guest-/Owner-/Benutzer-Credentials standardmäßig verweigern.
- Beim Löschen Guest-Tokens an den registrierten Hund binden, Owner-Keys gegen den Hund prüfen und jeden Datensatz erneut gegen dieselbe Identität validieren.
- Normale Benutzer über den signierten Token autorisieren; deren vorgesehener globaler Lesezugriff bleibt davon unberührt.

### 3. Hoch: Beliebige beziehungsweise gefälschte Standortzuordnung

**Betroffene Stellen:** [api/Functions/SaveLocationFunction.cs](../api/Functions/SaveLocationFunction.cs#L92-L166), [api/Functions/GuestTokenFunction.cs](../api/Functions/GuestTokenFunction.cs#L62-L81)

`SaveLocation` übernimmt `name`, `lostDog`, `guestToken` und `ownerKey` direkt aus dem Request. Weder Existenz noch gegenseitige Zuordnung werden validiert. Die Gastregistrierung speichert zwar einen `DogKey`, prüft dessen Existenz aber nicht; beim späteren Speichern wird diese Bindung gar nicht verwendet.

**Angriffsszenario:** Ein Besucher liest den Browser-API-Key aus, sendet falsche Koordinaten und gibt dabei einen beliebigen Benutzer, Hund oder erfundenen Owner-Key an. Dadurch können Suchmaßnahmen gezielt fehlgeleitet werden.

**Empfehlung:** Die Identität und alle daraus erlaubten Hunde serverseitig aus dem jeweiligen Token ableiten. Clientseitig übermittelte Identitätsfelder dürfen nicht autoritativ sein. Zusätzlich Koordinatenbereiche, endliche Zahlen, Zeitstempel, Feldlängen und referenzierte Kategorien validieren.

### 4. Hoch: Gespeichertes XSS mit Administrator-Token-Diebstahl

**Betroffene Stellen:** [api/Functions/AuthFunction.cs](../api/Functions/AuthFunction.cs#L166-L177), [js/users.js](../js/users.js#L71-L94), [api/Functions/EquipmentFunction.cs](../api/Functions/EquipmentFunction.cs#L276-L293), [js/equipment.js](../js/equipment.js#L78-L93), [js/auth.js](../js/auth.js#L22-L23)

Jeder angemeldete Benutzer kann seinen Anzeigenamen ungefiltert speichern. Die Benutzerverwaltung HTML-escaped diesen Wert, setzt ihn danach aber innerhalb eines Inline-`onclick` als JavaScript-String ein. HTML-Entities wie `&#39;` werden vom Browser vor der Handler-Ausführung wieder zu Anführungszeichen dekodiert. Ein präparierter Anzeigename kann daher beim Klick auf einen Verwaltungsbutton JavaScript ausführen.

Dasselbe Kontextproblem besteht in der Equipment-Liste. Dort können mindestens PowerUser manipulierbare Standort- und Benutzerfelder setzen. Der Administrator-Token liegt in `localStorage` und kann von eingeschleustem JavaScript ausgelesen werden.

**Empfehlung:**

- Keine dynamisch erzeugten Inline-Eventhandler verwenden.
- Elemente über DOM-APIs erzeugen und Ereignisse mit `addEventListener` binden.
- Nutzdaten über Closures oder interne IDs weitergeben, nicht als JavaScript-Quelltext.
- Ausgabe immer passend zum Zielkontext behandeln; `StripHtml` ist kein Ersatz für kontextbezogene Ausgabe-Encoding.
- Nach der Umstellung eine restriktive Content Security Policy ohne `unsafe-inline` aktivieren.

### 5. Mittel: OData-Injection über Benutzernamen

**Betroffene Stellen:** [api/Functions/UsersFunction.cs](../api/Functions/UsersFunction.cs#L49-L76), [api/Functions/DeploymentFunction.cs](../api/Functions/DeploymentFunction.cs#L240-L243)

Beim Anlegen eines Benutzers wird der Benutzername nicht auf ein sicheres Format begrenzt. `GetDeployments` interpoliert den aus dem signierten Token gelesenen Benutzernamen anschließend ungeescaped in einen OData-Filter. Ein Manager kann deshalb ein Konto mit einem präparierten Apostroph-/OData-Ausdruck erzeugen und diesem Konto Zugriff auf fremde Einsatzdatensätze verschaffen.

**Empfehlung:** Benutzernamen mit einer engen Allowlist und Längenbegrenzung validieren. Filter mit `TableClient.CreateQueryFilter` beziehungsweise typisierten Query-Ausdrücken erzeugen.

### 6. Mittel: Schwaches Sitzungsmanagement

**Betroffene Stellen:** [api/Program.cs](../api/Program.cs#L24-L32), [api/Security/AdminAuth.cs](../api/Security/AdminAuth.cs#L130-L158), [api/Security/AdminAuth.cs](../api/Security/AdminAuth.cs#L447-L485), [js/auth.js](../js/auth.js#L22-L49)

Tokens gelten 48 Stunden, werden nach Ablauf der halben Lebensdauer unbegrenzt gleitend erneuert und liegen dauerhaft in `localStorage`. Passwortänderungen und Passwort-Resets invalidieren bereits ausgestellte Tokens nicht. Rollenänderungen und gelöschte Konten werden bei rollenpflichtigen Endpunkten zwar über die aktuelle Datenbankrolle berücksichtigt, ein kompromittierter Token eines weiterhin existierenden Kontos bleibt aber nutzbar.

**Empfehlung:** Kurze Access-Token-Laufzeit, absolute maximale Sitzungsdauer und serverseitige Session- beziehungsweise Token-Version pro Benutzer einführen. Bei Passwortänderung, Reset und Logout die Version erhöhen. Wo möglich, browserseitige Authentisierung über sichere `HttpOnly`-/`Secure`-/`SameSite`-Cookies oder eine verwaltete Identitätslösung abbilden.

### 7. Mittel: Unsichere Fotoverarbeitung und sehr langlebige SAS-URLs

**Betroffene Stelle:** [api/Functions/SaveLocationFunction.cs](../api/Functions/SaveLocationFunction.cs#L104-L135)

Die Prüfung basiert nur auf dem Dateinamen. Eine unbekannte Erweiterung wird zu `.jpg` umgeschrieben, während der vom Client gelieferte MIME-Typ unverändert als Blob-Header übernommen wird. Der Inhalt wird weder dekodiert noch auf ein echtes Bildformat geprüft. Die erzeugte Read-SAS ist fünf Jahre gültig und umgeht nach ihrer Ausgabe jede API-Berechtigung bis zum Ablauf oder bis zur Blob-Löschung.

**Empfehlung:** Bildsignatur prüfen, Datei mit einer etablierten Bibliothek dekodieren und neu encodieren, MIME-Typ serverseitig festlegen und kurzlebige SAS-URLs nur bei autorisierten Abrufen erzeugen. Für Azure Storage Managed Identity und User Delegation SAS bevorzugen.

### 8. Mittel: Rate-Limits sind nicht verteilt und wachsen dauerhaft

**Betroffene Stelle:** [api/Security/RateLimiter.cs](../api/Security/RateLimiter.cs#L8-L53)

Der Rate-Limiter verwaltet Zähler nur im Arbeitsspeicher einer Functions-Instanz. Bei horizontaler Skalierung besitzt jede Instanz ein eigenes Limit. Die vorhandene `Cleanup`-Methode wird nicht automatisch ausgeführt; Schlüssel verbleiben daher im Dictionary, auch wenn ihre Queue längst leer ist.

**Auswirkung:** Vervielfachte Loginversuche bei Skalierung sowie potenziell dauerhaft wachsender Speicherverbrauch durch viele unterschiedliche Quellschlüssel.

**Empfehlung:** Verteiltes Rate-Limiting über Azure API Management, Front Door oder Redis einsetzen. Client-IP nur aus einer vertrauenswürdigen Proxy-Kette ableiten und Limits zusätzlich nach Konto beziehungsweise Zielidentität führen.

### 9. Mittel: Backups enthalten Schlüsselmaterial und Restore ist unbeschränkt

**Betroffene Stelle:** [api/Functions/BackupRestoreFunction.cs](../api/Functions/BackupRestoreFunction.cs#L14-L65), [api/Functions/BackupRestoreFunction.cs](../api/Functions/BackupRestoreFunction.cs#L112-L150)

Der Export enthält alle Eigenschaften aus `Users`, `GuestTokens`, `LostDogs` und `GPSRecords`, darunter Passwort-Hashes, Guest-/Owner-Tokens und langlebige Foto-SAS-URLs. Die Antwort wird nicht ausdrücklich als nicht cachebar markiert. Restore akzeptiert beliebige Eigenschaften, Datentypen und Mengen innerhalb der bekannten Tabellen ohne Schemaprüfung oder Integritätssignatur.

**Empfehlung:** Backup als hochsensibles Geheimnis behandeln, verschlüsseln und signieren. `Cache-Control: no-store`, Audit-Logging, Größenlimits und ein tabellenspezifisches Schema ergänzen. Vor Restore Signatur, Version und Datentypen prüfen.

### 10. Mittel: Fehlende Browser-Härtung und ungeschützte CDN-Abhängigkeiten

**Betroffene Stellen:** [staticwebapp.config.json](../staticwebapp.config.json#L22-L27), [address-entry.html](../address-entry.html#L10-L50), [map.html](../map.html#L13-L60) sowie weitere `*-map.html`-Seiten

Es ist keine Content Security Policy gesetzt. Leaflet wird in `address-entry.html` ohne Subresource Integrity geladen. Die MarkerCluster-CSS- und JavaScript-Dateien besitzen auf allen Kartenseiten keine SRI-Prüfung. Ein kompromittiertes CDN könnte dadurch JavaScript im Anwendungskontext ausliefern.

**Empfehlung:** Drittbibliotheken bevorzugt selbst hosten oder alle statischen CDN-Dateien mit korrektem `integrity` und `crossorigin` versehen. Nach Entfernung dynamischer Inline-Handler eine restriktive CSP mit mindestens `default-src 'self'`, `object-src 'none'`, `base-uri 'self'` und `frame-ancestors 'none'` einführen.

### 11. Niedrig: Öffentliche Aufzählung von Login-Namen

**Betroffene Stellen:** [api/Functions/UsersFunction.cs](../api/Functions/UsersFunction.cs#L226-L250), [api/Functions/AuthFunction.cs](../api/Functions/AuthFunction.cs#L25-L53)

`GET /api/user-names` liefert Login-Namen ohne Benutzer-Token. Da der Browser-API-Key öffentlich ist und der Login-Endpunkt ohnehin keinen API-Key prüft, können Angreifer gültige Zielkonten für Passwortangriffe ermitteln.

**Empfehlung:** Den Endpunkt mindestens an einen gültigen Benutzer-Token binden oder ausschließlich nicht sicherheitsrelevante Anzeigenamen mit opaken IDs ausgeben. Login-Fehler und Antwortzeiten weiterhin vereinheitlichen.

### 12. Niedrig: Datenschutzdokumentation widerspricht der Implementierung

**Betroffene Stellen:** [docs/datenschutz.html](datenschutz.html#L74-L80), [docs/datenschutz.html](datenschutz.html#L118-L119), [js/auth.js](../js/auth.js#L22-L49), [js/offline-store.js](../js/offline-store.js#L1-L91)

Die Dokumentation nennt für Auth-Tokens `sessionStorage` und maximal 24 Stunden. Tatsächlich werden sie in `localStorage` abgelegt, gelten 48 Stunden und können unbegrenzt erneuert werden. Präzise GPS-Daten können außerdem bis zur Übertragung unverschlüsselt in IndexedDB verbleiben. Die Aussage, lokale Daten würden außer GPS-Einträgen nicht an den Server übertragen, ist für Auth-, Guest- und Owner-Tokens ebenfalls missverständlich.

**Empfehlung:** Dokumentation und tatsächliche Aufbewahrung synchronisieren, eine klare Löschstrategie für Offline-Daten festlegen und für gemeinsam genutzte beziehungsweise besonders gefährdete Geräte eine Verschlüsselung oder kürzere lokale Aufbewahrung prüfen.

## Priorisierte Umsetzung

### P0 - vor Produktion

1. Fallback-Geheimnisse entfernen und alle bestehenden Geheimnisse rotieren.
2. Löschen von GPS-Daten mit verpflichtender, serverseitig validierter Eigentumsprüfung versehen; den gewünschten Leseumfang für Guest-/Owner-Seiten explizit festlegen.
3. `SaveLocation` an eine serverseitig aufgelöste Identität und einen erlaubten Hund binden.
4. Inline-Eventhandler in Benutzer- und Equipment-Verwaltung entfernen und kompromittierbare Tokens danach rotieren.

### P1 - kurzfristig

1. Sitzungswiderruf und absolute Ablaufzeit einführen.
2. Foto-Upload validieren und SAS-Laufzeit drastisch reduzieren.
3. Benutzernamen validieren und alle OData-Filter sicher erzeugen.
4. Rate-Limiting verteilen.

### P2 - Härtung

1. Backups verschlüsseln, signieren und Restore strikt validieren.
2. CSP und vollständige SRI-Abdeckung einführen.
3. Benutzeraufzählung reduzieren und Datenschutzangaben korrigieren.

## Positiv geprüfte Kontrollen

- Passwort-Hashes verwenden PBKDF2 mit hohem Iterationswert und individuellen Salts.
- HMAC- und API-Key-Vergleiche verwenden konstante Vergleichsfunktionen.
- Die meisten `/manage/*`-Routen prüfen Rollen serverseitig; insbesondere Rollenänderungen sind Administratoren vorbehalten.
- Abrechnungsdaten werden zusätzlich gegen das serverseitige Accountant-Flag geprüft.
- Eigene Einsatzdatensätze sind grundsätzlich über den Token-Benutzernamen partitioniert.
- Die Karten- und Tabellenansichten escapen die meisten Textausgaben korrekt.
- Der Service Worker schließt `/api` und Nicht-GET-Requests vom Cache aus.
- Alte rohe Kategorie-SVGs werden im Client nicht gerendert; unbekannte Werte fallen auf eine vordefinierte Allowlist zurück.

## Nicht bestätigte beziehungsweise verworfene Hinweise

- **CSRF:** Die Authentisierung erfolgt über explizite Header und nicht über automatisch mitgesendete Cookies. Ein klassischer CSRF-Angriff wurde daher nicht bestätigt. XSS bleibt wegen `localStorage` erheblich.
- **Blob Path Traversal:** Azure Blob Storage besitzt einen flachen Namensraum; `..` ist im Blob-Namen kein Dateisystemaufstieg. Die URL-basierte Namensableitung ist fragil, aber kein bestätigter Container-übergreifender Path-Traversal.
- **Anonyme SWA-Route:** `allowedRoles: ["anonymous"]` ist allein kein Auth-Bypass, weil das Projekt eigene Header-/Rollenprüfungen verwendet. Es erhöht jedoch die Bedeutung lückenloser Prüfungen in jeder Function.
- **Rolleneskalation durch Manager:** `UpdateUser` verlangt Administrator-Level; Manager können beim Anlegen nur die Rolle `User` vergeben.
- **Rohes Kategorie-SVG:** Der Client löst nur bekannte Icon-Keys auf und rendert unbekannte Altwerte nicht direkt.

## Verifikation und Grenzen

- Die VS-Code-Diagnostik meldete keine Fehler im API-Projekt.
- Der konfigurierte Build-Task war in der virtuellen GitHub-Dateisystem-Sitzung nicht registriert und konnte nicht ausgeführt werden.
- Die offiziellen NuGet-Seiten zeigten für die fünf direkten Paketversionen keine Sicherheits- oder Deprecation-Warnung. Ein transitiver `dotnet list package --vulnerable --include-transitive`-Scan konnte ohne ausführbaren Workspace nicht durchgeführt werden.
- Es erfolgte kein dynamischer Test einer realen Azure-Bereitstellung, insbesondere keine Prüfung von Azure-RBAC, Storage-Netzwerkregeln, TLS-/HSTS-Headern der Plattform, App-Settings oder produktiven Secrets.