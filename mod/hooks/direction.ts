// The direction rule of the rtl-md viewer (app.js, section 1), ported as
// written. The two must change together.

export type Dir = 'rtl' | 'ltr'

// Strong letters only. Arabic punctuation, Persian and Arabic digits,
// diacritics and ZWNJ stay out on purpose: the "last three letters" rule
// needs real letters, or an English sentence ending in an Arabic question
// mark flips.
const RTL_LETTER =
  '\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u066E-\u066F\u0671-\u06D3' +
  '\u06D5\u06E5-\u06E6\u06EE-\u06EF\u06FA-\u06FF\u0750-\u077F' +
  '\u08A0-\u08BF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFC'
const LTR_LETTER =
  'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u0370-\u03FF\u0400-\u04FF'
const RE_RTL = new RegExp('[' + RTL_LETTER + ']')
const RE_LETTER = new RegExp('[' + RTL_LETTER + LTR_LETTER + ']')
const RE_LETTERS = new RegExp('[' + RTL_LETTER + LTR_LETTER + ']', 'g')

export function hasRtl(text: string): boolean {
  return RE_RTL.test(text)
}

// Whether the text, read as it stands, opens with an RTL letter: what a
// surface that goes by the first strong character would make of it.
export function opensRtl(text: string): boolean {
  const first = RE_LETTER.exec(text)

  return first !== null && RE_RTL.test(first[0])
}

// Drops markdown syntax and the content that is Latin whatever the language
// around it (code, URLs), so the direction is read off the prose alone.
export function stripForDir(text: string): string {
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    // The list marker and the checkbox, so the "x" of [x] decides nothing
    .replace(
      /^[ \t]*(?:[-*+]|[0-9\u06F0-\u06F9\u0660-\u0669]{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm,
      ' ',
    )
    .replace(/^[ \t]*>[ \t]?/gm, ' ')
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, ' $1 ')
    .replace(/<[^>\s]+>/g, ' ')
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ')
    .replace(/[#>*_~=|+\-.:!\[\]()\\]/g, ' ')
}

// RTL when the text opens with an RTL letter, or closes with one (any of its
// last three letters). The opening is what Unicode says; the closing is there
// because a Persian sentence that opens with a Latin name is still Persian.
export function strongDir(text: string, fallback: Dir): Dir {
  const letters = stripForDir(text).match(RE_LETTERS)

  if (letters === null || letters.length === 0) {
    return fallback
  }

  if (RE_RTL.test(letters[0] ?? '')) {
    return 'rtl'
  }

  return letters.slice(-3).some(letter => RE_RTL.test(letter)) ? 'rtl' : 'ltr'
}
