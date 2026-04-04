import { describe, it, expect } from "vitest"
import {
  hexToRgba,
  rgbaToHex,
  rgbaToHex6,
  rgbaToString,
  formatColor,
  normalizeToHex,
  normalizeToHex6,
  rgbaToHsv,
  hsvToRgba,
  getOpacity,
  withOpacity,
  parseColor,
} from "./color"
import type { RGBA } from "../types"

describe("hexToRgba", () => {
  it("parses 3-char hex", () => {
    expect(hexToRgba("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(hexToRgba("#000")).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(hexToRgba("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it("parses 4-char hex with alpha", () => {
    const result = hexToRgba("#f00f")!
    expect(result.r).toBe(255)
    expect(result.g).toBe(0)
    expect(result.b).toBe(0)
    expect(result.a).toBe(1)
  })

  it("parses 6-char hex", () => {
    expect(hexToRgba("#ff8800")).toEqual({ r: 255, g: 136, b: 0, a: 1 })
    expect(hexToRgba("#000000")).toEqual({ r: 0, g: 0, b: 0, a: 1 })
  })

  it("parses 8-char hex with alpha", () => {
    const result = hexToRgba("#ff000080")!
    expect(result.r).toBe(255)
    expect(result.g).toBe(0)
    expect(result.b).toBe(0)
    expect(result.a).toBeCloseTo(0.502, 2)
  })

  it("handles hex without hash", () => {
    expect(hexToRgba("ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it("returns null for unsupported lengths", () => {
    expect(hexToRgba("#12")).toBeNull()
    expect(hexToRgba("#1234567890")).toBeNull()
  })

  it("returns NaN values for non-hex chars with valid length", () => {
    // hexToRgba does not validate hex chars — it matches on length only
    const result = hexToRgba("xyz")!
    expect(result.r).toBeNaN()
  })
})

describe("rgbaToHex", () => {
  it("converts opaque color", () => {
    expect(rgbaToHex({ r: 255, g: 0, b: 0, a: 1 })).toBe("#ff0000")
    expect(rgbaToHex({ r: 0, g: 0, b: 0, a: 1 })).toBe("#000000")
  })

  it("includes alpha when less than 1", () => {
    const hex = rgbaToHex({ r: 255, g: 0, b: 0, a: 0.5 })
    expect(hex).toBe("#ff000080")
  })

  it("clamps values to 0-255", () => {
    expect(rgbaToHex({ r: 300, g: -10, b: 128, a: 1 })).toBe("#ff0080")
  })
})

describe("rgbaToString", () => {
  it("returns rgb() for opaque", () => {
    expect(rgbaToString({ r: 255, g: 0, b: 0, a: 1 })).toBe("rgb(255, 0, 0)")
  })

  it("returns rgba() for transparent", () => {
    expect(rgbaToString({ r: 255, g: 0, b: 0, a: 0.5 })).toBe(
      "rgba(255, 0, 0, 0.5)"
    )
  })
})

describe("formatColor", () => {
  const red: RGBA = { r: 255, g: 0, b: 0, a: 1 }

  it("formats as hex", () => {
    expect(formatColor(red, "hex")).toBe("#ff0000")
  })

  it("formats as rgba", () => {
    expect(formatColor(red, "rgba")).toBe("rgb(255, 0, 0)")
  })
})

describe("parseColor", () => {
  it("parses rgba() string", () => {
    expect(parseColor("rgba(255, 0, 0, 0.5)")).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 0.5,
    })
  })

  it("parses rgb() string", () => {
    expect(parseColor("rgb(128, 64, 32)")).toEqual({
      r: 128,
      g: 64,
      b: 32,
      a: 1,
    })
  })

  it("parses modern space-separated rgb()", () => {
    expect(parseColor("rgb(128 64 32)")).toEqual({
      r: 128,
      g: 64,
      b: 32,
      a: 1,
    })
  })

  it("parses modern rgb() with / alpha", () => {
    expect(parseColor("rgb(128 64 32 / 0.5)")).toEqual({
      r: 128,
      g: 64,
      b: 32,
      a: 0.5,
    })
  })

  it("parses modern rgb() with % alpha", () => {
    expect(parseColor("rgb(128 64 32 / 50%)")).toEqual({
      r: 128,
      g: 64,
      b: 32,
      a: 0.5,
    })
  })

  it("parses hex via hexToRgba fallback", () => {
    expect(parseColor("#ff0000")).toEqual({ r: 255, g: 0, b: 0, a: 1 })
  })

  it("returns null for empty/none/initial/inherit", () => {
    expect(parseColor("")).toBeNull()
    expect(parseColor("none")).toBeNull()
    expect(parseColor("initial")).toBeNull()
    expect(parseColor("inherit")).toBeNull()
  })
})

describe("normalizeToHex", () => {
  it("normalizes rgb to hex", () => {
    expect(normalizeToHex("rgb(255, 0, 0)")).toBe("#ff0000")
  })

  it("normalizes hex to hex", () => {
    expect(normalizeToHex("#f00")).toBe("#ff0000")
  })

  it("returns input for unparseable string", () => {
    expect(normalizeToHex("inherit")).toBe("inherit")
  })
})

describe("getOpacity", () => {
  it("returns percentage", () => {
    expect(getOpacity({ r: 0, g: 0, b: 0, a: 1 })).toBe(100)
    expect(getOpacity({ r: 0, g: 0, b: 0, a: 0.5 })).toBe(50)
    expect(getOpacity({ r: 0, g: 0, b: 0, a: 0 })).toBe(0)
  })
})

describe("withOpacity", () => {
  const red: RGBA = { r: 255, g: 0, b: 0, a: 1 }

  it("sets opacity from percentage", () => {
    expect(withOpacity(red, 50)).toEqual({ r: 255, g: 0, b: 0, a: 0.5 })
  })

  it("clamps to 0-100", () => {
    expect(withOpacity(red, -10).a).toBe(0)
    expect(withOpacity(red, 200).a).toBe(1)
  })

  it("does not mutate original", () => {
    withOpacity(red, 50)
    expect(red.a).toBe(1)
  })
})

describe("rgbaToHex6", () => {
  it("returns 6-digit hex for opaque color", () => {
    expect(rgbaToHex6({ r: 255, g: 0, b: 0, a: 1 })).toBe("#ff0000")
  })

  it("returns 6-digit hex even when alpha < 1", () => {
    expect(rgbaToHex6({ r: 255, g: 0, b: 0, a: 0.5 })).toBe("#ff0000")
    expect(rgbaToHex6({ r: 0, g: 128, b: 255, a: 0.1 })).toBe("#0080ff")
  })
})

describe("normalizeToHex6", () => {
  it("strips alpha from 8-digit hex input", () => {
    expect(normalizeToHex6("#ff000080")).toBe("#ff0000")
  })

  it("normalizes rgb to 6-digit hex", () => {
    expect(normalizeToHex6("rgb(255, 0, 0)")).toBe("#ff0000")
  })

  it("normalizes rgba to 6-digit hex", () => {
    expect(normalizeToHex6("rgba(255, 0, 0, 0.5)")).toBe("#ff0000")
  })

  it("returns input for unparseable string", () => {
    expect(normalizeToHex6("inherit")).toBe("inherit")
  })
})

describe("rgbaToHsv / hsvToRgba", () => {
  it("round-trips pure red", () => {
    const red = { r: 255, g: 0, b: 0, a: 1 }
    const hsv = rgbaToHsv(red)
    expect(hsv.h).toBeCloseTo(0)
    expect(hsv.s).toBeCloseTo(1)
    expect(hsv.v).toBeCloseTo(1)
    const back = hsvToRgba(hsv)
    expect(back.r).toBe(255)
    expect(back.g).toBe(0)
    expect(back.b).toBe(0)
  })

  it("round-trips pure green", () => {
    const green = { r: 0, g: 255, b: 0, a: 1 }
    const hsv = rgbaToHsv(green)
    expect(hsv.h).toBeCloseTo(120)
    expect(hsv.s).toBeCloseTo(1)
    expect(hsv.v).toBeCloseTo(1)
    const back = hsvToRgba(hsv)
    expect(back.g).toBe(255)
  })

  it("round-trips pure blue", () => {
    const blue = { r: 0, g: 0, b: 255, a: 1 }
    const hsv = rgbaToHsv(blue)
    expect(hsv.h).toBeCloseTo(240)
    const back = hsvToRgba(hsv)
    expect(back.b).toBe(255)
  })

  it("handles black (v=0)", () => {
    const hsv = rgbaToHsv({ r: 0, g: 0, b: 0, a: 1 })
    expect(hsv.v).toBe(0)
  })

  it("handles white", () => {
    const hsv = rgbaToHsv({ r: 255, g: 255, b: 255, a: 1 })
    expect(hsv.s).toBe(0)
    expect(hsv.v).toBeCloseTo(1)
  })

  it("handles gray (s=0)", () => {
    const hsv = rgbaToHsv({ r: 128, g: 128, b: 128, a: 1 })
    expect(hsv.s).toBe(0)
    expect(hsv.h).toBe(0)
  })

  it("preserves alpha", () => {
    const rgba = hsvToRgba({ h: 0, s: 1, v: 1 }, 0.5)
    expect(rgba.a).toBe(0.5)
  })

  it("round-trips an arbitrary color", () => {
    const orig = { r: 100, g: 200, b: 150, a: 1 }
    const hsv = rgbaToHsv(orig)
    const back = hsvToRgba(hsv)
    expect(back.r).toBe(orig.r)
    expect(back.g).toBe(orig.g)
    expect(back.b).toBe(orig.b)
  })
})
