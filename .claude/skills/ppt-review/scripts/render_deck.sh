#!/usr/bin/env bash
# render_deck.sh — convert a .pptx to per-slide JPG images for visual review.
#
# Usage:
#   ./render_deck.sh path/to/deck.pptx [output_dir]
#
# Output:
#   - <output_dir>/<deck_name>.pdf      (intermediate)
#   - <output_dir>/slide-01.jpg ...     (one JPG per slide)
#
# Requirements:
#   - LibreOffice (macOS: `brew install --cask libreoffice`,
#                  Windows: install from libreoffice.org,
#                  Linux: `apt install libreoffice`)
#   - poppler-utils for pdftoppm (`brew install poppler` on macOS,
#                                 `apt install poppler-utils` on Linux,
#                                 included with most Windows LibreOffice installs)
#
# On Windows / Git Bash:
#   LibreOffice CLI is usually at:
#     "C:\Program Files\LibreOffice\program\soffice.exe"
#   Set $SOFFICE if it lives elsewhere.

set -e

INPUT="${1:?usage: $0 <deck.pptx> [output_dir]}"
OUTDIR="${2:-$(dirname "$INPUT")/render}"
NAME="$(basename "$INPUT" .pptx)"

# Find LibreOffice
SOFFICE="${SOFFICE:-}"
if [ -z "$SOFFICE" ]; then
  if command -v soffice >/dev/null 2>&1; then
    SOFFICE="soffice"
  elif command -v libreoffice >/dev/null 2>&1; then
    SOFFICE="libreoffice"
  elif [ -x "/c/Program Files/LibreOffice/program/soffice.exe" ]; then
    SOFFICE="/c/Program Files/LibreOffice/program/soffice.exe"
  elif [ -x "/Applications/LibreOffice.app/Contents/MacOS/soffice" ]; then
    SOFFICE="/Applications/LibreOffice.app/Contents/MacOS/soffice"
  else
    echo "ERROR: LibreOffice not found. Install it or set \$SOFFICE." >&2
    exit 1
  fi
fi

mkdir -p "$OUTDIR"

echo "→ Converting $INPUT → PDF…"
"$SOFFICE" --headless --convert-to pdf --outdir "$OUTDIR" "$INPUT" > /dev/null

PDF="$OUTDIR/$NAME.pdf"
if [ ! -f "$PDF" ]; then
  echo "ERROR: PDF conversion failed. Expected $PDF" >&2
  exit 2
fi

echo "→ Splitting PDF → JPG (one per slide)…"
if command -v pdftoppm >/dev/null 2>&1; then
  pdftoppm -jpeg -r 150 "$PDF" "$OUTDIR/slide" -jpegopt quality=90
else
  echo "WARN: pdftoppm not found. PDF is at $PDF — open it manually." >&2
  exit 0
fi

# Normalise output to slide-NN.jpg (pdftoppm uses slide-1.jpg, slide-2.jpg by default)
cd "$OUTDIR"
for f in slide-*.jpg; do
  num=$(echo "$f" | sed -E 's/slide-([0-9]+)\.jpg/\1/')
  if [ -n "$num" ]; then
    new=$(printf "slide-%02d.jpg" "$num")
    [ "$f" != "$new" ] && mv "$f" "$new"
  fi
done

COUNT=$(ls slide-*.jpg 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "✓ Rendered $COUNT slide(s) to $OUTDIR/"
echo "  View slide N: $OUTDIR/slide-NN.jpg"
echo "  Full PDF:     $PDF"
