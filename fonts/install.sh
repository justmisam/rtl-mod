#!/bin/bash
# Draws Persian and Arabic text in Vazirmatn in the Claude desktop app on macOS:
# downloads Vazirmatn, makes an Arabic-script-only copy of it under the family
# name "Segoe UI" and puts that copy in ~/Library/Fonts. The why is in README.md
# beside this file.
set -euo pipefail

VAZIRMATN=https://raw.githubusercontent.com/rastikerdar/vazirmatn/v33.003/misc/UI-Non-Latin/fonts/ttf
MAKER=https://raw.githubusercontent.com/justmisam/rtl-mod/main/fonts/arabic_alias_font.py

if [ "$(uname)" != Darwin ]; then
  echo "This is for macOS only: Windows has a real Segoe UI." >&2
  exit 1
fi

if ! command -v python3 >/dev/null; then
  echo "python3 is needed and was not found." >&2
  exit 1
fi

work=$(mktemp -d)

# The maker beside this file when run from a clone, the published one otherwise
self=${BASH_SOURCE[0]:-}
if [ -n "$self" ] && [ -f "$(dirname "$self")/arabic_alias_font.py" ]; then
  cp "$(dirname "$self")/arabic_alias_font.py" "$work/"
else
  curl -fsSL -o "$work/arabic_alias_font.py" "$MAKER"
fi

cd "$work"

for weight in Regular Bold; do
  curl -fsSL -o "Vazirmatn-UI-NL-$weight.ttf" "$VAZIRMATN/Vazirmatn-UI-NL-$weight.ttf"
  python3 arabic_alias_font.py "Vazirmatn-UI-NL-$weight.ttf" "SegoeUI-VazirmatnAlias-$weight.ttf" \
    "Segoe UI" "$weight" "Vazirmatn UI NL Alias $weight" "VazirmatnUINLAlias-$weight"
done

mkdir -p ~/Library/Fonts
cp SegoeUI-VazirmatnAlias-*.ttf ~/Library/Fonts/

echo
echo "Installed in ~/Library/Fonts."
echo "Quit the Claude app and open it again. If Persian is still drawn in the old"
echo "font, log out of your macOS account and log back in."
