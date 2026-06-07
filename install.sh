#!/usr/bin/env bash
set -uo pipefail

# ============================================================
# MailNest - One-Click Installer
# Cloudflare-powered email inbox dashboard (receive-only)
# Single Worker: dashboard + email handler in one deployment
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

sed_inplace() {
    local expression="$1"
    local file="$2"

    if sed --version >/dev/null 2>&1; then
        sed -i "$expression" "$file"
    else
        sed -i '' "$expression" "$file"
    fi
}

TOTAL_STEPS=13

echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║         MailNest Installer            ║"
echo "  ║  Where your emails come home          ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

# ============================================================
# Step 1: Check dependencies
# ============================================================
print_step 1 "Checking dependencies..."

if ! command -v bun &> /dev/null; then
    print_err "bun is not installed."
    echo "    Install bun: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
print_ok "bun $(bun --version)"

if ! command -v curl &> /dev/null; then
    print_err "curl is not installed."
    exit 1
fi
print_ok "curl found"

# ============================================================
# Step 2: Install packages
# ============================================================
print_step 2 "Installing packages..."

bun install --silent 2>/dev/null || bun install
print_ok "Packages installed"

# ============================================================
# Step 3: Setup wrangler.toml
# ============================================================
print_step 3 "Setting up configuration..."

EXISTING_CONFIG=false
EXISTING_DOMAIN=""
EXISTING_DASHBOARD=""
EXISTING_DB_ID=""
EXISTING_SECRET=""

if [[ -f "wrangler.toml" ]]; then
    # Read existing values
    EXISTING_DOMAIN=$(sed -nE 's/.*MAIL_DOMAIN[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' wrangler.toml 2>/dev/null || true)
    EXISTING_DASHBOARD=$(sed -nE 's/.*pattern[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' wrangler.toml 2>/dev/null || true)
    EXISTING_DB_ID=$(sed -nE 's/.*database_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' wrangler.toml 2>/dev/null || true)
    EXISTING_SECRET=$(sed -nE 's/.*INTERNAL_SECRET[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' wrangler.toml 2>/dev/null || true)

    # Check if config is valid (not placeholder)
    if [[ -n "$EXISTING_DOMAIN" && "$EXISTING_DOMAIN" != "example.com" && -n "$EXISTING_DB_ID" && "$EXISTING_DB_ID" != "YOUR_D1_DATABASE_ID" ]]; then
        EXISTING_CONFIG=true
    fi
fi

if [[ "$EXISTING_CONFIG" == false && ! -f "wrangler.toml" ]]; then
    if [[ -f "wrangler.toml.example" ]]; then
        cp wrangler.toml.example wrangler.toml
        print_ok "Created wrangler.toml from template"
    else
        print_err "wrangler.toml.example not found."
        exit 1
    fi
fi

# ============================================================
# Step 4: Configuration
# ============================================================
print_step 4 "Configuration..."

REDEPLOY=false

if [[ "$EXISTING_CONFIG" == true ]]; then
    echo ""
    echo -e "  ${BOLD}Existing configuration found:${NC}"
    echo -e "    Domain:    ${CYAN}${EXISTING_DOMAIN}${NC}"
    echo -e "    Dashboard: ${CYAN}${EXISTING_DASHBOARD}${NC}"
    echo -e "    Database:  ${CYAN}${EXISTING_DB_ID}${NC}"
    echo ""
    read -rp "  Re-deploy with current config? (Y/n): " REDEPLOY_ANSWER
    REDEPLOY_ANSWER="${REDEPLOY_ANSWER:-Y}"

    if [[ "${REDEPLOY_ANSWER,,}" == "y" ]]; then
        REDEPLOY=true
        MAIL_DOMAIN="$EXISTING_DOMAIN"
        DASHBOARD_DOMAIN="$EXISTING_DASHBOARD"
        DB_ID="$EXISTING_DB_ID"
        print_ok "Using existing configuration"
    fi
fi

if [[ "$REDEPLOY" == false ]]; then
    echo ""
    read -rp "  Enter your email domain (e.g. example.com): " MAIL_DOMAIN
    if [[ -z "$MAIL_DOMAIN" ]]; then
        print_err "Domain is required."
        exit 1
    fi
    print_ok "Email domain: ${MAIL_DOMAIN}"

    DEFAULT_SUBDOMAIN="mail.${MAIL_DOMAIN}"
    read -rp "  Dashboard subdomain [${DEFAULT_SUBDOMAIN}]: " DASHBOARD_DOMAIN
    DASHBOARD_DOMAIN="${DASHBOARD_DOMAIN:-$DEFAULT_SUBDOMAIN}"
    print_ok "Dashboard domain: ${DASHBOARD_DOMAIN}"

    echo ""
    echo -e "  ${BOLD}Admin Credentials${NC}"
    echo -e "  The secret key is used to reset your password if forgotten."
    echo -e "  The username and password are used to log in to the dashboard."
    echo ""

    read -rp "  Enter admin username: " ADMIN_USERNAME
    if [[ -z "$ADMIN_USERNAME" ]]; then
        print_err "Admin username is required."
        exit 1
    fi

    read -rp "  Enter a secret key (for password reset): " SETUP_SECRET
    if [[ -z "$SETUP_SECRET" ]]; then
        print_err "Secret key is required."
        exit 1
    fi

    read -srp "  Enter admin password: " ADMIN_PASSWORD
    echo ""
    if [[ -z "$ADMIN_PASSWORD" ]]; then
        print_err "Password is required."
        exit 1
    fi

    read -srp "  Confirm admin password: " ADMIN_PASSWORD_CONFIRM
    echo ""
    if [[ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]]; then
        print_err "Passwords do not match."
        exit 1
    fi
    print_ok "Credentials configured"
