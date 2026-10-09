// What `dir="rtl"` on a block is to the rtl-md viewer, for a surface that
// offers no such attribute: the direction rides in the text itself, as
// Unicode bidi controls. The blocks are cut and judged as the viewer cuts and
// judges them (app.js, section 4), one direction per top-level block; only
// what is put around the text differs.

import { hasRtl, opensRtl, strongDir } from './direction'
import type { Dir } from './direction'

const LRM = '\u200E'
const RLM = '\u200F'
const RLE = '\u202B'
const PDF = '\u202C'
const LRI = '\u2066'
const PDI = '\u2069'

// A line of an RTL block: an embedding between two marks. The desktop
// transcript gives a block the direction of its first strong character, so
// there the opening mark alone turns the block around, alignment, bullets and
// all; the embedding carries the order where a surface does no such thing.
export const OPEN = RLM + RLE
export const CLOSE = PDF + RLM
// A line of an LTR block that opens with an RTL letter: the mark keeps that
// same surface from turning the line around on its own.
export const LTR_MARK = LRM
// The viewer's `<code dir="ltr">` and `<a dir="ltr">`
export const LTR_OPEN = LRI
export const LTR_CLOSE = PDI

// `markdown` for text a surface draws as markdown: the marks go inside each
// block's syntax. `plain` for text drawn as typed: each line is marked whole.
export type Mode = 'markdown' | 'plain'

// A line, or what is left of one under a quote or a list marker: `s` starts
// `off` characters into line `i`.
type Line = { i: number; off: number; s: string }
// Text put in at `at` of line `i`, in place of the `drop` characters there
type Insert = { i: number; at: number; text: string; drop?: number }
type Context = { mode: Mode; fallback: Dir; inserts: Insert[] }
type ItemStart = {
  indent: number
  ordered: boolean
  markerLen: number
  spaces: number
  textOff: number
  isHostMarker: boolean
}
type Item = { head: Line; start: ItemStart; rest: Line[] }

const BLANK: Line = { i: -1, off: 0, s: '' }

// Persian and Arabic digits number a list too
const DIGITS = '0-9\\u06F0-\\u06F9\\u0660-\\u0669'
const RE_HR = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/
const RE_ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/
const RE_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)/
const RE_SETEXT = /^ {0,3}(=+|-{2,})[ \t]*$/
const RE_QUOTE = /^ {0,3}>/
const RE_BULLET = /^( *)([-*+])( +|$)(.*)$/
const RE_ORDERED = new RegExp('^( *)([' + DIGITS + ']{1,9})([.)])( +|$)(.*)$')
const RE_REF_DEF =
  /^ {0,3}\[([^\]\n]+)\]:[ \t]*(\S+)(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/

// What a line holds that must stay whole, some of it LTR whatever surrounds it
const RE_SPANS =
  /(?<escape>\\[\s\S])|(?<code>(?<ticks>`+)[\s\S]+?\k<ticks>(?!`))|(?<link>!?\[(?:[^\[\]]|\[[^\]]*\])*\]\((?:[^()]|\([^()]*\))*\))|(?<auto><(?:https?|ftp|mailto):[^\s<>]+>)|(?<tag><\/?[A-Za-z][^<>]*>)|(?<url>https?:\/\/[^\s<>`]+)/g
const RE_URL_TAIL = /[?!.,:;*_~'"\]\u060C\u061B\u061F\u00BB]/

const cap = (match: RegExpExecArray, group: number): string => match[group] ?? ''
const textAt = (lines: readonly Line[], i: number): string => lines[i]?.s ?? ''
const sub = (line: Line, cut: number): Line => ({
  i: line.i,
  off: line.off + cut,
  s: line.s.slice(cut),
})
const closeOf = (fence: string): RegExp =>
  new RegExp('^ {0,3}' + fence.charAt(0) + '{' + fence.length + ',}[ \\t]*$')

function count(text: string, char: string): number {
  return text.split(char).length - 1
}

function listItemStart(line: string): ItemStart | null {
  const bullet = RE_BULLET.exec(line)

  if (bullet !== null && !RE_HR.test(line)) {
    const indent = cap(bullet, 1).length
    const spaces = cap(bullet, 3).length

    return {
      indent,
      ordered: false,
      markerLen: 1,
      spaces: spaces || 1,
      textOff: indent + 1 + spaces,
      isHostMarker: true,
    }
  }

  const ordered = RE_ORDERED.exec(line)

  if (ordered !== null) {
    const indent = cap(ordered, 1).length
    const number = cap(ordered, 2)
    const spaces = cap(ordered, 4).length

    return {
      indent,
      ordered: true,
      markerLen: number.length + 1,
      spaces: spaces || 1,
      textOff: indent + number.length + 1 + spaces,
      // A surface's markdown numbers a list by ASCII digits alone
      isHostMarker: /^[0-9]+$/.test(number),
    }
  }

  return null
}

function isDelimRow(line: string): boolean {
  return (
    /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/.test(line) &&
    line.includes('-')
  )
}

function isBlockStart(line: string): boolean {
  return (
    RE_HR.test(line) ||
    /^ {0,3}#{1,6}([ \t]|$)/.test(line) ||
    /^ {0,3}(`{3,}|~{3,})/.test(line) ||
    RE_QUOTE.test(line) ||
    listItemStart(line) !== null
  )
}

