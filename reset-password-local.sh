#!/usr/bin/env bash
set -euo pipefail

# Reset the local D1 admin credentials used by `bun run dev`.
# Usage: ./reset-password-local.sh [new-username] [new-password]

USERNAME="${1:-}"
PASSWORD="${2:-}"

if [[ -z "$USERNAME" ]]; then
    read -rp "Enter new local admin username: " USERNAME
fi

if [[ -z "$PASSWORD" ]]; then
    read -srp "Enter new local admin password: " PASSWORD
    echo ""
fi

if [[ -z "$USERNAME" ]]; then
    echo "Username is required." >&2
    exit 1
fi

if [[ -z "$PASSWORD" ]]; then
    echo "Password is required." >&2
    exit 1
fi

if command -v shasum >/dev/null 2>&1; then
    PASSWORD_HASH=$(printf '%s' "$PASSWORD" | shasum -a 256 | cut -d' ' -f1)
elif command -v sha256sum >/dev/null 2>&1; then
    PASSWORD_HASH=$(printf '%s' "$PASSWORD" | sha256sum | cut -d' ' -f1)
else
    echo "Missing shasum or sha256sum." >&2
    exit 1
fi

echo "Applying local D1 schema..."
bunx wrangler d1 execute mailnest-db --local --file=./drizzle/migrations/0000_init.sql >/dev/null

echo "Updating local admin credentials..."
bunx wrangler d1 execute mailnest-db --local --command \
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('admin_username', '${USERNAME}', datetime('now'))" >/dev/null
bunx wrangler d1 execute mailnest-db --local --command \
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('admin_password_hash', '${PASSWORD_HASH}', datetime('now'))" >/dev/null

echo "Clearing local sessions..."
bunx wrangler d1 execute mailnest-db --local --command \
    "DELETE FROM settings WHERE key LIKE 'session_%'" >/dev/null

echo "Local admin credentials updated."
