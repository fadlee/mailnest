<p align="center">
  <img src="static/favicon.svg" width="80" height="80" alt="MailNest Logo" />
</p>

<h1 align="center">MailNest</h1>

<p align="center">
  <strong>Where your emails come home.</strong>
</p>

<p align="center">
  A free, self-hosted email inbox powered entirely by Cloudflare.<br/>
  Receive emails on your own domain. No servers. No monthly fees. One command to deploy.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white" alt="Cloudflare Workers" />
  <img src="https://img.shields.io/badge/SvelteKit-5-FF3E00?logo=svelte&logoColor=white" alt="SvelteKit" />
  <img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/D1-SQLite-003B57?logo=sqlite&logoColor=white" alt="D1 SQLite" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

---

## What is MailNest?

**MailNest** is a complete email inbox that runs on Cloudflare's free tier. It lets you receive emails on your own domain (like `you@yourdomain.com`) and read them through a modern web dashboard -- similar to Gmail, but fully under your control.

Unlike traditional email hosting that costs $5-15/month per mailbox, MailNest uses Cloudflare's free infrastructure:

- **Email Routing** catches incoming emails
- **Workers** processes and serves the dashboard
- **D1** stores your emails (5GB free)
- **R2** stores attachments (10GB free, optional)

Everything deploys as a **single Cloudflare Worker**. No Docker, no VPS, no maintenance.

### Who is this for?

- Developers who want a custom domain email without paying for Google Workspace or Fastmail
- Side projects that need a receive-only inbox (contact forms, notifications, newsletters)
- Anyone who wants full control over their email data
- Privacy-conscious users who don't want their emails on Big Tech servers

### What can it do?

| Feature                       |                                                   |
| ----------------------------- | ------------------------------------------------- |
| Receive emails on your domain | `anything@yourdomain.com`                         |
| Multiple addresses            | `admin@`, `info@`, `newsletter@`, unlimited       |
| Gmail-like dashboard          | 3-column layout, responsive, dark/light mode      |
| Multi-select + bulk actions   | Checkboxes, select all, bulk archive/trash/delete |
| Right-click context menu      | Quick actions on any email                        |
| Search                        | Full-text search across all emails                |
| Star, archive, trash          | Organize emails like you're used to               |
| Email routing rules           | Forward, reject, or drop emails by pattern        |
| Password protected            | Secure login with secret key for password reset   |
| Auto-refresh                  | New emails appear automatically (30s polling)     |
| Attachment support            | View metadata, download via R2 (optional)         |
| HTML email rendering          | Sanitized with DOMPurify (XSS-safe)               |

### What can't it do?

