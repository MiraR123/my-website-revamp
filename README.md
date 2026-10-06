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
├── login.html            # Client login: sign in + forgotten-password reset
├── dashboard.html        # Client / admin dashboard (requires a Supabase session)
├── 404.html              # Not-found page (GitHub Pages serves it automatically)
├── robots.txt, sitemap.xml
├── _config.yml           # GitHub Pages: keeps setup files out of the published site
├── supabase-setup.sql    # schema, RLS policies and client-ID trigger — run once
├── supabase-*.sql        # remaining setup scripts — see “One-time setup”
├── supabase/functions/admin-create-client/  # Edge Function: admin creates client logins
├── css/
│   └── style.css         # complete design system (was assets/css/modern.css)
├── js/
│   ├── script.js         # mobile nav, sticky header, back-to-top, form validation
│   ├── supabase-config.js# project URL + anon key
│   ├── supabase-auth.js  # sign in, password reset, first-login password change
│   └── dashboard.js      # account, delivery challans, invoices, admin Clients tab
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

Accounts are real: `login.html` and `dashboard.html` talk to Supabase Auth,
PostgREST, Storage and one Edge Function directly from the browser, so the site
stays a pure static build that can be served from any HTTPS host.

- **No public sign-up.** Only an admin creates client logins, from the
  dashboard's *Clients* tab. That calls the `admin-create-client` Edge Function,
  which checks the caller is an admin, creates the Auth user with the
  service-role key (held by Supabase, never in this folder), creates the
  `clients` row with `must_change_password = true` and returns the temporary
  password (`Bacipl@1234` by default, or the `TEMP_PASSWORD` function secret).
- **First sign-in** shows only a "set a new password" form; the dashboard opens
  once the password has been changed.
- **Forgotten password** → `auth.resetPasswordForEmail` sends a real email with
  a link back to `login.html#reset`, where the new password is saved.
- **Roles:** `clients.role` is `client` or `admin`. RLS lets a client read only
  their own rows; `public.is_admin()` lets admins read every client, challan,
  invoice and stored PDF.
- `dashboard.html` tabs, deep-linkable as `#account`, `#dc`, `#invoices`
  (and `#clients` for admins):
  - **Account** — client ID and contact details.
  - **Delivery challans** — unbilled DCs only: DC no., date, customer code and
    a *Download PDF* button.
  - **Invoices** — invoice no., date, customer code and *Download PDF*.

A challan is unbilled while its `invoice_id` is empty; the column is only used
as that filter and is never shown on screen.

### One-time setup

1. Supabase → SQL Editor, in this order: `supabase-setup.sql`,
   `supabase-billing.sql`, `supabase-billing-v2.sql`,
   `supabase-invoice-files.sql`, `supabase-challan-files.sql`,
   `supabase-roles.sql`. Edit the admin email at the end of
   `supabase-roles.sql` before running it. The `supabase-sample-data*.sql`
   files are optional test data.
2. Supabase → Edge Functions → deploy `admin-create-client` with the contents
   of `supabase/functions/admin-create-client/index.ts` (dashboard editor or
   `supabase functions deploy admin-create-client`).
3. Supabase → Authentication → URL Configuration: Site URL = the address the
   site is served from; add `https://<that-domain>/**` and
   `http://localhost:3000/**` to Redirect URLs.
4. Supabase → Authentication → Sign In / Providers: turn off "Allow new users
   to sign up".
5. Recommended before real clients: connect your own SMTP provider (the
   built-in mailer sends only a few emails per hour) and replace the shared
   temporary password with a random one per client.

### Uploading challans and invoices

Rows are added by the office in the Supabase Table Editor (or an import); the
website is read-only for clients. PDFs go in the private Storage buckets
`challans` and `invoices` as `<client uuid>/<DC or invoice number>.pdf` — the
helper queries at the end of the two `*-files.sql` scripts print the exact path
for every row. The dashboard downloads them through 60-second signed URLs and
falls back to a generated PDF when no file has been uploaded.

### Hosting elsewhere

Upload the website files (everything except `supabase/`, `tools/`, the `.sql`
files and this README) to any static HTTPS host, then add the new domain to
step 3 above. If the domain changes, also update the absolute URLs in
`robots.txt`, `sitemap.xml` and the `og:image` tag on each page.

### On the anon key in `js/supabase-config.js`

The anon key is a publishable key designed to ship in the browser; it is not a
secret. All protection comes from the Row Level Security policies in
`supabase-setup.sql` (`auth.uid() = id`), which is why every client can only
read their own rows (admins excepted via `public.is_admin()`). Never put the service-role key in this folder.

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
