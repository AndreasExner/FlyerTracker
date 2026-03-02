using System.Collections.Concurrent;

namespace FlyerTracker.Api.Security;

/// <summary>
/// Simple in-memory rate limiter. Tracks request count per key (IP or name)
/// within a sliding window. Not shared across instances — sufficient for
/// single-instance dev / small-scale production.
/// </summary>
public class RateLimiter
{
    private readonly ConcurrentDictionary<string, SlidingWindow> _windows = new();
    private readonly int _maxRequests;
    private readonly TimeSpan _window;

    public RateLimiter(int maxRequests, TimeSpan window)
    {
        _maxRequests = maxRequests;
        _window = window;
    }

    /// <summary>Returns true if the request is allowed; false if rate-limited.</summary>
    public bool IsAllowed(string key)
    {
        var now = DateTimeOffset.UtcNow;
        var sw = _windows.GetOrAdd(key, _ => new SlidingWindow());

        lock (sw)
        {
            // Purge timestamps outside window
            while (sw.Timestamps.Count > 0 && now - sw.Timestamps.Peek() > _window)
                sw.Timestamps.Dequeue();

            if (sw.Timestamps.Count >= _maxRequests)
                return false;

            sw.Timestamps.Enqueue(now);
            return true;
        }
    }

    /// <summary>Periodically clean up stale keys (call from a timer if desired).</summary>
    public void Cleanup()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var kvp in _windows)
        {
            lock (kvp.Value)
            {
                while (kvp.Value.Timestamps.Count > 0 && now - kvp.Value.Timestamps.Peek() > _window)
                    kvp.Value.Timestamps.Dequeue();

                if (kvp.Value.Timestamps.Count == 0)
                    _windows.TryRemove(kvp.Key, out _);
            }
        }
    }

    private class SlidingWindow
    {
        public Queue<DateTimeOffset> Timestamps { get; } = new();
    }
}