- **Send emails** -- This is receive-only. Cloudflare Email Routing doesn't support outbound email.
- **IMAP/POP3** -- No email client support. Dashboard only.
- **Spam filtering** -- Cloudflare does basic filtering at the infrastructure level, but there's no SpamAssassin-style classification.

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime installed
- A [Cloudflare](https://cloudflare.com/) account (free)
- A domain added to Cloudflare with Email Routing available

### Enable Email Routing

Before installing, make sure Email Routing is enabled for your domain:

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to **Compute (Workers)** > **Email Service** > **Email Routing**
3. Click **Onboarding domain**
4. Select the domain you want to use
5. Click **Done**

### Install

```bash
git clone https://github.com/arosyihuddin/mailnest.git
cd mailnest
./install.sh
```

That's it. The script handles everything:

```
[1/13]  Check dependencies (bun, curl)
[2/13]  Install packages
[3/13]  Set up wrangler.toml from template
[4/13]  Prompt: domain, subdomain, secret key, admin password
[5/13]  Authenticate with Cloudflare
[6/13]  Create D1 database
[7/13]  Update configuration
[8/13]  Run database migration
[9/13]  Set admin credentials
[10/13] Build (SvelteKit + email handler injection)
[11/13] Deploy to Cloudflare Workers
[12/13] Configure catch-all email routing
[13/13] Done!
```

After install:

1. Open `https://mail.yourdomain.com`
2. Log in with your admin password
3. Go to **Settings** > **Email Addresses** > **Add Address**
4. Enter a username (e.g. `hello`) -- becomes `hello@yourdomain.com`
5. Send a test email to that address!

---

## How It Works

```
                    ┌──────────────────────────────────┐
                    │     Single Cloudflare Worker      │
                    │          "mailnest"               │
                    │                                   │
  someone@gmail     │  email() handler                  │
  sends email to    │  ├─ Resolve recipient from D1     │
  you@domain.com ──>│  ├─ Unknown? Reject               │
                    │  └─ Known? Parse & store in D1    │
                    │                                   │
  You open          │  fetch() handler                  │
  mail.domain.com ─>│  ├─ SvelteKit dashboard           │
  in browser        │  ├─ API endpoints                 │
                    │  └─ Static assets                 │
                    └──────────────────────────────────┘
                                    │
                                    ▼
                             Cloudflare D1
                           (your emails)
```

A single Worker handles both:

- **Inbound emails** via Cloudflare Email Routing (catch-all rule)
- **Web dashboard** via HTTP (SvelteKit app)

Email addresses are managed in the D1 database. When an email arrives, the Worker checks if the recipient exists. If yes, the email is parsed and stored. If no, it's rejected. No Cloudflare API calls needed -- adding a new address is just a database insert from the dashboard.

---

## Managing Your Inbox

### Adding email addresses

Settings > Email Addresses > Add Address > type `info` > creates `info@yourdomain.com`

### Switching between addresses

Click the address at the bottom of the sidebar to switch. Select **All Inboxes** to see everything.

### Keyboard & mouse shortcuts

| Action        | How                                  |
| ------------- | ------------------------------------ |
| Select email  | Click on it                          |
| Multi-select  | Click checkboxes                     |
| Select all    | Checkbox in list header              |
| Quick actions | Right-click on any email             |
| Search        | Type in the search bar, `X` to clear |
| Star          | Click the star icon                  |

### Folder actions

| Folder      | Available actions                      |
| ----------- | -------------------------------------- |
| **Inbox**   | Archive, Trash, Star, Mark Read/Unread |
| **Starred** | Archive, Trash, Star, Mark Read/Unread |
| **Archive** | Move to Inbox, Trash                   |
| **Trash**   | Restore to Inbox, Delete Permanently   |

---

## Password & Security

### Login

Use the admin password set during `./install.sh`.

### Forgot password?

**Option A** -- Have your secret key:

Click **Forgot password?** on the login page > enter secret key + new password.

**Option B** -- Lost everything:

```bash
./reset-password.sh
```

### How auth works

- Passwords are SHA-256 hashed and stored in D1
- Sessions are cookie-based with 7-day expiry
- HTML emails are sanitized with DOMPurify to prevent XSS
- The internal email endpoint is protected by a random secret

## Telegram Forwarding

MailNest can forward every incoming email to a Telegram chat after storing it in the inbox.

1. Create a Telegram bot with `@BotFather`.
2. Configure an encryption key as a Worker secret:

   ```bash
   bunx wrangler secret put ENCRYPTION_KEY
   ```

3. Deploy MailNest, then open Settings -> Telegram Forwarding.
4. Enter the bot token and default chat ID.
5. Send a test message from the Settings page.

The bot token is encrypted before it is stored in the D1 `settings` table. The raw token is never returned to the browser.

Telegram limits one message to about 4096 characters. MailNest forwards the full email body by splitting long emails across multiple Telegram messages.

---

## Re-deploy & Update

After making code changes:

```bash
./install.sh
# Detects existing config:
#   "Re-deploy with current config? (Y/n)" --> Y
# Skips prompts, builds, and deploys.
```

Or manually:

```bash
bun run build && bunx wrangler deploy
```

---

## Uninstall

```bash
./uninstall.sh
```

Removes: Worker, D1 database (all emails), catch-all rule, custom domain, local config.

Run `./install.sh` to start fresh.

---

## Optional: R2 for Attachments

By default, attachment metadata is stored but files aren't downloadable. To enable attachment downloads:

```bash
# 1. Create R2 bucket
bunx wrangler r2 bucket create mailnest-attachments

# 2. Uncomment in wrangler.toml:
[[r2_buckets]]
binding = "R2"
bucket_name = "mailnest-attachments"

# 3. Re-deploy
bun run build && bunx wrangler deploy
```

R2 free tier: 10GB storage, 10M reads/month.

---

## Local Development

```bash
# First time: set up local D1 database
bun run dev:setup

# Set or reset the local admin password
bun run dev:password admin123

# Start dev server
bun run dev
```

Open `http://localhost:5173` and log in with the password you set above.
Run `bun run dev:password` without an argument if you prefer to enter the password securely.

---

## Tech Stack

| Layer             | Technology                     |
| ----------------- | ------------------------------ |
| Framework         | SvelteKit 2 + Svelte 5 (runes) |
| Styling           | Tailwind CSS v4                |
| UI patterns       | shadcn-svelte                  |
| Icons             | Lucide Svelte                  |
| Database          | Cloudflare D1 + Drizzle ORM    |
| Storage           | Cloudflare R2 (optional)       |
| Email parsing     | postal-mime                    |
| HTML sanitization | DOMPurify                      |
| Deploy target     | Cloudflare Workers             |
| Package manager   | Bun                            |

---

## Project Structure

```
mailnest/
├── install.sh                  # One-click installer
├── uninstall.sh                # Remove all resources
├── reset-password.sh           # CLI password reset
├── wrangler.toml.example       # Config template (wrangler.toml is gitignored)
├── scripts/
│   └── postbuild-email-handler.mjs   # Injects email() into compiled Worker
├── drizzle/migrations/
│   └── 0000_init.sql           # Database schema
├── src/
│   ├── hooks.server.ts         # Auth middleware
│   ├── lib/
│   │   ├── api.ts              # Frontend API client
│   │   ├── types.ts            # TypeScript types
│   │   ├── stores/             # Svelte 5 rune stores (email, theme)
│   │   ├── server/             # Auth helpers + Drizzle schema
│   │   └── components/
│   │       ├── layout/         # Sidebar, Header
│   │       └── email/          # EmailList, EmailDetail, ContextMenu
│   └── routes/
│       ├── +page.svelte        # Dashboard
│       ├── login/              # Login + password reset
│       ├── settings/           # Email addresses, routing rules, theme
│       └── api/                # REST API endpoints
└── static/favicon.svg
```

---

## API Reference

| Method         | Endpoint                                    | Description                 |
| -------------- | ------------------------------------------- | --------------------------- |
| `POST`         | `/api/auth`                                 | Login                       |
| `PUT`          | `/api/auth`                                 | Reset password (secret key) |
| `DELETE`       | `/api/auth`                                 | Logout                      |
| `GET`          | `/api/auth`                                 | Check session               |
| `GET`          | `/api/emails?folder=inbox&search=&address=` | List emails                 |
| `PATCH`        | `/api/emails/:id`                           | Update (read, star, folder) |
| `DELETE`       | `/api/emails/:id`                           | Permanent delete            |
| `PATCH`        | `/api/emails/bulk`                          | Bulk update                 |
| `DELETE`       | `/api/emails/bulk`                          | Bulk delete                 |
| `GET`          | `/api/emails/counts?address=`               | Unread counts               |
| `GET/POST`     | `/api/addresses`                            | List / create addresses     |
| `PATCH/DELETE` | `/api/addresses/:id`                        | Update / delete address     |
| `GET`          | `/api/attachments/:id`                      | Download attachment         |
| `GET/POST`     | `/api/routing-rules`                        | List / create rules         |
| `PATCH/DELETE` | `/api/routing-rules/:id`                    | Update / delete rule        |

---

## Cloudflare Free Tier

MailNest fits comfortably within Cloudflare's free tier:

| Resource         | Free Limit            | Typical Usage                      |
| ---------------- | --------------------- | ---------------------------------- |
| Workers requests | 100K/day              | Dashboard views + email processing |
| D1 reads         | 5M/day                | Email queries                      |
| D1 writes        | 100K/day              | Storing incoming emails            |
| D1 storage       | 5 GB                  | ~50K emails with full HTML         |
| R2 storage       | 10 GB                 | Attachments (optional)             |
| R2 reads         | 10M/month             | Attachment downloads               |
| Email Routing    | Unlimited (catch-all) | All inbound emails                 |

---

## License

MIT

---

<p align="center">
  Built with Cloudflare Workers, SvelteKit, and Tailwind CSS.<br/>
  <strong>MailNest</strong> -- Where your emails come home.
</p>
