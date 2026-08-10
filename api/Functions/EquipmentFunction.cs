using System.Text.Json;
using System.Text.RegularExpressions;
using Azure.Data.Tables;
using LostDogTracer.Api.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace LostDogTracer.Api.Functions;

public class EquipmentFunction
{
    private const string TableName = "Equipment";
    private const string PK = "equipment";

    private readonly TableServiceClient _tableService;
    private readonly ILogger<EquipmentFunction> _logger;
    private readonly ApiKeyValidator _apiKey;
    private readonly AdminAuth _adminAuth;
    private readonly RateLimitProvider _rateLimit;

    public EquipmentFunction(TableServiceClient tableService, ILogger<EquipmentFunction> logger,
        ApiKeyValidator apiKey, AdminAuth adminAuth, RateLimitProvider rateLimit)
    {
        _tableService = tableService;
        _logger = logger;
        _apiKey = apiKey;
        _adminAuth = adminAuth;
        _rateLimit = rateLimit;
    }

    [Function("GetEquipment")]
    public async Task<IActionResult> GetEquipment(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/equipment")] HttpRequest req)
    {
        try
        {
            if (!_apiKey.IsValid(req))
                return new ObjectResult(new { error = "Ungültiger API-Key" }) { StatusCode = 403 };
            var ip = req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (!_rateLimit.Read.IsAllowed(ip))
                return new ObjectResult(new { error = "Zu viele Anfragen. Bitte warten." }) { StatusCode = 429 };
            var callerLevel = await _adminAuth.ValidateTokenWithRole(req, 2);
            if (callerLevel == 0)
                return AdminAuth.Forbidden();

            var table = _tableService.GetTableClient(TableName);
            await table.CreateIfNotExistsAsync();

            var items = new List<object>();
            await foreach (var entity in table.QueryAsync<TableEntity>(
                filter: $"PartitionKey eq '{PK}'"))
            {
                items.Add(new
                {
                    rowKey = entity.RowKey,
                    displayName = entity.GetString("DisplayName") ?? "",
                    equipmentType = entity.GetString("EquipmentType") ?? "",
                    comment = entity.GetString("Comment") ?? "",
                    userName = entity.GetString("UserName") ?? "",
                    location = entity.GetString("Location") ?? "",
                    latitude = entity.GetDouble("Latitude"),
                    longitude = entity.GetDouble("Longitude"),
                    phoneNumber = entity.GetString("PhoneNumber") ?? "",
                    simExpiryDate = entity.GetString("SimExpiryDate") ?? "",
                    // UID only exposed to Manager+ (level >= 3)
                    uid = callerLevel >= 3 ? (entity.GetString("Uid") ?? "") : "",
                    // SMS control commands only exposed to Manager+ (level >= 3)
                    smsArmCommand = callerLevel >= 3 ? (entity.GetString("SmsArmCommand") ?? "") : "",
                    smsDisarmCommand = callerLevel >= 3 ? (entity.GetString("SmsDisarmCommand") ?? "") : ""
                });
            }

            var comparer = StringComparer.Create(new System.Globalization.CultureInfo("de-DE"), false);
            items.Sort((a, b) => comparer.Compare(
                ((dynamic)a).displayName as string ?? "",
                ((dynamic)b).displayName as string ?? ""));

            return new OkObjectResult(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading equipment");
            return new StatusCodeResult(500);
        }
    }

    /// <summary>Lightweight members list for equipment location assignment (minRole 2).</summary>
    [Function("GetEquipmentMembers")]
    public async Task<IActionResult> GetEquipmentMembers(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/equipment/members")] HttpRequest req)
    {
        try
        {
            if (!_apiKey.IsValid(req))
                return new ObjectResult(new { error = "Ungültiger API-Key" }) { StatusCode = 403 };
            var ip = req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (!_rateLimit.Read.IsAllowed(ip))
                return new ObjectResult(new { error = "Zu viele Anfragen. Bitte warten." }) { StatusCode = 429 };
            if (await _adminAuth.ValidateTokenWithRole(req, 2) == 0)
                return AdminAuth.Forbidden();

            var table = _tableService.GetTableClient("Users");
            await table.CreateIfNotExistsAsync();

            var members = new List<object>();
            await foreach (var entity in table.QueryAsync<TableEntity>(
                filter: "PartitionKey eq 'users'",
                select: new[] { "RowKey", "DisplayName", "Location", "Latitude", "Longitude" }))
            {
                var loc = entity.GetString("Location");
                var lat = entity.GetDouble("Latitude");
                var lng = entity.GetDouble("Longitude");
                if (!string.IsNullOrWhiteSpace(loc) && lat.HasValue && lng.HasValue)
                {
                    members.Add(new
                    {
                        displayName = entity.GetString("DisplayName") ?? entity.RowKey,
                        location = loc,
                        latitude = lat.Value,
                        longitude = lng.Value
                    });
                }
            }

            var comparer = StringComparer.Create(new System.Globalization.CultureInfo("de-DE"), false);
            members.Sort((a, b) => comparer.Compare(
                ((dynamic)a).displayName as string ?? "",
                ((dynamic)b).displayName as string ?? ""));

            return new OkObjectResult(members);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading equipment members");
            return new StatusCodeResult(500);
        }
    }

    [Function("CreateEquipment")]
    public async Task<IActionResult> CreateEquipment(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/equipment")] HttpRequest req)
    {
        try
        {
            if (!_apiKey.IsValid(req))
                return new ObjectResult(new { error = "Ungültiger API-Key" }) { StatusCode = 403 };
            var ip = req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (!_rateLimit.Write.IsAllowed(ip))
                return new ObjectResult(new { error = "Zu viele Anfragen. Bitte warten." }) { StatusCode = 429 };
            if (await _adminAuth.ValidateTokenWithRole(req, 3) == 0)
                return AdminAuth.Forbidden();

            var body = await JsonSerializer.DeserializeAsync<EquipmentRequest>(req.Body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (body is null || string.IsNullOrWhiteSpace(body.DisplayName))
                return new BadRequestObjectResult(new { error = "Bezeichnung erforderlich" });

            if (!string.IsNullOrWhiteSpace(body.EquipmentType) && !IsValidType(body.EquipmentType.Trim()))
                return new BadRequestObjectResult(new { error = "Ungültiger Equipment-Typ" });

            if (!string.IsNullOrWhiteSpace(body.PhoneNumber) && !IsValidE164(body.PhoneNumber.Trim()))
                return new BadRequestObjectResult(new { error = "Telefonnummer muss im E.164-Format sein (z. B. +491234567890)" });

            if (!string.IsNullOrWhiteSpace(body.SimExpiryDate) && !IsValidIsoDate(body.SimExpiryDate.Trim()))
                return new BadRequestObjectResult(new { error = "Datum muss im Format JJJJ-MM-TT sein" });

            if (!string.IsNullOrWhiteSpace(body.Uid) && !IsValidUid(body.Uid.Trim().ToUpperInvariant()))
                return new BadRequestObjectResult(new { error = "UID darf nur Großbuchstaben und Ziffern enthalten (max. 20 Zeichen)" });

            if (!string.IsNullOrWhiteSpace(body.SmsArmCommand) && !IsValidSmsCommand(body.SmsArmCommand.Trim()))
                return new BadRequestObjectResult(new { error = SmsCommandError });

            if (!string.IsNullOrWhiteSpace(body.SmsDisarmCommand) && !IsValidSmsCommand(body.SmsDisarmCommand.Trim()))
                return new BadRequestObjectResult(new { error = SmsCommandError });

            var table = _tableService.GetTableClient(TableName);
            await table.CreateIfNotExistsAsync();

            var rowKey = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString("D15");
            var entity = new TableEntity(PK, rowKey)
            {
                { "DisplayName", InputSanitizer.StripHtml(body.DisplayName.Trim()) }
            };

            if (!string.IsNullOrWhiteSpace(body.EquipmentType))
                entity["EquipmentType"] = body.EquipmentType.Trim();
            if (!string.IsNullOrWhiteSpace(body.Comment))
                entity["Comment"] = InputSanitizer.StripHtml(body.Comment.Trim());
            if (!string.IsNullOrWhiteSpace(body.UserName))
                entity["UserName"] = InputSanitizer.StripHtml(body.UserName.Trim());
            if (!string.IsNullOrWhiteSpace(body.Location))
                entity["Location"] = InputSanitizer.StripHtml(body.Location.Trim());
            if (body.Latitude.HasValue)
                entity["Latitude"] = body.Latitude.Value;
            if (body.Longitude.HasValue)
                entity["Longitude"] = body.Longitude.Value;
            if (!string.IsNullOrWhiteSpace(body.PhoneNumber))
                entity["PhoneNumber"] = body.PhoneNumber.Trim();
            if (!string.IsNullOrWhiteSpace(body.SimExpiryDate))
                entity["SimExpiryDate"] = body.SimExpiryDate.Trim();
            if (!string.IsNullOrWhiteSpace(body.Uid))
                entity["Uid"] = body.Uid.Trim().ToUpperInvariant();
            if (!string.IsNullOrWhiteSpace(body.SmsArmCommand))
                entity["SmsArmCommand"] = body.SmsArmCommand.Trim();
            if (!string.IsNullOrWhiteSpace(body.SmsDisarmCommand))
                entity["SmsDisarmCommand"] = body.SmsDisarmCommand.Trim();

            await table.AddEntityAsync(entity);
            _logger.LogInformation("Equipment created: {Name}", body.DisplayName);

            return new CreatedResult("", new { rowKey, displayName = InputSanitizer.StripHtml(body.DisplayName.Trim()) });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating equipment");
            return new StatusCodeResult(500);
        }
    }

    [Function("UpdateEquipment")]
    public async Task<IActionResult> UpdateEquipment(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "manage/equipment/{rowKey}")] HttpRequest req,
        string rowKey)
    {
        try
        {
            if (!_apiKey.IsValid(req))
                return new ObjectResult(new { error = "Ungültiger API-Key" }) { StatusCode = 403 };
            var ip = req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (!_rateLimit.Write.IsAllowed(ip))
                return new ObjectResult(new { error = "Zu viele Anfragen. Bitte warten." }) { StatusCode = 429 };
            var callerLevel = await _adminAuth.ValidateTokenWithRole(req, 2);
            if (callerLevel == 0)
                return AdminAuth.Forbidden();

            var body = await JsonSerializer.DeserializeAsync<EquipmentRequest>(req.Body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (body is null)
                return new BadRequestObjectResult(new { error = "Daten erforderlich" });

            if (!string.IsNullOrWhiteSpace(body.EquipmentType) && !IsValidType(body.EquipmentType.Trim()))
                return new BadRequestObjectResult(new { error = "Ungültiger Equipment-Typ" });

            if (!string.IsNullOrWhiteSpace(body.PhoneNumber) && !IsValidE164(body.PhoneNumber.Trim()))
                return new BadRequestObjectResult(new { error = "Telefonnummer muss im E.164-Format sein (z. B. +491234567890)" });

            if (!string.IsNullOrWhiteSpace(body.SimExpiryDate) && !IsValidIsoDate(body.SimExpiryDate.Trim()))
                return new BadRequestObjectResult(new { error = "Datum muss im Format JJJJ-MM-TT sein" });

            if (!string.IsNullOrWhiteSpace(body.Uid) && !IsValidUid(body.Uid.Trim().ToUpperInvariant()))
                return new BadRequestObjectResult(new { error = "UID darf nur Großbuchstaben und Ziffern enthalten (max. 20 Zeichen)" });

            if (!string.IsNullOrWhiteSpace(body.SmsArmCommand) && !IsValidSmsCommand(body.SmsArmCommand.Trim()))
                return new BadRequestObjectResult(new { error = SmsCommandError });

            if (!string.IsNullOrWhiteSpace(body.SmsDisarmCommand) && !IsValidSmsCommand(body.SmsDisarmCommand.Trim()))
                return new BadRequestObjectResult(new { error = SmsCommandError });

            var table = _tableService.GetTableClient(TableName);
            var response = await table.GetEntityAsync<TableEntity>(PK, rowKey);
            var entity = response.Value;

            // SMS control commands are Administrator-only (level >= 4)
            if (callerLevel >= 4)
            {
                if (body.SmsArmCommand is not null)
                    entity["SmsArmCommand"] = body.SmsArmCommand.Trim();
                if (body.SmsDisarmCommand is not null)
                    entity["SmsDisarmCommand"] = body.SmsDisarmCommand.Trim();
            }

            // Manager+ can edit all fields; PowerUser can only edit location
            if (callerLevel >= 3)
            {
                if (!string.IsNullOrWhiteSpace(body.DisplayName))
                    entity["DisplayName"] = InputSanitizer.StripHtml(body.DisplayName.Trim());
                if (body.Comment is not null)
                    entity["Comment"] = InputSanitizer.StripHtml(body.Comment.Trim());
                if (body.EquipmentType is not null)
                    entity["EquipmentType"] = body.EquipmentType.Trim();
                // UID is Manager+ only
                if (body.Uid is not null)
                    entity["Uid"] = body.Uid.Trim().ToUpperInvariant();
            }

            if (body.UserName is not null)
                entity["UserName"] = InputSanitizer.StripHtml(body.UserName.Trim());
            if (body.Location is not null)
                entity["Location"] = InputSanitizer.StripHtml(body.Location.Trim());
            if (body.Latitude.HasValue)
                entity["Latitude"] = body.Latitude.Value;
            if (body.Longitude.HasValue)
                entity["Longitude"] = body.Longitude.Value;
            if (body.PhoneNumber is not null)
                entity["PhoneNumber"] = body.PhoneNumber.Trim();
            if (body.SimExpiryDate is not null)
                entity["SimExpiryDate"] = body.SimExpiryDate.Trim();

            await table.UpdateEntityAsync(entity, entity.ETag, TableUpdateMode.Replace);
            _logger.LogInformation("Equipment updated: {RowKey}", rowKey);

            return new OkObjectResult(new { message = "Aktualisiert" });
        }
        catch (Azure.RequestFailedException ex) when (ex.Status == 404)
        {
            return new NotFoundObjectResult(new { error = "Equipment nicht gefunden" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating equipment");
            return new StatusCodeResult(500);
        }
    }

    [Function("DeleteEquipment")]
    public async Task<IActionResult> DeleteEquipment(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "manage/equipment/{rowKey}")] HttpRequest req,
        string rowKey)
    {
        try
        {
            if (!_apiKey.IsValid(req))
                return new ObjectResult(new { error = "Ungültiger API-Key" }) { StatusCode = 403 };
            var ip = req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (!_rateLimit.Write.IsAllowed(ip))
                return new ObjectResult(new { error = "Zu viele Anfragen. Bitte warten." }) { StatusCode = 429 };
            if (await _adminAuth.ValidateTokenWithRole(req, 3) == 0)
                return AdminAuth.Forbidden();

            var table = _tableService.GetTableClient(TableName);
            await table.DeleteEntityAsync(PK, rowKey);
            _logger.LogInformation("Equipment deleted: {RowKey}", rowKey);

            return new OkObjectResult(new { message = "Gelöscht" });
        }
        catch (Azure.RequestFailedException ex) when (ex.Status == 404)
        {
            return new NotFoundObjectResult(new { error = "Equipment nicht gefunden" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting equipment");
            return new StatusCodeResult(500);
        }
    }

    private static readonly Regex E164Regex = new(@"^\+[1-9]\d{1,14}$", RegexOptions.Compiled);

    private static bool IsValidE164(string value) => E164Regex.IsMatch(value);

    private static readonly HashSet<string> AllowedTypes = new(StringComparer.Ordinal)
    {
        "falle", "kamera_abo", "kamera_sim", "sonstiges"
    };

    private static bool IsValidType(string value) => AllowedTypes.Contains(value);

    private static readonly Regex UidRegex = new(@"^[A-Z0-9]{1,20}$", RegexOptions.Compiled);

    private static bool IsValidUid(string value) => UidRegex.IsMatch(value);

    private static readonly Regex SmsCommandRegex = new(@"^[A-Za-z0-9#*+.,:/_\- ]{1,50}$", RegexOptions.Compiled);

    private const string SmsCommandError = "SMS-Befehl darf nur Buchstaben, Ziffern und #*+.,:/_- enthalten (max. 50 Zeichen)";

    private static bool IsValidSmsCommand(string value) => SmsCommandRegex.IsMatch(value);

    private static bool IsValidIsoDate(string value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.None, out _);

    private record EquipmentRequest
    {
        public string? DisplayName { get; init; }
        public string? EquipmentType { get; init; }
        public string? Comment { get; init; }
        public string? UserName { get; init; }
        public string? Location { get; init; }
        public double? Latitude { get; init; }
        public double? Longitude { get; init; }
        public string? PhoneNumber { get; init; }
        public string? SimExpiryDate { get; init; }
        public string? Uid { get; init; }
        public string? SmsArmCommand { get; init; }
        public string? SmsDisarmCommand { get; init; }
    }
}
