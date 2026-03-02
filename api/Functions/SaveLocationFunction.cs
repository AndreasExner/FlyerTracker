using System.Text.Json;
using Azure.Data.Tables;
using FlyerTracker.Api.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace FlyerTracker.Api.Functions;

public class SaveLocationFunction
{
    private readonly TableServiceClient _tableService;
    private readonly ILogger<SaveLocationFunction> _logger;
    private readonly ApiKeyValidator _apiKey;
    private readonly RateLimiter _rateLimiter;

    public SaveLocationFunction(TableServiceClient tableService, ILogger<SaveLocationFunction> logger,
        ApiKeyValidator apiKey, RateLimiter rateLimiter)
    {
        _tableService = tableService;
        _logger = logger;
        _apiKey = apiKey;
        _rateLimiter = rateLimiter;
    }

    [Function("SaveLocation")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "save-location")] HttpRequest req)
    {
        try
        {
            if (!_apiKey.IsValid(req))
                return new ObjectResult(new { error = "Ungültiger API-Key" }) { StatusCode = 403 };

            var ip = req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
            if (!_rateLimiter.IsAllowed(ip))
                return new ObjectResult(new { error = "Zu viele Anfragen. Bitte warten." }) { StatusCode = 429 };
            var body = await JsonSerializer.DeserializeAsync<LocationRequest>(req.Body,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (body is null || string.IsNullOrWhiteSpace(body.Name) ||
                string.IsNullOrWhiteSpace(body.LostDog) ||
                body.Latitude is null || body.Longitude is null)
            {
                return new BadRequestObjectResult(new { error = "Fehlende Pflichtfelder" });
            }

            var tableClient = _tableService.GetTableClient("GPSRecords");
            await tableClient.CreateIfNotExistsAsync();

            // RowKey = reverse timestamp (newest records first in queries)
            var rowKey = (9_999_999_999_999 - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
                .ToString("D15");

            var entity = new TableEntity(body.Name, rowKey)
            {
                { "LostDog", body.LostDog },
                { "Latitude", body.Latitude.Value },
                { "Longitude", body.Longitude.Value },
                { "Accuracy", body.Accuracy ?? 0 },
                { "RecordedAt", body.Timestamp ?? DateTime.UtcNow.ToString("o") }
            };

            await tableClient.AddEntityAsync(entity);

            _logger.LogInformation("Location saved: {Name} at {Lat},{Lon} ({LostDog})",
                body.Name, body.Latitude, body.Longitude, body.LostDog);

            return new CreatedResult("", new { message = "Standort gespeichert" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving location");
            return new StatusCodeResult(500);
        }
    }

    private record LocationRequest
    {
        public string? Name { get; init; }
        public string? LostDog { get; init; }
        public double? Latitude { get; init; }
        public double? Longitude { get; init; }
        public double? Accuracy { get; init; }
        public string? Timestamp { get; init; }
    }
}
