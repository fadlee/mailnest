#!/usr/bin/env bash
set -uo pipefail

# ============================================================
# MailNest - Reset Admin Password (CLI)
# Use this if you forgot both your password AND secret key.
# Requires wrangler CLI access (trusted environment).
# ============================================================

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BOLD}"
echo "  MailNest - Reset Admin Password"
echo -e "${NC}"

read -rp "  Enter new admin username: " NEW_USERNAME
if [[ -z "$NEW_USERNAME" ]]; then
    echo -e "  ${RED}✗${NC} Username is required."
    exit 1
fi

read -srp "  Enter new admin password: " NEW_PASSWORD
echo ""
if [[ -z "$NEW_PASSWORD" ]]; then
    echo -e "  ${RED}✗${NC} Password is required."
    exit 1
fi

read -srp "  Confirm new password: " CONFIRM_PASSWORD
echo ""
if [[ "$NEW_PASSWORD" != "$CONFIRM_PASSWORD" ]]; then
    echo -e "  ${RED}✗${NC} Passwords do not match."
    exit 1
fi

PASSWORD_HASH=$(printf '%s' "$NEW_PASSWORD" | sha256sum | cut -d' ' -f1)

echo ""
echo -e "  ${CYAN}→${NC} Updating credentials in D1..."

bunx wrangler d1 execute mailnest-db --remote --yes --command \
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('admin_username', '${NEW_USERNAME}', datetime('now'))" 2>&1 | tail -1
bunx wrangler d1 execute mailnest-db --remote --yes --command \
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('admin_password_hash', '${PASSWORD_HASH}', datetime('now'))" 2>&1 | tail -1

echo -e "  ${CYAN}→${NC} Clearing all active sessions..."

bunx wrangler d1 execute mailnest-db --remote --yes --command \
    "DELETE FROM settings WHERE key LIKE 'session_%'" 2>&1 | tail -1

echo ""
echo -e "  ${GREEN}✓${NC} Credentials updated successfully."
echo -e "  You can now log in with your new username and password."
echo ""
