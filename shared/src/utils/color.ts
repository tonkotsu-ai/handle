import type { RGBA } from "../types"

let ctx: CanvasRenderingContext2D | null = null

function getCtx() {
  if (!ctx) {
    const canvas = document.createElement("canvas")
    canvas.width = 1
    canvas.height = 1
    ctx = canvas.getContext("2d")!
  }
  return ctx
}

export function parseColor(css: string): RGBA | null {
  if (!css || css === "none" || css === "initial" || css === "inherit")
    return null

  // Try regex first for common formats
  const rgbaMatch = css.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/
  )
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]),
      g: parseInt(rgbaMatch[2]),
      b: parseInt(rgbaMatch[3]),
      a: rgbaMatch[4] != null ? parseFloat(rgbaMatch[4]) : 1,
    }
  }

  // Modern rgb(r g b / a) syntax
  const modernMatch = css.match(
    /rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+%?))?\s*\)/
  )
  if (modernMatch) {
    let a = 1
    if (modernMatch[4] != null) {
      a = modernMatch[4].endsWith("%")
        ? parseFloat(modernMatch[4]) / 100
        : parseFloat(modernMatch[4])
    }
    return {
      r: parseInt(modernMatch[1]),
      g: parseInt(modernMatch[2]),
      b: parseInt(modernMatch[3]),
      a,
    }
  }

  // Hex
  const hex = hexToRgba(css)
  if (hex) return hex

  // Fallback: draw a pixel and read it back via getImageData.
  // This handles oklch, oklab, hsl, named colors, etc.
  try {
    const c = getCtx()

    // Test if the color is valid by checking if fillStyle accepts it
    c.fillStyle = "#000000"
    c.fillStyle = css
    const accepted1 = c.fillStyle
    if (accepted1 === "#000000") {
      // Might be actual black or invalid — try with white baseline
      c.fillStyle = "#ffffff"
      c.fillStyle = css
      if (c.fillStyle === "#ffffff") return null // invalid color
    }

    // Draw the color and read back the pixel
    c.clearRect(0, 0, 1, 1)
    c.fillStyle = css
    c.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = c.getImageData(0, 0, 1, 1).data
    return { r, g, b, a: Math.round((a / 255) * 100) / 100 }
  } catch {
    return null
  }
}

export function hexToRgba(hex: string): RGBA | null {
  const h = hex.replace(/^#/, "")
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
      a: 1,
    }
  }
  if (h.length === 4) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
      a: parseInt(h[3] + h[3], 16) / 255,
    }
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    }
  }
  if (h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: parseInt(h.slice(6, 8), 16) / 255,
    }
  }
  return null
}

function toHex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0")
}

export function rgbaToHex(c: RGBA): string {
  const hex = `#${toHex2(c.r)}${toHex2(c.g)}${toHex2(c.b)}`
  if (c.a < 1) return `${hex}${toHex2(c.a * 255)}`
  return hex
}

export function rgbaToString(c: RGBA): string {
  if (c.a < 1) return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`
  return `rgb(${c.r}, ${c.g}, ${c.b})`
}

export function formatColor(
  c: RGBA,
  format: "hex" | "rgba"
): string {
  return format === "hex" ? rgbaToHex(c) : rgbaToString(c)
}

export function normalizeToHex(css: string): string {
  const c = parseColor(css)
  return c ? rgbaToHex(c) : css
}

export function rgbaToHex6(c: RGBA): string {
  return `#${toHex2(c.r)}${toHex2(c.g)}${toHex2(c.b)}`
}

export function normalizeToHex6(css: string): string {
  const c = parseColor(css)
  return c ? rgbaToHex6(c) : css
}

export interface HSV {
  h: number
  s: number
  v: number
}

export function rgbaToHsv(c: RGBA): HSV {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }

  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

export function hsvToRgba(hsv: HSV, a = 1): RGBA {
  const { h, s, v } = hsv
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  let r = 0,
    g = 0,
    b = 0
  if (h < 60) {
    r = c; g = x
  } else if (h < 120) {
    r = x; g = c
  } else if (h < 180) {
    g = c; b = x
  } else if (h < 240) {
    g = x; b = c
  } else if (h < 300) {
    r = x; b = c
  } else {
    r = c; b = x
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a,
  }
}

export function getOpacity(c: RGBA): number {
  return Math.round(c.a * 100)
}

export function withOpacity(c: RGBA, percent: number): RGBA {
  return { ...c, a: Math.max(0, Math.min(100, percent)) / 100 }
}
