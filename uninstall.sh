#!/usr/bin/env bash
set -uo pipefail

# ============================================================
# MailNest - Uninstaller
# Removes all Cloudflare resources created by install.sh
# ============================================================

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

print_step() { echo -e "\n${CYAN}${BOLD}[$1/$TOTAL_STEPS]${NC} ${BOLD}$2${NC}"; }
print_ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
print_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
print_err()  { echo -e "  ${RED}✗${NC} $1"; }
print_info() { echo -e "  ${CYAN}→${NC} $1"; }

TOTAL_STEPS=7

echo -e "${RED}${BOLD}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║       MailNest Uninstaller            ║"
echo "  ║  This will DELETE all resources        ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

echo -e "  ${RED}${BOLD}WARNING:${NC} This will permanently delete:"
echo "    - Cloudflare Worker (mailnest)"
echo "    - D1 Database (mailnest-db) and ALL emails"
echo "    - Catch-all email routing rule"
echo "    - Custom domain (auto-managed DNS)"
echo ""
read -rp "  Are you sure you want to continue? (y/N): " CONFIRM
if [[ "${CONFIRM,,}" != "y" ]]; then
    echo "  Cancelled."
    exit 0
fi

# ============================================================
# Step 1: Read config
# ============================================================
print_step 1 "Reading configuration..."

MAIL_DOMAIN=""
if [[ -f "wrangler.toml" ]]; then
    MAIL_DOMAIN=$(grep -oP 'MAIL_DOMAIN\s*=\s*"\K[^"]+' wrangler.toml 2>/dev/null || true)
fi

if [[ -z "$MAIL_DOMAIN" || "$MAIL_DOMAIN" == "example.com" ]]; then
    read -rp "  Enter your email domain (e.g. example.com): " MAIL_DOMAIN
    if [[ -z "$MAIL_DOMAIN" ]]; then
        print_err "Domain is required."
        exit 1
    fi
fi
print_ok "Domain: ${MAIL_DOMAIN}"

# ============================================================
# Step 2: Authenticate
# ============================================================
print_step 2 "Authenticating with Cloudflare..."

WHOAMI_OUTPUT=$(bunx wrangler whoami 2>&1 || true)

if ! echo "$WHOAMI_OUTPUT" | grep -q "You are logged in"; then
    print_info "Not logged in. Opening browser..."
    bunx wrangler login
    WHOAMI_OUTPUT=$(bunx wrangler whoami 2>&1 || true)
fi

ACCOUNT_ID=$(echo "$WHOAMI_OUTPUT" | grep -oP '[a-f0-9]{32}' | head -1)
if [[ -z "$ACCOUNT_ID" ]]; then
    print_err "Could not determine Account ID."
    exit 1
fi
print_ok "Account ID: ${ACCOUNT_ID}"

CF_API_TOKEN=""
for CONFIG_PATH in \
    "${HOME}/.config/.wrangler/config/default.toml" \
    "${HOME}/.wrangler/config/default.toml"; do
    if [[ -f "$CONFIG_PATH" ]]; then
        CF_API_TOKEN=$(grep -oP 'oauth_token\s*=\s*"\K[^"]+' "$CONFIG_PATH" 2>/dev/null || true)
        if [[ -n "$CF_API_TOKEN" ]]; then break; fi
    fi
done

if [[ -z "$CF_API_TOKEN" ]]; then
    read -rp "  Enter your Cloudflare API Token: " CF_API_TOKEN
fi
print_ok "API token acquired"

ZONE_RESPONSE=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=${MAIL_DOMAIN}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json")
ZONE_ID=$(echo "$ZONE_RESPONSE" | grep -oP '"id"\s*:\s*"\K[a-f0-9]+' | head -1 || true)

if [[ -n "$ZONE_ID" ]]; then
    print_ok "Zone ID: ${ZONE_ID}"
else
    print_warn "Could not find Zone ID. Skipping email routing cleanup."
fi

# ============================================================
# Step 3: Disable catch-all email routing
# ============================================================
print_step 3 "Disabling catch-all email routing..."

if [[ -n "$ZONE_ID" ]]; then
    CATCHALL_RESPONSE=$(curl -s -X PUT \
        "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/email/routing/rules/catch_all" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json" \
        -d '{
            "actions": [{"type": "drop"}],
            "matchers": [{"type": "all"}],
            "enabled": false,
            "name": "Catch-all (disabled)"
        }')
    if echo "$CATCHALL_RESPONSE" | grep -qP '"success"\s*:\s*true'; then
        print_ok "Catch-all rule disabled"
    else
        print_warn "Could not disable catch-all rule"
    fi
else
    print_warn "Skipped (no Zone ID)"
fi

# ============================================================
# Step 4: Delete Worker
# ============================================================
print_step 4 "Deleting Worker..."

WORKER_DELETE=$(echo "y" | bunx wrangler delete mailnest --force 2>&1 || true)
if echo "$WORKER_DELETE" | grep -qi "success\|deleted"; then
    print_ok "Worker 'mailnest' deleted"
else
    print_warn "Could not delete Worker (may not exist)"
fi

# ============================================================
# Step 5: Delete D1 Database
# ============================================================
print_step 5 "Deleting D1 database..."

D1_DELETE=$(bunx wrangler d1 delete mailnest-db -y 2>&1 || true)
if echo "$D1_DELETE" | grep -qi "success\|deleted\|Deleted"; then
    print_ok "D1 database 'mailnest-db' deleted"
else
    print_warn "Could not delete D1 database (may not exist)"
fi

# ============================================================
# Step 6: Reset config files
# ============================================================
print_step 6 "Resetting configuration..."

if [[ -f "wrangler.toml" ]]; then
    rm wrangler.toml
    print_ok "wrangler.toml removed (install.sh will recreate from wrangler.toml.example)"
else
    print_ok "wrangler.toml already absent"
fi

# ============================================================
# Step 7: Summary
# ============================================================
print_step 7 "Done!"

echo ""
echo -e "${GREEN}${BOLD}  ╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}  ║         MailNest Uninstall Complete!              ║${NC}"
echo -e "${GREEN}${BOLD}  ╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  All Cloudflare resources have been removed."
echo -e "  Config files have been reset to templates."
echo ""
echo -e "  To reinstall, run: ${CYAN}./install.sh${NC}"
echo ""
