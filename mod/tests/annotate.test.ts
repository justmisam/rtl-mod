import { expect, test } from 'claude-code/testing'

import { annotate } from '../hooks/annotate'
import { strongDir } from '../hooks/direction'

// The marks made visible: ⟦ ⟧ around an RTL run, ⟨ ⟩ around an LTR island
const show = (text: string): string =>
  text
    .replaceAll('\u200F\u202B', '⟦')
    .replaceAll('\u202C\u200F', '⟧')
    .replaceAll('\u200E', '▸')
    .replaceAll('\u2066', '⟨')
    .replaceAll('\u2069', '⟩')
const markdown = (text: string): string => show(annotate(text, 'markdown'))
const plain = (text: string): string => show(annotate(text, 'plain'))

test('the direction rule is the viewer\'s', async () => {
  // Opens with a Latin name, closes in Persian
  expect(strongDir('Claude یک مدل زبانی است.', 'ltr')).toBe('rtl')
  // Arabic punctuation is no letter
  expect(strongDir('Is this right؟', 'rtl')).toBe('ltr')
  // Syntax, code and URLs decide nothing
  expect(strongDir('`npm run dev` را اجرا کن', 'ltr')).toBe('rtl')
  expect(strongDir('https://example.com را ببین', 'ltr')).toBe('rtl')
  expect(strongDir('- [x] کار انجام شد', 'ltr')).toBe('rtl')
  expect(strongDir('The word سلام means hello in Persian.', 'rtl')).toBe('ltr')
  expect(strongDir('Price: ۱۲۳', 'rtl')).toBe('ltr')
  // No letter at all: the fallback
  expect(strongDir('۱۲۳ — ✅', 'rtl')).toBe('rtl')
  expect(strongDir('۱۲۳ — ✅', 'ltr')).toBe('ltr')
})

test('text with nothing RTL in it comes back as the same string', async () => {
  const english = '# Title\n\n- one\n- two `code`\n\nDone.'

  expect(annotate(english, 'markdown')).toBe(english)
  expect(annotate(english, 'plain')).toBe(english)
})

test('each top-level block takes its own direction', async () => {
  expect(markdown('Claude یک مدل است.\n\nThis is English.\n')).toBe(
    '⟦Claude یک مدل است.⟧\n\nThis is English.\n',
  )
  // A block with no letter goes the way the message goes
  expect(markdown('سلام.\n\n۱۲۳')).toBe('⟦سلام.⟧\n\n⟦۱۲۳⟧')
  expect(markdown('Hello.\n\nسلام.\n\n123\n\nBye.')).toBe('Hello.\n\n⟦سلام.⟧\n\n123\n\nBye.')
})

test('the marks go inside the block syntax', async () => {
  expect(markdown('## عنوان بخش ##')).toBe('## ⟦عنوان بخش⟧ ##')
  expect(markdown('عنوان\n=====\n\nمتن')).toBe('⟦عنوان⟧\n=====\n\n⟦متن⟧')
  expect(markdown('- مورد با `useEffect` در وسط\n- [x] کار انجام‌شده\n  - زیرمورد')).toBe(
    '- ⟦مورد با ⟨`useEffect`⟩ در وسط⟧\n- [x] ⟦کار انجام‌شده⟧\n  - ⟦زیرمورد⟧',
  )
  expect(markdown('1. یک\n2. دو')).toBe('1. ⟦یک⟧\n2. ⟦دو⟧')
  expect(markdown('- الف\n\t- ب')).toBe('- ⟦الف⟧\n\t- ⟦ب⟧')
  expect(markdown('> «سادگی، نهایتِ ظرافت است.»\n>\n> — لئوناردو')).toBe(
    '> ⟦«سادگی، نهایتِ ظرافت است.»⟧\n>\n> ⟦— لئوناردو⟧',
  )
  expect(markdown('| ویژگی | وضعیت |\n|:--|:-:|\n| جهت خودکار | ✅ |')).toBe(
    '| ⟦ویژگی⟧ | ⟦وضعیت⟧ |\n|--:|:-:|\n| ⟦جهت خودکار⟧ | ⟦✅⟧ |',
  )
})

test('a list numbered in Persian digits is prose to the surface, marker and all', async () => {
  expect(markdown('۱. مورد اول\n۲. مورد دوم')).toBe('⟦۱. مورد اول⟧\n⟦۲. مورد دوم⟧')
})

test('a hard line break keeps what makes it one at the end of the line', async () => {
  expect(markdown('خط اول  \nخط دوم\\\nخط سوم')).toBe('⟦خط اول⟧  \n⟦خط دوم⟧\\\n⟦خط سوم⟧')
  expect(markdown('سلام.\r\nخداحافظ.')).toBe('⟦سلام.⟧\r\n⟦خداحافظ.⟧')
})

