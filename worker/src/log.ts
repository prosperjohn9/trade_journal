// Minimal timestamped logger. Railway captures stdout/stderr, so plain console
// is all we need.

function stamp(): string {
  return new Date().toISOString();
}

export const log = {
  info: (...a: unknown[]) => console.log(stamp(), '[info]', ...a),
  warn: (...a: unknown[]) => console.warn(stamp(), '[warn]', ...a),
  error: (...a: unknown[]) => console.error(stamp(), '[error]', ...a),
};