fi

# ============================================================
# Step 5: Authenticate with Cloudflare
# ============================================================
print_step 5 "Authenticating with Cloudflare..."

print_info "Checking login status..."
WHOAMI_OUTPUT=$(bunx wrangler whoami 2>&1 || true)

if echo "$WHOAMI_OUTPUT" | grep -q "not authenticated" || ! echo "$WHOAMI_OUTPUT" | grep -q "You are logged in"; then
    print_info "Not logged in. Opening browser for Cloudflare login..."
    bunx wrangler login
    WHOAMI_OUTPUT=$(bunx wrangler whoami 2>&1 || true)
fi
print_ok "Logged in to Cloudflare"

ACCOUNT_ID=$(echo "$WHOAMI_OUTPUT" | grep -Eo '[a-f0-9]{32}' | head -1)
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
        CF_API_TOKEN=$(sed -nE 's/.*oauth_token[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' "$CONFIG_PATH" 2>/dev/null || true)
        if [[ -n "$CF_API_TOKEN" ]]; then break; fi
    fi
done

if [[ -z "$CF_API_TOKEN" ]]; then
    print_warn "Could not read API token from wrangler config."
    read -rp "  Enter your Cloudflare API Token manually: " CF_API_TOKEN
    if [[ -z "$CF_API_TOKEN" ]]; then
        print_err "API token is required."
        exit 1
    fi
fi
print_ok "API token acquired"

print_info "Looking up Zone ID for ${MAIL_DOMAIN}..."
ZONE_RESPONSE=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=${MAIL_DOMAIN}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json")
ZONE_ID=$(echo "$ZONE_RESPONSE" | sed -nE 's/.*"id"[[:space:]]*:[[:space:]]*"([a-f0-9]+)".*/\1/p' | head -1)

if [[ -z "$ZONE_ID" ]]; then
    print_err "Could not find Zone ID for ${MAIL_DOMAIN}."
    print_err "Make sure the domain is added to your Cloudflare account."
    exit 1
fi
print_ok "Zone ID: ${ZONE_ID}"

# ============================================================
# Step 6: Create/find D1 Database
# ============================================================
print_step 6 "Setting up D1 database..."

if [[ "$REDEPLOY" == true && -n "$DB_ID" ]]; then
    print_ok "Using existing database: ${DB_ID}"
else
    EXISTING_DB=$(bunx wrangler d1 list 2>&1 | grep "mailnest-db" || true)
    if [[ -n "$EXISTING_DB" ]]; then
        print_warn "Database 'mailnest-db' already exists."
        DB_ID=$(echo "$EXISTING_DB" | grep -Eo '[a-f0-9-]{36}' | head -1)
    else
        D1_OUTPUT=$(bunx wrangler d1 create mailnest-db 2>&1)
        DB_ID=$(echo "$D1_OUTPUT" | sed -nE 's/.*database_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' || echo "$D1_OUTPUT" | grep -Eo '[a-f0-9-]{36}' | head -1)
    fi

    if [[ -z "$DB_ID" ]]; then
        print_err "Could not create or find D1 database."
        exit 1
    fi
    print_ok "Database ID: ${DB_ID}"
fi

# ============================================================
# Step 7: Update wrangler.toml
# ============================================================
print_step 7 "Updating wrangler.toml..."

if [[ "$REDEPLOY" == false ]]; then
    # Fresh install: copy from example if needed and update values
    if [[ ! -f "wrangler.toml" && -f "wrangler.toml.example" ]]; then
        cp wrangler.toml.example wrangler.toml
    fi

    INTERNAL_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')

    sed_inplace "s|MAIL_DOMAIN = \"example.com\"|MAIL_DOMAIN = \"${MAIL_DOMAIN}\"|g" wrangler.toml
    sed_inplace "s|INTERNAL_SECRET = \"GENERATE_ME\"|INTERNAL_SECRET = \"${INTERNAL_SECRET}\"|g" wrangler.toml
    sed_inplace "s|database_id = \"YOUR_D1_DATABASE_ID\"|database_id = \"${DB_ID}\"|g" wrangler.toml
    sed_inplace "s|pattern = \"DASHBOARD_DOMAIN\"|pattern = \"${DASHBOARD_DOMAIN}\"|g" wrangler.toml
    print_ok "wrangler.toml configured"
else
    print_ok "wrangler.toml unchanged (re-deploy)"
