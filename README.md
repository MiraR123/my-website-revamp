# my-website — Business Automation Centre (local copy)

Refined local development copy of the Business Automation Centre site, repackaged
into a clean static structure. Built entirely from the existing local project
(`bacipl-local`); the live website was not contacted, modified or deployed to.

## Structure

```
my-website/
├── index.html            # About us (home) — animated 3D logo hero
├── services.html         # Services (9 services in 3 groups)
├── infrastructure.html   # Infrastructure
├── info.html             # Info — company, working hours, holidays, testimonials
├── contact.html          # Contact us — address, phone, WhatsApp, email, website, map
├── login.html            # Client login: sign in + new client registration tabs
├── dashboard.html        # Client dashboard (requires a Supabase session)
├── supabase-setup.sql    # schema, RLS policies and client-ID trigger — run once
├── supabase-billing.sql  # delivery challan + invoice tables — run once, after the above
├── css/
│   └── style.css         # complete design system (was assets/css/modern.css)
├── js/
│   ├── script.js         # mobile nav, sticky header, back-to-top, form validation
│   ├── supabase-config.js# project URL + anon key
│   ├── supabase-auth.js  # sign up / sign in / password reset against Supabase
│   └── dashboard.js      # renders the signed-in client's details and jobs
└── images/               # only the images actually used by the pages
    ├── banner2.gif       # original animated logo (3D medallion in the hero)
    ├── banner1.gif       # original "Ultimate Plotting Solutions" banner
    ├── conamelogo.jpg    # header/footer logo + favicon
    ├── bac003006-09.jpg  # facility photos (Infrastructure gallery)
    └── bac004006-09.jpg  # testimonial/section images
```

Page filenames were made readable (`bac_002.htm` → `services.html`, `bac_003.htm`
→ `infrastructure.html`, `bac_004.htm` → `info.html`) and every internal link,
stylesheet, script and image path was rewritten to match this structure.

## Run it locally

```bash
cd my-website
python3 -m http.server 3000
```

Then open <http://localhost:3000>. Any static server works (`npx serve`,
VS Code Live Server, Apache, nginx …) — there is no build step, framework or
backend.

## To show it to other people

- Same network: `python3 -m http.server 3000 --bind 0.0.0.0` and share
  `http://<your-LAN-IP>:3000` (subject to your firewall).
- Public URL: drop this folder on any static host (Netlify Drop, GitHub Pages,
  Cloudflare Pages). Nothing here has been published.

## Client accounts (Supabase)

Accounts are real: `login.html` and `dashboard.html` talk to Supabase Auth and
PostgREST directly from the browser, so the site stays a pure static build with
no server of its own.

- Registration → `auth.signUp` with the name/company/phone as user metadata; a
  trigger on `auth.users` copies them into `public.clients` and assigns the
  client ID (`BAC-1001`, `BAC-1002`, …) from a sequence.
- Sign in → `auth.signInWithPassword`, then a redirect to `dashboard.html`.
- Forgotten password → `auth.resetPasswordForEmail` sends a **real email** with
  a recovery link back to `login.html#reset`, where `auth.updateUser` stores the
  new password. The existing password is never emailed.
- `dashboard.html` requires a session (otherwise it redirects to the login page)
  and has three tabs, deep-linkable as `#account`, `#dc` and `#invoices`:
  - **Account** — client ID, contact details, verification state, recent jobs.
  - **Delivery challans** — every DC raised for the client with its date,
    description, quantity, value and billed/unbilled status, filterable, with
    totals for billed vs unbilled at the top.
  - **Invoices** — one row per invoice with value, tax, total and payment
    status; *View DCs* expands the row to list the challan numbers that
    invoice covers.

A challan counts as billed when its `invoice_id` is set, so the status is
derived from the link to the invoice and cannot drift out of step with it.

### One-time setup

1. Run `supabase-setup.sql` in the Supabase SQL editor (tables, RLS policies,
   trigger, and a back-fill for users who registered earlier), then
   `supabase-billing.sql` for the `delivery_challans` and `invoices` tables.
   The dashboard degrades gracefully if the billing tables are missing — the
   two tabs just say the records are not switched on yet.
2. Authentication → Sign In / Providers → Email: with "Confirm email" on, a new
   client must click the confirmation link before their first sign-in. Turn it
   off for immediate access.
3. Authentication → URL configuration: add the site URL(s) you serve from
   (e.g. `http://localhost:3000`, the GitHub Pages URL) as redirect URLs so the
   confirmation and password-reset links come back to the right place.

### Entering challans and invoices

The client-side policies are read-only, so rows are added from the Supabase
Table Editor (or an import) by your office, not from the website:

1. Create the invoice row first if the work is being billed (`invoice_number`
   and `total` are generated for you; set `client_id` to the client's `id`
   from `clients`).
2. Add each challan to `delivery_challans` with its `client_id`, `dc_number`,
   `dc_date` and `amount`. Leave `invoice_id` empty for an unbilled DC; set it
   to the invoice's `id` to mark it billed and make it appear under that
   invoice's *View DCs* list.

### On the anon key in `js/supabase-config.js`

The anon key is a publishable key designed to ship in the browser; it is not a
secret. All protection comes from the Row Level Security policies in
`supabase-setup.sql` (`auth.uid() = id`), which is why every client can only
read their own row. Never put the service-role key in this folder.

## Colour

The blue palette is derived from the original site logo: `banner2.gif`'s
dominant colour `#336699` is the primary blue, with `#27527d` for hover/dark
states and `#1b3a57` for the navy headings and footers.

## Technologies

Plain HTML5, CSS3 (custom properties, grid/flex, clamp-based fluid type) and
vanilla JavaScript. No dependencies, no build tooling.

## Content

All business content, contact details and images come from the original site and
are unchanged: Business Automation Centre, 1st Floor, #39 Aziz Nagar 2nd Street,
Kodambakkam, Chennai 600 024, India · +91 - 44 - 2484 0889 · +91 63827 55218 ·
bacipl@gmail.com · www.bacipl.com · 09.00–18.00, closed Saturdays and Sundays.
