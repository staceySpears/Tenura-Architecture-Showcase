#!/usr/bin/env bash
# Usage: ./scripts/new-adr.sh "your-decision-slug"
# Creates a new ADR from the template at showcase/architecture/YYYY-MM-DD-slug.md

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <decision-slug>"
  echo "Example: $0 switch-to-postgres"
  exit 1
fi

SLUG="$1"
DATE=$(date +%Y-%m-%d)
TEMPLATE="$(dirname "$0")/../architecture/ADR_TEMPLATE.md"
OUTPUT="$(dirname "$0")/../architecture/${DATE}-${SLUG}.md"

if [ ! -f "$TEMPLATE" ]; then
  echo "Template not found at $TEMPLATE"
  exit 1
fi

if [ -f "$OUTPUT" ]; then
  echo "File already exists: $OUTPUT"
  exit 1
fi

sed "s/YYYY-MM-DD/${DATE}/" "$TEMPLATE" > "$OUTPUT"

echo "Created: $OUTPUT"
echo "Open it, fill in Context / Decision / Consequences, then commit."
