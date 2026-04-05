# WhoDoYouKnow — Design & Implementation Doc
> For the AI agent implementing this project. Read every section before writing code.

---

## 0. Agent Instructions

1. **Always check BetterAuth docs** at https://www.better-auth.com/docs before implementing any auth. Use official plugins — do not hand-roll sessions, tokens, or OAuth flows.
2. **Always check shadcn/ui docs** at https://ui.shadcn.com/docs before adding components. Use `npx shadcn-ui@latest add [component]`.
3. **Always check OpenRouter docs** at https://openrouter.ai/docs — use OpenAI SDK with `baseURL: "https://openrouter.ai/api/v1"`.
4. **Never store email bodies.** If you find yourself writing code that persists email content to a database or file, stop and refactor.
5. **Use Drizzle ORM** for all DB access. Schema is defined in `src/db/schema.ts`.
6. **TypeScript strict mode.** No `any` types.
7. **Handle errors gracefully** — every API call needs try/catch with meaningful error states shown to user.

---

## 1. Project Structure

```
whodoyouknow/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Landing page
│   │   ├── connect/page.tsx          # Post-OAuth, pre-filter
│   │   ├── filter/page.tsx           # Filter configuration
│   │   ├── checkout/page.tsx         # Stripe checkout (currently bypassed)
│   │   ├── processing/page.tsx       # Job progress screen
│   │   ├── download/[jobId]/page.tsx # Download screen
│   │   ├── privacy/page.tsx          # Privacy policy
│   │   ├── terms/page.tsx            # Terms of service
│   │   └── api/
│   │       ├── auth/[...betterauth]/ # BetterAuth handler
│   │       ├── prescan/route.ts      # Estimate contact count
│   │       ├── job/route.ts          # Create job directly (bypass checkout)
│   │       ├── checkout/route.ts     # Create Stripe session (inactive)
│   │       ├── webhook/stripe/route.ts
│   │       ├── process/route.ts      # Trigger pipeline
│   │       ├── progress/[jobId]/route.ts  # SSE stream
│   │       └── download/[jobId]/route.ts
│   ├── components/
│   │   ├── ui/                       # shadcn components
│   │   ├── landing/
│   │   │   ├── Hero.tsx
│   │   │   ├── HeroBackground.tsx    # Generative bg
│   │   │   ├── SampleCsv.tsx
│   │   │   └── TrustBadges.tsx
│   │   ├── filter/
│   │   │   ├── FilterPanel.tsx
│   │   │   └── ContactEstimate.tsx
│   │   └── processing/
│   │       ├── ProgressStages.tsx
│   │       └── DownloadCard.tsx
│   ├── lib/
│   │   ├── auth.ts                   # BetterAuth config
│   │   ├── gmail.ts                  # Gmail API helpers
│   │   ├── openrouter.ts             # LLM client
│   │   ├── pipeline.ts               # Core processing pipeline
│   │   ├── csv.ts                    # CSV builder
│   │   ├── stripe.ts                 # Stripe client
│   │   └── resend.ts                 # Email delivery
│   ├── db/
│   │   ├── index.ts                  # Drizzle client
│   │   └── schema.ts                 # Table definitions
│   └── types/
│       └── index.ts                  # Shared types
├── public/
│   └── bg.jpg                        # Generated hero background
├── .env.local                        # Never commit
└── package.json
```

---

## 2. Environment Variables

```bash
# Auth
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000

# Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# OpenRouter
OPENROUTER_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=                      # $9 one-time price

# Database
DATABASE_URL=                          # Neon Postgres

# Storage
BLOB_READ_WRITE_TOKEN=                 # Vercel Blob

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@whodoyouknow.work

# App
NEXT_PUBLIC_APP_URL=https://whodoyouknow.work
```

---

## 3. Auth Setup (BetterAuth)

BetterAuth is **self-hosted** — no external API key needed. It runs as part of the Next.js app.

### Files
- `src/lib/auth.ts` — Server-side BetterAuth instance (Google OAuth, Drizzle adapter, session config)
- `src/lib/auth-client.ts` — Client-side auth helpers (`signIn`, `signOut`, `useSession`) from `better-auth/react`
- `src/app/api/auth/[...all]/route.ts` — Catch-all API route that handles all auth endpoints

