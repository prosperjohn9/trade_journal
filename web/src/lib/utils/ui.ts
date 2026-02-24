export function cx(
  ...classes: Array<string | false | null | undefined | string[]>
): string {
  const out: string[] = [];

  for (const c of classes) {
    if (!c) continue;
    if (Array.isArray(c)) {
      for (const v of c) if (v) out.push(v);
    } else {
      out.push(c);
    }
  }

  return out.join(' ');
}