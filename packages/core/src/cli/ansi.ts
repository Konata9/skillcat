/**
 * The skills CLI hardcodes ANSI escape sequences in its human-facing output
 * (e.g. `const TEXT = "\x1B[38;5;145m"` in the update/install paths), so
 * `NO_COLOR` cannot switch them off. Everything we capture is rendered as
 * plain text, so escape sequences are stripped at the edge.
 */
const ANSI_PATTERN =
  /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\)|[ -/]*[0-~])/g;

export function stripAnsi(value: string): string {
  // The trailing pass catches malformed or chunk-split sequences, so no stray
  // ESC can ever reach the UI.
  return value.replace(ANSI_PATTERN, '').replace(/\u001B/g, '');
}

/**
 * A single terminal-correct line: escape sequences removed, and `\r` overwrites
 * resolved the way a terminal would show them (last write wins). Node's readline
 * already treats `\r\n` as one break, so any `\r` left here is a progress rewrite.
 */
export function cleanOutputLine(line: string): string {
  const withoutAnsi = stripAnsi(line);
  if (!withoutAnsi.includes('\r')) return withoutAnsi.trimEnd();
  const segments = withoutAnsi.split('\r');
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]!.trimEnd();
    if (segment.trim()) return segment;
  }
  return '';
}