### Schema
BetterAuth requires 4 tables: `user`, `session`, `account`, `verification`. These are defined in `src/db/schema.ts` alongside app tables.

**To regenerate or update auth tables** (e.g., after adding a Better Auth plugin):
```bash
npx @better-auth/cli generate   # generates auth-schema.ts
# Merge the generated tables into src/db/schema.ts, then delete auth-schema.ts
pnpm db:push                    # push to Neon
```

### Adding Better Auth plugins
Plugins must be added to **both** files:
1. Server plugin in `src/lib/auth.ts` → `plugins: [nextCookies(), yourPlugin()]`
2. Client plugin in `src/lib/auth-client.ts` → `plugins: [yourClientPlugin()]`

### Key config
```ts
// src/lib/auth.ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { db } from "@/db"
import * as schema from "@/db/schema"

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }), // ← schema must be passed
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scope: [
        "openid", "email", "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/contacts.readonly",
      ],
      accessType: "offline",   // get refresh token
      prompt: "consent",       // force consent to get refresh token
    },
  },
  session: {
    expiresIn: 60 * 60 * 2,  // 2 hours — enough for one job
  },
  plugins: [nextCookies()],
})
```

---

## 4. Database Schema

All tables are defined in `src/db/schema.ts`. This includes both Better Auth tables and app tables.

**Auth tables** (managed by Better Auth — do not modify column names):
- `user` — id, name, email, emailVerified, image, timestamps
- `session` — id, token, expiresAt, userId, ipAddress, userAgent, timestamps
- `account` — id, accountId, providerId, userId, accessToken, refreshToken, scope, timestamps
- `verification` — id, identifier, value, expiresAt, timestamps

**App tables:**
- `jobs` — id (uuid), userEmail, status (pending|processing|complete|failed), filterConfig, contactCount, blobUrl, errorMessage, providerMode, stripeSessionId, timestamps

**Pushing schema changes:**
```bash
pnpm db:push          # pushes current schema to Neon
pnpm db:generate      # generates migration files
pnpm db:studio        # opens Drizzle Studio
```

---

## 5. Gmail Fetching (Optimized)

```ts
// src/lib/gmail.ts
import { google } from "googleapis"

export interface ThreadMeta {
  threadId: string
  senderEmail: string
  senderName: string
  subjectSnippet: string
  userReplied: boolean
  messageCount: number
  lastDate: string
}

export async function fetchMutualThreads(
  accessToken: string,
  filters: FilterConfig
): Promise<ThreadMeta[]> {
  const oauth2 = new google.auth.OAuth2()
  oauth2.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: "v1", auth: oauth2 })

  // Build query from user filters
  const excludeDomains = filters.blockedDomains
    .map(d => `-from:${d}`)
    .join(" ")
  
  const categoryExclusions = [
    filters.skipPromotions && "-category:promotions",
    filters.skipUpdates && "-category:updates",
    filters.skipSocial && "-category:social",
    filters.skipForums && "-category:forums",
  ].filter(Boolean).join(" ")

  const afterDate = filters.afterDate
    ? `after:${Math.floor(new Date(filters.afterDate).getTime() / 1000)}`
    : ""

  const q = [
    "in:anywhere",
    categoryExclusions,
    excludeDomains,
    afterDate,
    "-from:no-reply",
    "-from:noreply",
    "-from:donotreply",
    "-from:notifications@",
    "-from:mailer-daemon@",
  ].filter(Boolean).join(" ")

  // Fetch thread list (metadata only — fast)
  const threadList = await gmail.users.threads.list({
    userId: "me",
    q,
    maxResults: Math.min(filters.maxThreads ?? 500, 500),
  })

  const threads = threadList.data.threads ?? []
  const userEmail = (await gmail.users.getProfile({ userId: "me" })).data.emailAddress!

  // Fetch metadata for each thread (parallel, batched)
  const BATCH_SIZE = 20
  const results: ThreadMeta[] = []

  for (let i = 0; i < threads.length; i += BATCH_SIZE) {
    const batch = threads.slice(i, i + BATCH_SIZE)
    const metas = await Promise.all(
      batch.map(t =>
        gmail.users.threads.get({
          userId: "me",
          id: t.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        })
      )
    )

    for (const meta of metas) {
      const msgs = meta.data.messages ?? []
      const senders = new Set<string>()
      let userReplied = false
      let lastDate = ""
      let subjectSnippet = ""
      let senderEmail = ""
      let senderName = ""

      for (const msg of msgs) {
        const headers = msg.payload?.headers ?? []
        const from = headers.find(h => h.name === "From")?.value ?? ""
        const subject = headers.find(h => h.name === "Subject")?.value ?? ""
        const date = headers.find(h => h.name === "Date")?.value ?? ""

        if (from.includes(userEmail)) {
          userReplied = true
        } else {
          const parsed = parseEmailAddress(from)
          senderEmail = parsed.email
          senderName = parsed.name
          senders.add(parsed.email)
        }

        if (subject && !subjectSnippet) {
          subjectSnippet = subject.substring(0, 80)
        }
        if (date) lastDate = date
      }

      // Only mutual threads
      if (!userReplied || !senderEmail) continue
      
      // Apply min interaction threshold
      if (msgs.length < (filters.minInteractions ?? 2)) continue

      results.push({
        threadId: meta.data.id!,
        senderEmail,
        senderName,
        subjectSnippet,
        userReplied,
        messageCount: msgs.length,
        lastDate,
      })
    }
  }

  return results
}

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/)
  if (match) return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim() }
  return { name: raw, email: raw }
}
```

