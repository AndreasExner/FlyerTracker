using System.Text.Json;
using Azure.Data.Tables;
using FlyerTracker.Api.Security;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace FlyerTracker.Api.Functions;

public class CategoriesFunction
{
    private readonly TableServiceClient _tableService;
    private readonly ILogger<CategoriesFunction> _logger;
    private readonly ApiKeyValidator _apiKey;
    private readonly AdminAuth _adminAuth;

    public CategoriesFunction(TableServiceClient tableService, ILogger<CategoriesFunction> logger,
        ApiKeyValidator apiKey, AdminAuth adminAuth)
    {
        _tableService = tableService;
        _logger = logger;
        _apiKey = apiKey;
        _adminAuth = adminAuth;
    }

    /// <summary>Public endpoint – returns sorted list of category names (for the submit form).</summary>
    [Function("GetCategories")]
    public async Task<IActionResult> GetCategories(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "categories")] HttpRequest req)
    {
        try
        {
            if (!_apiKey.IsValid(req))
                return new ObjectResult(new { error = "Ungültiger API-Key" }) { StatusCode = 403 };

            var tableClient = _tableService.GetTableClient("Categories");
            await tableClient.CreateIfNotExistsAsync();

            var categories = new List<string>();
            await foreach (var entity in tableClient.QueryAsync<TableEntity>())
            {
                var name = entity.GetString("Name") ?? entity.RowKey;
                if (!string.IsNullOrWhiteSpace(name))
                    categories.Add(name);
            }

            categories.Sort(StringComparer.Create(new System.Globalization.CultureInfo("de-DE"), false));
            return new OkObjectResult(categories);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading categories");
            return new StatusCodeResult(500);
        }
    }

    /// <summary>Admin endpoint – returns list with keys for management.</summary>
    [Function("GetCategoriesAdmin")]
    public async Task<IActionResult> GetCategoriesAdmin(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/categories")] HttpRequest req)
    {
        try
        {
            if (!_apiKey.IsValid(req))
                return new ObjectResult(new { error = "Ungültiger API-Key" }) { StatusCode = 403 };
            if (!_adminAuth.ValidateToken(req))
                return AdminAuth.Unauthorized();

            var tableClient = _tableService.GetTableClient("Categories");
            await tableClient.CreateIfNotExistsAsync();

            var items = new List<object>();
            await foreach (var entity in tableClient.QueryAsync<TableEntity>())
            {
                items.Add(new
                {
                    partitionKey = entity.PartitionKey,
                    rowKey = entity.RowKey,
                    name = entity.GetString("Name") ?? entity.RowKey
                });
            }

            var comparer = StringComparer.Create(new System.Globalization.CultureInfo("de-DE"), false);
            items.Sort((a, b) => comparer.Compare(
                ((dynamic)a).name, ((dynamic)b).name));

            return new OkObjectResult(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading categories (admin)");
            return new StatusCodeResult(500);
        }
    }

    [Function("CreateCategory")]
    public async Task<IActionResult> CreateCategory(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/categories")] HttpRequest req)
    {
        try
        {
            if (!_apiKey.IsValid(req))
                return new ObjectResult(new { error = "Ungültiger API-Key" }) { StatusCode = 403 };
            if (!_adminAuth.ValidateToken(req))
                return AdminAuth.Unauthorized();

            var body = await JsonSerializer.DeserializeAsync<JsonElement>(req.Body);
            var name = body.GetProperty("name").GetString();

            if (string.IsNullOrWhiteSpace(name))
                return new BadRequestObjectResult(new { error = "Name darf nicht leer sein" });

            var tableClient = _tableService.GetTableClient("Categories");
            await tableClient.CreateIfNotExistsAsync();

            var rowKey = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString("D15");
            var entity = new TableEntity("categories", rowKey)
            {
                { "Name", name.Trim() }
            };

            await tableClient.AddEntityAsync(entity);
            _logger.LogInformation("Category created: {Name}", name);

            return new CreatedResult("", new { partitionKey = "categories", rowKey, name = name.Trim() });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating category");
            return new StatusCodeResult(500);
        }
    }

    [Function("DeleteCategory")]
    public async Task<IActionResult> DeleteCategory(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "manage/categories/{rowKey}")] HttpRequest req,
        string rowKey)
    {
        try
        {
            if (!_apiKey.IsValid(req))
                return new ObjectResult(new { error = "Ungültiger API-Key" }) { StatusCode = 403 };
            if (!_adminAuth.ValidateToken(req))
                return AdminAuth.Unauthorized();

            var tableClient = _tableService.GetTableClient("Categories");
            await tableClient.DeleteEntityAsync("categories", rowKey);
            _logger.LogInformation("Category deleted: RowKey={RowKey}", rowKey);

            return new OkObjectResult(new { message = "Gelöscht" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting category");
            return new StatusCodeResult(500);
        }
    }

    /// <summary>Seeds initial categories if the table is empty.</summary>
    [Function("SeedCategories")]
    public async Task<IActionResult> SeedCategories(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/categories/seed")] HttpRequest req)
    {
        try
        {
            if (!_apiKey.IsValid(req))
                return new ObjectResult(new { error = "Ungültiger API-Key" }) { StatusCode = 403 };
            if (!_adminAuth.ValidateToken(req))
                return AdminAuth.Unauthorized();

            var tableClient = _tableService.GetTableClient("Categories");
            await tableClient.CreateIfNotExistsAsync();

            // Check if already populated
            var existing = new List<TableEntity>();
            await foreach (var e in tableClient.QueryAsync<TableEntity>(maxPerPage: 1))
            {
                existing.Add(e);
                break;
            }

            if (existing.Count > 0)
                return new OkObjectResult(new { message = "Kategorien existieren bereits", seeded = 0 });

            var defaults = new[] { "Flyer/Handzettel", "Sichtung", "Entlaufort", "Standort Falle" };
            int count = 0;
            foreach (var name in defaults)
            {
                var rowKey = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString("D15");
                await Task.Delay(5); // ensure unique rowKeys
                var entity = new TableEntity("categories", rowKey)
                {
                    { "Name", name }
                };
                await tableClient.AddEntityAsync(entity);
                count++;
            }

            _logger.LogInformation("Seeded {Count} default categories", count);
            return new OkObjectResult(new { message = $"{count} Kategorien angelegt", seeded = count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error seeding categories");
            return new StatusCodeResult(500);
        }
    }
}
