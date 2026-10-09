# Vazirmatn for Persian text in the Claude desktop app

The steps to install it are in the [main README](../README.md#vazirmatn-font-macos-optional).
This page is the why and the fine print.

## Why it works

A mod cannot set a font, so this goes through the app's own font stack:

    "Anthropic Sans", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif

On a Mac the first family in it that has Arabic-script glyphs is Arial, so that is
what Persian is drawn in. "Segoe UI" comes before Arial and is not installed on
macOS. A font that answers to that family name and maps only Arabic-script
characters takes Persian over, and leaves Latin, digits and punctuation where
they were.

## The scripts

`install.sh` does the whole install: it downloads the two Vazirmatn UI-NL files,
runs the maker on them in a temporary folder and copies the result to
`~/Library/Fonts`.

`arabic_alias_font.py` is the maker. It makes such a font out of any static
TrueType font, has no dependencies and rewrites two tables only: `cmap` (the
Arabic blocks plus ZWNJ and ZWJ are kept) and `name`.

```bash
python3 arabic_alias_font.py <in.ttf> <out.ttf> <family> <style> <full name> <postscript name>
```

The family name of the result is the alias, "Segoe UI" here. Its full and
PostScript names are not ("Vazirmatn UI NL Alias ..."), so a page's
`local("Segoe UI")` does not match it and the page's own web font still loads.

The built files are for your own machine. Do not pass them on: they carry a
family name that is not yours to ship.

## Side effects

Any page or app whose font stack lists "Segoe UI" before a font with Arabic
glyphs (GitHub in Chrome, for one) shows Persian and Arabic in Vazirmatn. Latin
text is not affected anywhere.

Not affected in the app: code blocks (`"Anthropic Mono", ui-monospace, monospace`)
and the chat tab's serif replies. Neither stack has a name that can be taken.

If an app update changes the font stack, the name to take may change with it.

Windows has a real Segoe UI. Do not install this there.

## Undo

```bash
rm ~/Library/Fonts/SegoeUI-VazirmatnAlias-Regular.ttf ~/Library/Fonts/SegoeUI-VazirmatnAlias-Bold.ttf
```