---

## 6. LLM Contact Extraction (OpenRouter)

```ts
// src/lib/openrouter.ts
import OpenAI from "openai"

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL,
    "X-Title": "WhoDoYouKnow",
  },
})

export interface ContactRow {
  name: string
  email: string
  relationship_type: "classmate" | "professor" | "professional" | "friend" | "other"
  how_we_met: string
  interaction_summary: string
  last_contact: string
  total_emails: number
  confidence: "high" | "medium" | "low"
  tags: string[]
}

const SYSTEM_PROMPT = `You are a contact extraction assistant. Given email thread metadata, 
extract meaningful human contacts and summarize each relationship.

Return ONLY a valid JSON array. No markdown, no explanation, no backticks.

For each contact:
- name: full name from email signature or header
- email: their email address
- relationship_type: one of classmate | professor | professional | friend | other
- how_we_met: one sentence inference from subject lines and context (past tense)
- interaction_summary: 2-3 sentences summarizing the relationship and notable exchanges
- last_contact: ISO date string of most recent message
- total_emails: total message count across all their threads
- confidence: high (clear human, multiple exchanges) | medium (likely human, few exchanges) | low (unclear)
- tags: array of 1-4 relevant tags from [classmate, professor, mentor, colleague, friend, lab-partner, club, internship, research, hackathon, ta, advisor]

Exclude: mailing lists, automated systems, no-reply addresses, newsletters.
Only include confidence: high or medium.`

export async function extractContacts(
  threads: import("./gmail").ThreadMeta[],
  model = "anthropic/claude-3.5-sonnet"
): Promise<ContactRow[]> {
  // Group threads by sender email
  const bySender = new Map<string, import("./gmail").ThreadMeta[]>()
  for (const t of threads) {
    const existing = bySender.get(t.senderEmail) ?? []
    bySender.set(t.senderEmail, [...existing, t])
  }

  const senderSummaries = Array.from(bySender.entries()).map(([email, ts]) => ({
    email,
    name: ts[0].senderName,
    total_emails: ts.reduce((sum, t) => sum + t.messageCount, 0),
    last_contact: ts[ts.length - 1].lastDate,
    subject_snippets: ts.map(t => t.subjectSnippet).slice(0, 5),
  }))

  // Batch in groups of 25
  const BATCH = 25
  const allContacts: ContactRow[] = []

  for (let i = 0; i < senderSummaries.length; i += BATCH) {
    const batch = senderSummaries.slice(i, i + BATCH)
    try {
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(batch) },
        ],
        temperature: 0.2,
      })
      const text = res.choices[0].message.content ?? "[]"
      const parsed: ContactRow[] = JSON.parse(text)
      allContacts.push(...parsed.filter(c => c.confidence !== "low"))
    } catch (e) {
      console.error(`Batch ${i} failed, skipping:`, e)
      // Continue with other batches — partial results are fine
    }
  }

  // Deduplicate by email
  const seen = new Set<string>()
  return allContacts.filter(c => {
    if (seen.has(c.email)) return false
    seen.add(c.email)
    return true
  })
}
```