fi

# ============================================================
# Step 8: Run database migration
# ============================================================
print_step 8 "Running database migration..."

bunx wrangler d1 execute mailnest-db --remote --file=./drizzle/migrations/0000_init.sql --yes 2>&1 | tail -5
print_ok "Database tables ready"

# ============================================================
# Step 9: Set admin credentials
# ============================================================
print_step 9 "Setting admin credentials..."

if [[ "$REDEPLOY" == true ]]; then
    print_ok "Skipped (re-deploy, credentials unchanged)"
else
    SECRET_HASH=$(printf '%s' "$SETUP_SECRET" | sha256sum | cut -d' ' -f1)
    PASSWORD_HASH=$(printf '%s' "$ADMIN_PASSWORD" | sha256sum | cut -d' ' -f1)

    bunx wrangler d1 execute mailnest-db --remote --yes --command \
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('setup_secret_hash', '${SECRET_HASH}', datetime('now'))" 2>&1 | tail -1
    bunx wrangler d1 execute mailnest-db --remote --yes --command \
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('admin_username', '${ADMIN_USERNAME}', datetime('now'))" 2>&1 | tail -1
    bunx wrangler d1 execute mailnest-db --remote --yes --command \
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('admin_password_hash', '${PASSWORD_HASH}', datetime('now'))" 2>&1 | tail -1

    print_ok "Secret key, admin username, and admin password configured"
fi

# ============================================================
# Step 10: Build project
# ============================================================
print_step 10 "Building project..."

bun run build 2>&1 | tail -5
print_ok "Build complete"

# ============================================================
# Step 11: Deploy
# ============================================================
print_step 11 "Deploying to Cloudflare..."

print_info "Deploying Worker (dashboard + email handler)..."
DEPLOY_OUTPUT=$(bunx wrangler deploy 2>&1)
echo "$DEPLOY_OUTPUT" | tail -5
print_ok "Worker deployed"

# ============================================================
# Step 12: Setup catch-all email routing
# ============================================================
print_step 12 "Configuring email routing..."

print_info "Enabling Email Routing for ${MAIL_DOMAIN}..."
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/email/routing/enable" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" > /dev/null 2>&1 || true
print_ok "Email Routing enabled"

print_info "Setting catch-all rule → mailnest..."
CATCHALL_RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/email/routing/rules/catch_all" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
        \"actions\": [{\"type\": \"worker\", \"value\": [\"mailnest\"]}],
        \"matchers\": [{\"type\": \"all\"}],
        \"enabled\": true,
        \"name\": \"MailNest catch-all\"
    }")
if echo "$CATCHALL_RESPONSE" | grep -Eq '"success"[[:space:]]*:[[:space:]]*true'; then
    print_ok "Catch-all: *@${MAIL_DOMAIN} → mailnest"
else
    print_warn "Could not set catch-all. Set manually: Cloudflare Dashboard → Email → Email Routing → Catch-all → Worker → mailnest"
fi

# ============================================================
# Step 13: Summary
# ============================================================
print_step 13 "Done!"

echo ""
echo -e "${GREEN}${BOLD}  ╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}  ║           MailNest Setup Complete!               ║${NC}"
echo -e "${GREEN}${BOLD}  ╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Dashboard:${NC}"
echo -e "    ${CYAN}https://${DASHBOARD_DOMAIN}${NC}"
echo ""
echo -e "  ${BOLD}Email Domain:${NC}"
echo -e "    ${CYAN}*@${MAIL_DOMAIN}${NC} → mailnest worker"
echo ""
if [[ "$REDEPLOY" == false ]]; then
echo -e "  ${BOLD}Login:${NC}"
echo -e "    Username: ${CYAN}${ADMIN_USERNAME}${NC}"
echo -e "    Use the admin password you just set to log in."
echo ""
fi
echo -e "  ${BOLD}Next Steps:${NC}"
echo -e "    1. Open ${CYAN}https://${DASHBOARD_DOMAIN}${NC} (may take a few minutes for DNS)"
echo -e "    2. Log in with your admin password"
echo -e "    3. Go to ${BOLD}Settings${NC} → ${BOLD}Email Addresses${NC}"
echo -e "    4. Click ${BOLD}Add Address${NC} → enter a username (e.g. ${CYAN}admin${NC})"
echo -e "    5. This creates ${CYAN}admin@${MAIL_DOMAIN}${NC}"
echo -e "    6. Send a test email to that address!"
echo ""
echo -e "  ${BOLD}Useful Commands:${NC}"
echo -e "    ${CYAN}bun run dev${NC}              → Local development server"
echo -e "    ${CYAN}bun run build${NC}            → Production build"
echo -e "    ${CYAN}bunx wrangler deploy${NC}     → Re-deploy"
echo -e "    ${CYAN}./install.sh${NC}             → Re-deploy (with config detection)"
echo -e "    ${CYAN}./uninstall.sh${NC}           → Remove all resources"
echo -e "    ${CYAN}./reset-password.sh${NC}      → Reset admin password (CLI)"
echo ""
