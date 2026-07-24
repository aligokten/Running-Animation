/** Apply an alpha value to a hex or rgb(a) colour string. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (match) {
    const [r, g, b] = match[1].split(',').map((v) => Number.parseFloat(v));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return color;
}

export function mixHex(a: string, b: string, t: number): string {
  const parse = (c: string) => {
    const hex = c.replace('#', '');
    const full =
      hex.length === 3 ? hex.split('').map((x) => x + x).join('') : hex;
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const k = Math.max(0, Math.min(1, t));
  const to = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${to(r1 + (r2 - r1) * k)}${to(g1 + (g2 - g1) * k)}${to(b1 + (b2 - b1) * k)}`;
}
