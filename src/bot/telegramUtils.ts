const TELEGRAM_MAX_MESSAGE_LENGTH = 4000;

/**
 * Splits a message into Telegram-safe chunks (Telegram's real limit is
 * 4096 chars; we stay under that with margin). Prefers to split on
 * paragraph/line boundaries rather than mid-word.
 */
export function splitForTelegram(text: string, maxLen = TELEGRAM_MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = remaining.lastIndexOf(" ", maxLen);
    if (splitAt <= 0) splitAt = maxLen;

    // A hard cut can land inside a UTF-16 surrogate pair (e.g. many emoji
    // in a row with no whitespace nearby) - back off one index so the
    // pair stays together instead of producing two lone, invalid
    // surrogates on either side of the split.
    const charCode = remaining.charCodeAt(splitAt);
    if (charCode >= 0xdc00 && charCode <= 0xdfff) splitAt -= 1;

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/** Truncates to at most `n` characters, appending an ellipsis if anything was cut. */
export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Renders an ISO timestamp as just its date portion (YYYY-MM-DD). */
export function formatDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

/** Extracts the lowercase command name from "/command@botname args" (Telegram strips "@botname" for you in private chats, but not in groups/channels). Returns null if `text` isn't a command. */
export function parseCommandName(text: string): string | null {
  if (!text.startsWith("/")) return null;
  const spaceIndex = text.indexOf(" ");
  const head = spaceIndex === -1 ? text : text.slice(0, spaceIndex);
  const name = head.slice(1).split("@")[0]?.toLowerCase();
  return name || null;
}

/** Everything after the first space in a command line, verbatim (not whitespace-collapsed). */
export function parseCommandArgs(text: string): string {
  const spaceIndex = text.indexOf(" ");
  return spaceIndex === -1 ? "" : text.slice(spaceIndex + 1);
}
