namespace LostDogTracer.Api.Security;

/// <summary>
/// Strips HTML tags from user-supplied text to prevent stored XSS.
/// Defense-in-depth: frontend also escapes on display.
/// </summary>
public static class InputSanitizer
{
    /// <summary>Remove &lt; and &gt; from input to prevent HTML/script injection.</summary>
    public static string StripHtml(string? input)
    {
        if (string.IsNullOrEmpty(input)) return input ?? "";
        return input.Replace("<", "").Replace(">", "");
    }
}