---

## 7. UI Design System

### Fonts
```ts
// src/app/layout.tsx
import { Playfair_Display, Inter } from "next/font/google"

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "700", "900"],
})

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
})
```

### Color Palette (Tailwind + CSS vars)
```css
/* globals.css */
:root {
  --brand-cream: #FAF7F2;
  --brand-ink: #1A1714;
  --brand-gold: #C9A84C;
  --brand-muted: #8C7B6B;
}
```

### Hero Component (GSAP + Framer Motion)
```tsx
// src/components/landing/Hero.tsx
"use client"
import { useEffect, useRef } from "react"
import { gsap } from "gsap"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"

export function Hero() {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    // GSAP stagger reveal on each word
    if (!headingRef.current) return
    const words = headingRef.current.querySelectorAll(".word")
    gsap.fromTo(words,
      { y: 60, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.08, duration: 0.9, ease: "power3.out" }
    )
  }, [])

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background — AI generated image */}
      <div className="absolute inset-0 z-0">
        <img
          src="/bg.jpg"
          alt=""
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[--brand-cream] via-transparent to-[--brand-cream]" />
      </div>

      <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
        <h1
          ref={headingRef}
          className="font-serif text-6xl md:text-8xl font-black tracking-tight text-[--brand-ink] leading-none mb-8"
        >
          {"You spent years\nmeeting people.".split(" ").map((w, i) => (
            <span key={i} className="word inline-block mr-4">{w}</span>
          ))}
          <br />
          <span className="word inline-block text-[--brand-gold]">Don't lose them.</span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="text-xl text-[--brand-muted] mb-12 max-w-2xl mx-auto"
        >
          Connect your Gmail. We scan your history, find every real person you've
          ever interacted with, and hand you a clean spreadsheet. One time. $9.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.1 }}
        >
          <Button
            size="lg"
            className="bg-[--brand-ink] text-[--brand-cream] hover:bg-[--brand-gold] hover:text-[--brand-ink] text-lg px-10 py-6 font-semibold transition-all duration-300"
          >
            Get My Network — $9
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
```

### Filter Panel Component
```tsx
// src/components/filter/FilterPanel.tsx
// shadcn components to install:
// npx shadcn-ui@latest add slider switch checkbox card badge

// Key props:
interface FilterConfig {
  afterDate: string            // ISO date
  blockedDomains: string[]     // user typed domains
  skipPromotions: boolean
  skipUpdates: boolean
  skipSocial: boolean
  skipForums: boolean
  minInteractions: number      // 1-5
  maxThreads: number           // 100-500
}
```

### Progress Stages
```tsx
const STAGES = [
  { id: "connect",  label: "Connecting to Gmail",         copy: "Shaking hands with Google..." },
  { id: "fetch",    label: "Fetching threads",            copy: "Digging through years of emails..." },
  { id: "filter",   label: "Filtering the noise",         copy: "Removing Canvas, dining halls, spam..." },
  { id: "analyze",  label: "Analyzing your contacts",     copy: "AI is reading the vibes..." },
  { id: "build",    label: "Building your spreadsheet",   copy: "Almost there, formatting nicely..." },
  { id: "ready",    label: "Your network is ready",       copy: "That's everyone you know." },
]
```

---

## 8. Privacy Policy (Full Text)

Save as `src/app/privacy/page.tsx` — also needs to be live at a URL for Google review.