// The cells of a table row, each by where its text sits in the row
function cellRanges(row: string): Array<[number, number]> {
  let from = (/^[ \t]*/.exec(row)?.[0] ?? '').length
  let to = row.replace(/[ \t]+$/, '').length

  if (row.charAt(from) === '|') {
    from++
  }

  if (to > from && row.charAt(to - 1) === '|') {
    to--
  }

  const cells: Array<[number, number]> = []
  let start = from

  for (let k = from; k <= to; k++) {
    if (k + 1 < to && row.charAt(k) === '\\' && row.charAt(k + 1) === '|') {
      k++
      continue
    }

    if (k === to || row.charAt(k) === '|') {
      let a = start
      let b = k

      while (a < b && /[ \t]/.test(row.charAt(a))) {
        a++
      }

      while (b > a && /[ \t]/.test(row.charAt(b - 1))) {
        b--
      }

      cells.push([a, b])
      start = k + 1
    }
  }

  return cells
}

// Reference definitions are no block of their own: the blocks are cut as if
// they were not there
function withoutRefDefs(lines: readonly Line[]): Line[] {
  const kept: Line[] = []
  let closing: RegExp | null = null

  for (const line of lines) {
    if (closing !== null) {
      kept.push(line)

      if (closing.test(line.s)) {
        closing = null
      }

      continue
    }

    const fence = RE_FENCE.exec(line.s)

    if (fence !== null) {
      closing = closeOf(cap(fence, 1))
      kept.push(line)
      continue
    }

    if (!RE_REF_DEF.test(line.s)) {
      kept.push(line)
    }
  }

  return kept
}

function parseList(
  lines: readonly Line[],
  start: number,
): { items: Item[]; next: number } {
  const items: Item[] = []
  const first = listItemStart(textAt(lines, start))
  let i = start

  if (first === null) {
    return { items, next: start + 1 }
  }

  while (i < lines.length) {
    const head = lines[i]
    const info = head === undefined ? null : listItemStart(head.s)

    if (
      head === undefined ||
      info === null ||
      info.ordered !== first.ordered ||
      info.indent < first.indent ||
      info.indent > first.indent + 3
    ) {
      break
    }

    const contentIndent = info.indent + info.markerLen + Math.min(info.spaces, 4)
    const rest: Line[] = []
    let pending = 0
    i++

    while (i < lines.length) {
      const next = lines[i]

      if (next === undefined) {
        break
      }

      if (next.s.trim() === '') {
        pending++
        i++
        continue
      }

      const indent = (/^ */.exec(next.s)?.[0] ?? '').length

      if (indent >= contentIndent) {
        for (; pending > 0; pending--) {
          rest.push(BLANK)
        }

        rest.push(sub(next, contentIndent))
        i++
        continue
      }

      // The next item of this list, a block of its own after the list, or
      // else the paragraph going on lazily
      if (listItemStart(next.s) !== null && indent <= first.indent + 3) {
        break
      }

      if (pending > 0 || isBlockStart(next.s)) {
        break
      }

      rest.push(sub(next, indent))
      i++
    }

    items.push({ head, start: info, rest })
  }

  return { items, next: i }
}

