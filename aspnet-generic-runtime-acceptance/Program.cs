using System.Text;

var builder = WebApplication.CreateBuilder(args);
var port = ReadPort();
builder.WebHost.UseUrls($"http://127.0.0.1:{port}");

var app = builder.Build();
var dataDirectory = Environment.GetEnvironmentVariable("AUTOMATON_APP_DATA_DIR")
    ?? throw new InvalidOperationException("AUTOMATON_APP_DATA_DIR was not provided.");
Directory.CreateDirectory(dataDirectory);
var markerPath = Path.Combine(dataDirectory, "rollout-marker.txt");
if (!File.Exists(markerPath))
    await File.WriteAllTextAsync(markerPath, $"created:{DateTimeOffset.UtcNow:O}", Encoding.UTF8);

app.MapGet("/health", () => Results.Text("ready", "text/plain"));
app.MapGet("/", () => Results.Text(
    $"aspnet-generic-runtime:{Environment.GetEnvironmentVariable("ACCEPTANCE_VERSION") ?? "unknown"}",
    "text/plain"));
app.MapGet("/acceptance", () => Results.Json(new
{
    stack = "aspnet-core",
    version = Environment.GetEnvironmentVariable("ACCEPTANCE_VERSION") ?? "unknown",
    dataMarker = File.ReadAllText(markerPath).Trim()
}));

await app.RunAsync();

static int ReadPort()
{
    var value = Environment.GetEnvironmentVariable("AUTOMATON_PORT");
    return int.TryParse(value, out var port) && port is >= 1 and <= 65_535
        ? port
        : 8080;
}
