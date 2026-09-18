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
├── css/
│   └── style.css         # complete design system (was assets/css/modern.css)
├── js/
│   └── script.js         # mobile nav, sticky header, back-to-top, account form validation
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

## Client login page (local demo only)

`login.html` is a **front-end demonstration**, not real authentication:

- Sign in and new client registration are two tabs of the one Client login page
  (`login.html`, registration also reachable at `login.html#register`); the nav
  has a single `Client login` entry.
- There is no server, database, API or session — the pages are static files.
- Sign up stores the name/company/phone/password for an email in the browser's
  `localStorage` under `bac.clients`; nothing is transmitted anywhere, and the
  password is kept in clear text because there is nothing to hash against.
- Forgotten password (`login.html#reset`) issues a 6-digit one-time code valid
  for 15 minutes, then lets the client set a new password. A static site cannot
  send email, so the message a server would send is *previewed on the page*
  instead of being delivered. To send it for real you need either a backend
  endpoint or a third-party mailer (EmailJS, Formspree, AWS SES) with an
  account key — the existing password is deliberately never emailed.
- Do not use these pages for real client credentials. Making them functional
  requires a backend (account storage, password hashing, sessions, HTTPS).

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