// Where a bare URL ends once the punctuation that closes the sentence around
// it is left out, as an autolink leaves it out
function urlLength(url: string): number {
  let end = url.length

  while (end > 0) {
    const last = url.charAt(end - 1)

    if (last === ')') {
      const kept = url.slice(0, end)

      if (count(kept, '(') >= count(kept, ')')) {
        break
      }
    } else if (!RE_URL_TAIL.test(last)) {
      break
    }

    end--
  }

  return end
}

// Marks one run of inline text, `from` to `to` of the line, with the
// direction of its block
function inlineMarks(line: Line, from: number, to: number, dir: Dir, ctx: Context): void {
  const text = line.s.slice(from, to)

  // In an LTR block only a line that opens with an RTL letter needs a mark
  if (text.trim() === '' || (dir === 'ltr' && !opensRtl(text))) {
    return
  }

  const isolates: Array<{ start: number; end: number; open: string; close: string }> = []
  let shielded = 0

  for (const found of text.matchAll(RE_SPANS)) {
    const start = found.index ?? 0
    const groups = found.groups ?? {}
    let end = start + found[0].length

    if (groups.url !== undefined) {
      // The tail of a longer token is no link
      if (/[A-Za-z0-9/]/.test(text.charAt(start - 1))) {
        continue
      }

      end = start + urlLength(found[0])

      // A control next to a bare URL would be read as part of it, so the URL
      // is written as the autolink it already is, and that is isolated
      if (ctx.mode === 'markdown' && end - start > 'https://'.length) {
        isolates.push({ start, end, open: LTR_OPEN + '<', close: '>' + LTR_CLOSE })
      }
    } else if (groups.code !== undefined || groups.auto !== undefined) {
      isolates.push({ start, end, open: LTR_OPEN, close: LTR_CLOSE })
    }

    shielded = end
  }

  let open = 0
  let close = text.length

  if (ctx.mode === 'markdown') {
    // A run of emphasis characters opens or closes by what stands on each
    // side of it, and a bidi control there counts as a letter: next to the
    // line's edge the run would stop being one. The marks go inside it.
    const lead = /^(?:\*+|_+|~+|==)+(?=\S)/.exec(text)?.[0] ?? ''
    const trail = /(?:\*+|_+|~+|==)+$/.exec(text)

    if (lead !== '' && text.includes(lead.charAt(0), lead.length)) {
      open = lead.length
    }

    if (
      trail !== null &&
      trail.index > 0 &&
      trail.index >= Math.max(shielded, open) &&
      /\S/.test(text.charAt(trail.index - 1)) &&
      text.lastIndexOf(text.charAt(text.length - 1), trail.index - 1) >= 0
    ) {
      close = trail.index
    }

    if (open >= close) {
      open = 0
      close = text.length
    }
  }

  const base = line.off + from

  if (dir === 'ltr') {
    ctx.inserts.push({ i: line.i, at: base + open, text: LTR_MARK })

    return
  }

  ctx.inserts.push({ i: line.i, at: base + open, text: OPEN })

  for (const one of isolates) {
    ctx.inserts.push({ i: line.i, at: base + one.start, text: one.open })
    ctx.inserts.push({ i: line.i, at: base + one.end, text: one.close })
  }

  ctx.inserts.push({ i: line.i, at: base + close, text: CLOSE })
}

// A line of a paragraph, less what has to stay at its very end to break the
// line there: the trailing spaces, or the lone backslash
function lineMarks(line: Line, dir: Dir, ctx: Context): void {
  let end = line.s.replace(/[ \t]+$/, '').length
  const slashes = (/\\*$/.exec(line.s.slice(0, end))?.[0] ?? '').length

  if (slashes % 2 === 1) {
    end--
  }

  inlineMarks(line, 0, end, dir, ctx)
}

// Every line of a block drawn as typed, code fences apart
function plainMarks(extent: readonly Line[], dir: Dir, ctx: Context): void {
  let closing: RegExp | null = null

  for (const line of extent) {
    const body = line.s.replace(/^[ \t]+/, '')

    if (closing !== null) {
      if (closing.test(body)) {
        closing = null
      }

      continue
    }

    const fence = RE_FENCE.exec(body)

    if (fence !== null) {
      closing = closeOf(cap(fence, 1))
      continue
    }

    inlineMarks(
      line,
      line.s.length - body.length,
      line.s.replace(/[ \t]+$/, '').length,
      dir,
      ctx,
    )
  }
}

