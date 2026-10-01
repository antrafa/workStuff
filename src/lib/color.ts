// Deriva a cor de destaque para cada fundo garantindo contraste de texto (WCAG AA, 4.5:1).
// Assim qualquer cor escolhida pelo usuário continua legível nos dois temas.

type Rgb = [number, number, number]

const hexToRgb = (hex: string): Rgb => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const rgbToHex = (rgb: Rgb) => '#' + rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('')

function luminance([r, g, b]: Rgb) {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(hexToRgb(a)), luminance(hexToRgb(b))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Mistura a cor em direção ao branco (fundo escuro) ou ao preto (fundo claro) até atingir o contraste.
export function readableOn(hex: string, background: string, target = 4.5) {
  const towards: Rgb = luminance(hexToRgb(background)) < 0.5 ? [255, 255, 255] : [0, 0, 0]
  const base = hexToRgb(hex)
  for (let t = 0; t <= 1; t += 0.02) {
    const mixed = rgbToHex(base.map((c, i) => c + (towards[i] - c) * t) as Rgb)
    if (contrast(mixed, background) >= target) return mixed
  }
  return rgbToHex(towards)
}

// Texto que vai por cima da cor de destaque (botão primário, marca).
export function inkFor(hex: string) {
  return contrast(hex, '#141511') >= contrast(hex, '#ffffff') ? '#141511' : '#ffffff'
}
