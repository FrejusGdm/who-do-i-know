# WhoDoYouKnow

Find out who you actually know from your Gmail. Scans your email threads, identifies real contacts (not newsletters), enriches them with AI, and exports everything to a clean CSV.

<!-- TODO: Add screenshot -->
![Screenshot](public/screenshot.png)

<video src="https://github.com/FrejusGdm/who-do-i-know/raw/main/public/demo-whoYouKnow.mp4" controls width="100%"></video>

## Features

- **Gmail scan** — reads your email threads to find people you've actually communicated with
- **Mutual detection** — optionally filters to only people you've replied to (not just received from)
- **AI enrichment** — uses OpenRouter to categorize and summarize your relationships
- **CSV export** — download your network as a spreadsheet
- **Privacy-first** — emails are processed in-memory only, never stored. Data is deleted within 15 minutes of download
- **Filters** — date range, mutual-only toggle, domain blocklist, and more

## Tech Stack

- [Next.js 15](https://nextjs.org) + [React 19](https://react.dev) + [Tailwind CSS](https://tailwindcss.com)
- [Better-Auth](https://better-auth.com) (Google OAuth)
- [Drizzle ORM](https://orm.drizzle.team) + [Neon](https://neon.tech) (PostgreSQL)
- [Google APIs](https://developers.google.com/gmail/api) (Gmail + People)
- [OpenRouter](https://openrouter.ai) (AI inference)
- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (CSV storage)

## Docs

- Human guide: [`docs/HUMANS.md`](docs/HUMANS.md)
- Agent guide: [`docs/AGENTS.md`](docs/AGENTS.md)
- Product context: [`prd.md`](prd.md), [`design.md`](design.md)

---

## Self-Hosting Guide

This app uses Gmail's restricted OAuth scopes, which means Google requires an expensive security assessment for public apps. The easiest way to use this is to **run your own instance** — you set up your own Google Cloud project in "testing" mode, which requires no verification.

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [pnpm](https://pnpm.io)
- A [Neon](https://neon.tech) account (free tier works)
- A [Google Cloud](https://console.cloud.google.com) account (free)
- An [OpenRouter](https://openrouter.ai) API key
- A [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) token (for CSV storage)

### 1. Google Cloud Setup

This is the most important part. Follow these steps carefully.

#### Create a project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click the project dropdown (top-left) → **New Project**
3. Name it something like "WhoDoYouKnow" → **Create**
4. Make sure the new project is selected

#### Enable APIs

1. Go to **APIs & Services → Library**
2. Search for **Gmail API** → click it → **Enable**
3. Search for **People API** → click it → **Enable**

#### Configure OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** → **Create**
3. Fill in the required fields:
   - **App name:** WhoDoYouKnow
   - **User support email:** your email
   - **Developer contact email:** your email
4. Click **Save and Continue**
5. On the **Scopes** screen, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/contacts.readonly`
6. Click **Save and Continue**
7. On the **Test users** screen, click **Add Users** and add **your own Gmail address**
8. Click **Save and Continue**

> **Important:** Leave the app in "Testing" mode. Do NOT click "Publish App". In testing mode, only the test users you added can use the app — which is exactly what you want for self-hosting.

#### Create OAuth Client ID

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Select **Web application**
4. Set:
   - **Name:** WhoDoYouKnow Web
   - **Authorized JavaScript origins:** `http://localhost:3000`
   - **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback/google`
5. Click **Create**
6. Copy the **Client ID** and **Client Secret** — you'll need these next

#### About the "unverified app" warning

When you sign in for the first time, Google will show a warning: "Google hasn't verified this app." This is normal for testing mode. To proceed:

1. Click **Advanced**
2. Click **Go to WhoDoYouKnow (unsafe)**
3. Review the permissions and click **Allow**

This warning only appears because the app isn't verified — it doesn't mean anything is wrong.

### 2. Environment Setup

```bash
cp .env.example .env.local
```

Fill in your `.env.local`:

```bash
# Generate a random secret
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
BETTER_AUTH_URL=http://localhost:3000

# From Google Cloud Console (step above)
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here

# From https://openrouter.ai/keys
OPENROUTER_API_KEY=your-openrouter-key

# From Neon dashboard → Connection Details
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require

# From Vercel → Storage → Blob → Tokens
BLOB_READ_WRITE_TOKEN=your-blob-token

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Install & Run

```bash
pnpm install
pnpm db:push
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and click "Get My Network" to start.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | Random secret for session encryption. Generate with `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Yes | Your app URL (`http://localhost:3000` for local dev) |
| `GOOGLE_CLIENT_ID` | Yes | OAuth Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth Client Secret from Google Cloud Console |
| `OPENROUTER_API_KEY` | Yes | API key from [OpenRouter](https://openrouter.ai) |
| `DATABASE_URL` | Yes | PostgreSQL connection string ([Neon](https://neon.tech) recommended) |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob storage token |
| `NEXT_PUBLIC_APP_URL` | Yes | Public-facing app URL |
| `STRIPE_SECRET_KEY` | No | Stripe secret key (only if enabling payments) |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook secret |
| `STRIPE_PRICE_ID` | No | Stripe price ID |
| `RESEND_API_KEY` | No | [Resend](https://resend.com) API key for email notifications |
| `RESEND_FROM_EMAIL` | No | From address for emails (default: `noreply@whodoyouknow.work`) |

## Scripts

```bash
pnpm dev          # start dev server
pnpm build        # production build
pnpm start        # run production server
pnpm lint         # lint checks
pnpm db:push      # push schema to database
pnpm db:generate  # generate migrations
pnpm db:studio    # open Drizzle Studio
```

## Contributing

Contributions are welcome! Feel free to open issues or submit PRs.

## License

[MIT](LICENSE)
