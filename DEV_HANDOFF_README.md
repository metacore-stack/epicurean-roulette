# DEV_HANDOFF_README

##  Project Overview

DinnerDecider is a Next.js 15 app using the App Router with Tailwind CSS, Framer Motion, and Vercel Analytics. It integrates Supabase (auth/data), OpenAI (recommendations/UX copy), Stripe (payments), and Google Maps/Places APIs (restaurant data).

Purpose: AI-powered restaurant picker with combo filters (R1), unique-restaurant rotation/reroll (R2), and a path for premium features (upgrades, referrals, profiles).

##  Completed Phases

- Phase 1  Base architecture, story flow, and R1  R2 data handling
- Phase 2  Supabase auth, user context, localStorage caching
- Phase 3  OpenAI & Google Maps API integration
- Phase 4  SEO, analytics dashboard, sitemap/robots, conversion banner
- Phase 5  Monetization mock, referrals/promos, profile cleanup
- Phase 6  R2 unique restaurant filtering, banner dismiss persistence, clean CHANGELOG/README_DEV

##  Known Issues / Constraints

- R2 duplicates: addressed via place_id-based rotation and seen-set logic; closed/non-operational venues are filtered out.
- Repo hygiene: large binaries removed; .gitignore excludes node_modules/, .next/, and .env.local.
- Windows line-endings: CRLF warnings are harmless. Add a .gitattributes to normalize if desired.

##  Secrets & Keys

Store secrets only in .env.local (not committed):
- NEXT_PUBLIC_GOOGLE_API_KEY
- SUPABASE_URL
- SUPABASE_ANON_KEY
- STRIPE_PUBLIC_KEY

Never commit keys to Git. Use .env.local locally and environment variables in deploys.

##  Repository & Branch Info

- Remote: https://github.com/Qcarr333/DinnerDecider.git
- Branch: main (tracking origin/main)
- CI/CD: Not configured yet (option to add GitHub Actions for lint/build)

##  Next Recommended Steps

- Add .gitattributes for line-ending normalization.
- Expand README_DEV.md with a "Run Locally (Windows)" section.
- Optional: add minimal CI (build/lint) on pull requests and main.
- Prepare Phase 7: Google Maps autocomplete, friend invite flow, QA automation.

##  Local Dev Tips

- Install and run: 
pm install then 
pm run dev
- Key routes to test: /dinnerdecider, /dinnerdecider/randomize, /dinnerdecider/output
- Use Vercel for preview deployments once CI is in place.

