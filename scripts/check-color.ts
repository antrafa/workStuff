// Autoteste da derivação de cor: node scripts/check-color.ts
import assert from 'node:assert/strict'
import { contrast, inkFor, readableOn } from '../src/lib/color.ts'

const DARK_BG = '#181917'
const LIGHT_BG = '#fbfaf6'

for (const hex of ['#c6f432', '#8b5cf6', '#2f5fd0', '#ffd23f', '#ff4d4d', '#000000', '#ffffff']) {
  assert.ok(contrast(readableOn(hex, DARK_BG), DARK_BG) >= 4.5, `${hex} ilegível no escuro`)
  assert.ok(contrast(readableOn(hex, LIGHT_BG), LIGHT_BG) >= 4.5, `${hex} ilegível no claro`)
  assert.ok(contrast(inkFor(hex), hex) >= 3, `texto sobre ${hex} sem contraste`)
}
assert.equal(readableOn('#c6f432', DARK_BG), '#c6f432', 'cor já legível não deve mudar')
console.log('check-color: ok')
