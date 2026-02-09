#!/bin/bash

echo "Removing 'use client' directives from all .ts and .tsx files in app/"

# Find all .ts and .tsx files and remove 'use client' directives
find app -type f \( -name "*.tsx" -o -name "*.ts" \) | while read file; do
  # Remove 'use client'; (with single quotes)
  sed -i "/^'use client';$/d" "$file"
  # Remove "use client"; (with double quotes)
  sed -i '/^"use client";$/d' "$file"
  # Also remove if there's an empty line after
  sed -i '/^$/N;s/^\n$//' "$file"
done

echo "Done! 'use client' directives have been removed."