// The viewer reads `:--` as the start of a cell and `--:` as its end; a
// surface reads them as left and right. For an RTL table the delimiter row is
// rewritten to say on that surface what it says in the viewer, a column with
// neither given the start.
function startAligned(delimiter: Line, ctx: Context): void {
  for (const [from, to] of cellRanges(delimiter.s)) {
    const cell = delimiter.s.slice(from, to)
    const isStart = !cell.endsWith(':')
    const dashes = '-'.repeat(Math.max(1, count(cell, '-')))

    // Centered either way
    if (cell.startsWith(':') && !isStart) {
      continue
    }

    ctx.inserts.push({
      i: delimiter.i,
      at: delimiter.off + from,
      text: isStart ? dashes + ':' : ':' + dashes,
      drop: to - from,
    })
  }
}

function itemMarks(item: Item, dir: Dir, ctx: Context): void {
  if (!item.start.isHostMarker) {
    // To the surface this line is prose, marker and all
    lineMarks(sub(item.head, item.start.indent), dir, ctx)
    walk(item.rest, dir, ctx)

    return
  }

  let first = sub(item.head, item.start.textOff)
  const box = /^\[[ xX]\][ \t]+/.exec(first.s)

  if (box !== null) {
    first = sub(first, box[0].length)
  }

  walk([first, ...item.rest], dir, ctx)
}

