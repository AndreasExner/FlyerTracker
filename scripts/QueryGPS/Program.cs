using Azure.Data.Tables;

var serviceClient = new TableServiceClient("UseDevelopmentStorage=true");
var client = serviceClient.GetTableClient("GPSRecords");

Console.WriteLine("=== GPSRecords Table Schema ===\n");

int count = 0;
await foreach (var e in client.QueryAsync<TableEntity>(maxPerPage: 5))
{
    count++;
    Console.WriteLine($"  PartitionKey : {e.PartitionKey}");
    Console.WriteLine($"  RowKey       : {e.RowKey}");
    Console.WriteLine($"  Timestamp    : {e.Timestamp}");

    foreach (var key in e.Keys)
    {
        if (key is "odata.etag" or "PartitionKey" or "RowKey" or "Timestamp")
            continue;
        var val = e[key];
        Console.WriteLine($"  {key,-14}: {val}  ({val?.GetType().Name})");
    }
    Console.WriteLine(new string('-', 55));

    if (count >= 3) break; // show max 3 records
}

if (count == 0)
    Console.WriteLine("  (keine Einträge vorhanden)");
