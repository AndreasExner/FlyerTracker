using Azure.Data.Tables;
var client = TableClient.FromConnectionString("UseDevelopmentStorage=true", "GPSRecords");
await foreach (var e in client.QueryAsync<TableEntity>(maxPerPage: 5))
{
    Console.WriteLine($"PartitionKey: {e.PartitionKey}");
    Console.WriteLine($"RowKey:       {e.RowKey}");
    Console.WriteLine($"Timestamp:    {e.Timestamp}");
    foreach (var kv in e.Keys.Where(k => k != "odata.etag" && k != "PartitionKey" && k != "RowKey" && k != "Timestamp"))
        Console.WriteLine($"{kv,-14}: {e[kv]} ({e[kv]?.GetType().Name})");
    Console.WriteLine(new string('-', 50));
}