test('code stays as written and LTR', async () => {
  expect(markdown('این را ببین:\n\n```js\n// سلام\nconst a = 1\n```\n\nتمام.')).toBe(
    '⟦این را ببین:⟧\n\n```js\n// سلام\nconst a = 1\n```\n\n⟦تمام.⟧',
  )
  expect(markdown('- مورد\n\n  ```sh\n  echo سلام\n  ```')).toBe(
    '- ⟦مورد⟧\n\n  ```sh\n  echo سلام\n  ```',
  )
  expect(markdown('از `foo.bar()` و ``a ` b`` استفاده کن.')).toBe(
    '⟦از ⟨`foo.bar()`⟩ و ⟨``a ` b``⟩ استفاده کن.⟧',
  )
})

test('emphasis at the edge of a line still opens and closes', async () => {
  expect(markdown('**متن**')).toBe('**⟦متن⟧**')
  expect(markdown('**«مهم»** است و _پایان_')).toBe('**⟦«مهم»** است و _پایان⟧_')
  // A lone tilde or star is text, not emphasis
  expect(markdown('~۵ دقیقه')).toBe('⟦~۵ دقیقه⟧')
  expect(markdown('پایان با ستاره\\*')).toBe('⟦پایان با ستاره\\*⟧')
})

test('links keep their targets; a bare URL becomes an isolated autolink', async () => {
  expect(markdown('یک [پیوند](https://example.com/x_(y)) ساده')).toBe(
    '⟦یک [پیوند](https://example.com/x_(y)) ساده⟧',
  )
  expect(markdown('ببین https://example.com/a/ را.')).toBe(
    '⟦ببین ⟨<https://example.com/a/>⟩ را.⟧',
  )
  expect(markdown('نشانی: https://example.com/docs.')).toBe(
    '⟦نشانی: ⟨<https://example.com/docs>⟩.⟧',
  )
  expect(markdown('خودکار <https://example.com> هم')).toBe('⟦خودکار ⟨<https://example.com>⟩ هم⟧')
  expect(markdown('یک [پیوند][ref] اینجا\n\n[ref]: https://example.com "عنوان"')).toBe(
    '⟦یک [پیوند][ref] اینجا⟧\n\n[ref]: https://example.com "عنوان"',
  )
})

test('text drawn as typed is marked a whole line at a time', async () => {
  expect(plain('- مورد اول\n- مورد دوم با `کد`')).toBe('⟦- مورد اول⟧\n⟦- مورد دوم با ⟨`کد`⟩⟧')
  expect(plain('ببین https://example.com/a/ را')).toBe('⟦ببین https://example.com/a/ را⟧')
  expect(plain('**مهم** است')).toBe('⟦**مهم** است⟧')
  expect(plain('این را اجرا کن:\n```\nls -la\n```\nFix the bug please.')).toBe(
    '⟦این را اجرا کن:⟧\n```\nls -la\n```\nFix the bug please.',
  )
})

test('an RTL table says start and end as the viewer reads them', async () => {
  // `:--` is the start of the cell and `--:` its end; a column with neither
  // gets the start; centered stays centered
  expect(markdown('| الف | ب | پ | ت |\n|:---|---:|:-:|---|\n| ۱ | ۲ | ۳ | ۴ |')).toBe(
    '| ⟦الف⟧ | ⟦ب⟧ | ⟦پ⟧ | ⟦ت⟧ |\n|---:|:---|:-:|---:|\n| ⟦۱⟧ | ⟦۲⟧ | ⟦۳⟧ | ⟦۴⟧ |',
  )
  // An LTR table is left as written
  expect(markdown('| Name | Value |\n|:---|---:|\n| سلام | hello |')).toBe(
    '| Name | Value |\n|:---|---:|\n| ▸سلام | hello |',
  )
})

test('an LTR block stays LTR where a line of it opens with an RTL letter', async () => {
  // The rule reads past the code span; a surface going by the first strong
  // character would not
  expect(markdown('`سلام` means hello.')).toBe('▸`سلام` means hello.')
  expect(markdown('- Install it\n- سلام means hello\n- Done')).toBe(
    '- Install it\n- ▸سلام means hello\n- Done',
  )
  expect(markdown('**`سلام`** means hello.')).toBe('**▸`سلام`** means hello.')
  expect(plain('`سلام` means hello.')).toBe('▸`سلام` means hello.')
})

test('an LTR line that opens LTR already is left as it is', async () => {
  const quoted = 'The word سلام means hello.\n\n- one\n- two (دو) items'

  expect(annotate(quoted, 'markdown')).toBe(quoted)
  expect(annotate(quoted, 'plain')).toBe(quoted)
})
