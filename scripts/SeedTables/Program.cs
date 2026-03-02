using Azure.Data.Tables;

var connectionString = args.Length > 0 ? args[0] : "UseDevelopmentStorage=true";

Console.WriteLine("Seeding tables...\n");

var serviceClient = new TableServiceClient(connectionString);

// ── Sample data ──────────────────────────────────────────────────────
var names = new[] { "Gina", "Thomas", "Anna", "Markus", "Sandra" };
var lostDogs = new[] { "Blue", "Bella", "Rex", "Luna", "Max" };

// ── Create tables ────────────────────────────────────────────────────
foreach (var table in new[] { "Names", "LostDogs", "GPSRecords" })
{
    try
    {
        await serviceClient.CreateTableIfNotExistsAsync(table);
        Console.WriteLine($"  ✓ Table \"{table}\" ready");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"  ✗ Table \"{table}\" failed: {ex.Message}");
    }
}

// ── Seed Names ───────────────────────────────────────────────────────
var namesClient = serviceClient.GetTableClient("Names");
for (var i = 0; i < names.Length; i++)
{
    await namesClient.UpsertEntityAsync(new TableEntity("names", (i + 1).ToString("D3"))
    {
        { "Name", names[i] }
    });
}
Console.WriteLine($"  ✓ {names.Length} names seeded");

// ── Seed LostDogs ────────────────────────────────────────────────────
var locClient = serviceClient.GetTableClient("LostDogs");
for (var i = 0; i < lostDogs.Length; i++)
{
    await locClient.UpsertEntityAsync(new TableEntity("locations", (i + 1).ToString("D3"))
    {
        { "Location", lostDogs[i] }
    });
}
Console.WriteLine($"  ✓ {lostDogs.Length} lost dogs seeded");

Console.WriteLine("\nDone!");