```
Last updated: [DATE]

WhoDoYouKnow ("we", "our", "us") is committed to protecting your privacy.

DATA WE ACCESS
We request read-only access to your Gmail account and Google Contacts solely
to identify people you have meaningfully communicated with.

DATA WE PROCESS (NOT STORE)
Email thread metadata (sender names, email addresses, subject line snippets,
and message counts) is processed in memory on our servers. We do not store,
log, or retain any email content, subject lines, or contact information beyond
what is described below.

DATA WE STORE
- Your email address (to deliver your download link)
- Job status (pending/processing/complete)
- Your filter preferences (date range, excluded domains) — deleted after job completion

DATA WE NEVER STORE
- Email bodies or full subject lines
- Email thread content
- Contact names or personal information from your contacts

DATA DELETION
All processed data is permanently deleted within 15 minutes of your download,
or within 24 hours if no download occurs. Your Google access token is deleted
immediately after processing completes.

GOOGLE API SERVICES
Our use and transfer of information received from Google APIs adheres to the
Google API Services User Data Policy, including the Limited Use requirements.
See: https://developers.google.com/terms/api-services-user-data-policy

THIRD PARTIES
- Stripe: payment processing (their privacy policy applies)
- OpenRouter: LLM inference on contact metadata (no PII sent — only email addresses and subject snippets)
- Vercel: hosting and temporary file storage

YOUR RIGHTS
You may request deletion of your data at any time by emailing privacy@whodoyouknow.work.

CONTACT
privacy@whodoyouknow.work
```

---

## 9. Google OAuth Verification Notes

When filling out the Google Cloud Console OAuth consent screen:

**App name:** WhoDoYouKnow
**App homepage:** https://whodoyouknow.work
**Privacy policy:** https://whodoyouknow.work/privacy
**Authorized domain:** whodoyouknow.work

**Scope justification (copy-paste this):**
> `gmail.readonly`: We read Gmail thread metadata (sender, subject snippets, message count) to identify people the user has meaningfully communicated with. Email content is never stored. Data is processed in-memory and deleted within 15 minutes.
>
> `contacts.readonly`: We read contact display names to supplement email header parsing and improve the accuracy of contact identification.

**Data usage description:**
> WhoDoYouKnow reads Gmail metadata to build a one-time personal contact spreadsheet for the user. No email content is stored. All data is deleted within 15 minutes of the user downloading their results. We comply with Google's Limited Use policy — user data is not shared with third parties, used for advertising, or retained beyond the stated purpose.

---

## 10. package.json Dependencies

```json
{
  "dependencies": {
    "next": "14.2.x",
    "react": "^18",
    "react-dom": "^18",
    "better-auth": "latest",
    "drizzle-orm": "latest",
    "@neondatabase/serverless": "latest",
    "googleapis": "latest",
    "openai": "latest",
    "stripe": "latest",
    "resend": "latest",
    "@vercel/blob": "latest",
    "framer-motion": "latest",
    "gsap": "latest",
    "tailwindcss": "latest",
    "class-variance-authority": "latest",
    "clsx": "latest",
    "tailwind-merge": "latest",
    "lucide-react": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "typescript": "^5",
    "drizzle-kit": "latest",
    "@types/node": "latest",
    "@types/react": "latest"
  }
}
```

---

## 11. Implementation Order (One Night)

1. `npx create-next-app@latest whodoyouknow --typescript --tailwind --app`
2. Install all deps, init shadcn
3. Set up Neon DB + Drizzle schema + `drizzle-kit push`
4. Configure BetterAuth + Google provider
5. Build landing page (Hero + TrustBadges + SampleCsv)
6. Build filter page
7. Build Stripe checkout API route
8. Build Gmail fetcher (`lib/gmail.ts`)
9. Build OpenRouter extractor (`lib/openrouter.ts`)
10. Build pipeline orchestrator (`lib/pipeline.ts`)
11. Build SSE progress endpoint
12. Build processing page (polls SSE)
13. Build download page
14. Add privacy + terms pages
15. Deploy to Vercel
16. Generate hero background image (Midjourney / FAL: "soft abstract network of golden threads connecting luminous nodes, cream background, editorial")
17. Submit Google OAuth verification