// Cuts the lines into blocks. At the top each block takes the direction of
// its own text; beneath, a block has the direction of the one it is in, as
// what is nested inherits `dir` in the viewer.
function walk(lines: readonly Line[], inherited: Dir | undefined, ctx: Context): void {
  // The direction to mark a block with, or none for a block with nothing RTL
  // in it, which every surface lays out right as it stands
  const dirOf = (text: string): Dir | undefined => {
    if (inherited !== undefined) {
      return inherited
    }

    const dir = strongDir(text, ctx.fallback)

    return dir === 'rtl' || hasRtl(text) ? dir : undefined
  }
  const mark = (from: number, to: number, dir: Dir, parts: () => void): void => {
    if (ctx.mode === 'plain') {
      plainMarks(lines.slice(from, to), dir, ctx)
    } else {
      parts()
    }
  }
  let i = 0

  while (i < lines.length) {
    const from = i
    const here = lines[i]

    if (here === undefined) {
      break
    }

    const line = here.s

    if (line.trim() === '') {
      i++
      continue
    }

    // Code is LTR always: fenced
    const fence = RE_FENCE.exec(line)

    if (fence !== null) {
      const closing = closeOf(cap(fence, 1))
      i++

      while (i < lines.length && !closing.test(textAt(lines, i))) {
        i++
      }

      i++
      continue
    }

    if (RE_HR.test(line)) {
      i++
      continue
    }

    const atx = RE_ATX.exec(line)

    if (atx !== null) {
      const title = cap(atx, 2).replace(/[ \t]+#+[ \t]*$/, '')
      i++

      const dir = title === '' ? undefined : dirOf(title)

      if (dir !== undefined) {
        mark(from, i, dir, () => {
          const start = (/^ {0,3}#{1,6}[ \t]+/.exec(line)?.[0] ?? '').length
          inlineMarks(here, start, start + title.length, dir, ctx)
        })
      }

      continue
    }

    if (RE_QUOTE.test(line)) {
      const inner: Line[] = []
      const quoted: string[] = []

      while (i < lines.length) {
        const next = lines[i]

        if (next === undefined) {
          break
        }

        const marker = /^ {0,3}> ?/.exec(next.s)

        if (marker !== null) {
          inner.push(sub(next, marker[0].length))
        } else if (next.s.trim() !== '' && !isBlockStart(next.s)) {
          inner.push(next)
        } else {
          break
        }

        quoted.push(next.s)
        i++
      }

      const dir = dirOf(quoted.join('\n'))

      if (dir !== undefined) {
        mark(from, i, dir, () => walk(inner, dir, ctx))
      }

      continue
    }

    if (line.includes('|') && isDelimRow(textAt(lines, i + 1))) {
      const delimiter = lines[i + 1]

      if (
        delimiter !== undefined &&
        cellRanges(delimiter.s).length === cellRanges(line).length
      ) {
        const rows: Line[] = [here]
        const table: string[] = [line, delimiter.s]
        i += 2

        while (i < lines.length) {
          const row = lines[i]

          if (
            row === undefined ||
            row.s.trim() === '' ||
            !row.s.includes('|') ||
            isBlockStart(row.s)
          ) {
            break
          }

          rows.push(row)
          table.push(row.s)
          i++
        }

        const dir = dirOf(table.join('\n'))

        if (dir !== undefined) {
          mark(from, i, dir, () => {
            for (const row of rows) {
              for (const [a, b] of cellRanges(row.s)) {
                inlineMarks(row, a, b, dir, ctx)
              }
            }

            if (dir === 'rtl') {
              startAligned(delimiter, ctx)
            }
          })
        }

        continue
      }
    }

    if (listItemStart(line) !== null) {
      const list = parseList(lines, i)
      i = list.next

      const text = lines
        .slice(from, i)
        .map(one => one.s)
        .join('\n')

      const dir = dirOf(text)

      if (dir !== undefined) {
        mark(from, i, dir, () => {
          for (const item of list.items) {
            itemMarks(item, dir, ctx)
          }
        })
      }

      continue
    }

    // Code is LTR always: indented by four spaces
    if (/^ {4}\S/.test(line)) {
      while (
        i < lines.length &&
        (/^ {4}/.test(textAt(lines, i)) || textAt(lines, i).trim() === '')
      ) {
        i++
      }

      continue
    }

    const para: Line[] = []

    while (i < lines.length) {
      const next = lines[i]

      if (next === undefined || next.s.trim() === '') {
        break
      }

      if (para.length > 0 && (RE_SETEXT.test(next.s) || isBlockStart(next.s))) {
        break
      }

      para.push(sub(next, (/^[ \t]*/.exec(next.s)?.[0] ?? '').length))
      i++
    }

    let text = para.map(one => one.s).join('\n')

    // A paragraph underlined is a heading
    if (RE_SETEXT.test(textAt(lines, i))) {
      text = para
        .map(one => one.s)
        .join(' ')
        .trim()
      i++
    }

    const dir = dirOf(text)

    if (dir !== undefined) {
      mark(from, i, dir, () => {
        for (const one of para) {
          lineMarks(one, dir, ctx)
        }
      })
    }
  }
}

// The text with each block that holds RTL letters marked with its direction,
// or the text itself, the same string, when nothing in it needs a mark.
export function annotate(source: string, mode: Mode): string {
  if (!hasRtl(source)) {
    return source
  }

  const parts = source.split(/(\r\n|\r|\n)/)
  const raw: string[] = []
  const breaks: string[] = []

  for (let k = 0; k < parts.length; k += 2) {
    raw.push(parts[k] ?? '')
    breaks.push(parts[k + 1] ?? '')
  }

  // The blocks are cut with each leading tab read as four spaces; `widened`
  // is how much further right that puts the rest of the line.
  const widened: number[] = []
  const lines = raw.map((text, i): Line => {
    const indent = /^[ \t]*/.exec(text)?.[0] ?? ''
    const wide = indent.replace(/\t/g, '    ')
    widened.push(wide.length - indent.length)

    return { i, off: 0, s: wide + text.slice(indent.length) }
  })
  // A block with no letter of its own goes the way the message goes
  const ctx: Context = { mode, fallback: strongDir(source, 'ltr'), inserts: [] }

  walk(withoutRefDefs(lines), undefined, ctx)

  if (ctx.inserts.length === 0) {
    return source
  }

  const byLine = new Map<number, Insert[]>()

  for (const insert of ctx.inserts) {
    const list = byLine.get(insert.i)

    if (list === undefined) {
      byLine.set(insert.i, [insert])
    } else {
      list.push(insert)
    }
  }

  return raw
    .map((text, i) => {
      const list = byLine.get(i)

      if (list === undefined) {
        return text + (breaks[i] ?? '')
      }

      // Stable: at one place the marks stay in the order they were made
      list.sort((a, b) => a.at - b.at)

      let marked = ''
      let done = 0

      for (const insert of list) {
        const at = insert.at - (widened[i] ?? 0)
        marked += text.slice(done, at) + insert.text
        done = at + (insert.drop ?? 0)
      }

      return marked + text.slice(done) + (breaks[i] ?? '')
    })
    .join('')
}
