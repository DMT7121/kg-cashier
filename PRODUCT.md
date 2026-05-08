# PRODUCT.md — KG-Cashier

## Product Purpose

KG-Cashier is a cashier operations management system for KING's GRILL restaurant. It handles shift management, cash counting, transaction recording, drink inventory, invoice processing (CUKCUK POS integration), revenue reporting, and shift handover documentation. The app runs as a single-page webapp deployed on Cloudflare Pages.

## Users

- **Primary**: Cashiers at KING's GRILL restaurant. Non-technical, using the app on a desktop browser behind the counter during service hours. High cognitive load environment (busy restaurant).
- **Secondary**: Restaurant manager reviewing shift reports and financial data.

## Register

product

## Brand Personality

- **Professional but warm**: Gold accent on dark background reflects the "KING's GRILL" premium dining identity.
- **Efficient**: Every interaction should be fast — cashiers are under time pressure during service.
- **Trustworthy**: Financial data must feel solid and reliable. Numbers should be crisp and unambiguous.
- **Vietnamese-first**: All UI copy is in Vietnamese. Typography must render Vietnamese diacritics cleanly.

## Brand Voice

Concise, respectful, action-oriented. No corporate jargon. Labels are short nouns. Buttons are imperative verbs. Confirmations are brief.

## Anti-references

- Generic SaaS dashboards with purple gradients and glassmorphism
- Overly playful fintech apps with bouncing animations
- Dense enterprise ERP interfaces with 50-column tables
- Crypto/trading platforms with neon glows and dark mode theatrics

## Color Strategy

Restrained. Tinted warm-dark neutrals + gold accent (≤15%). Semantic colors (green/red/blue) for status only, never decorative.

## Key Principles

1. **Scanability over decoration**: Cashiers glance, not study. Hierarchy must be instantly clear.
2. **Data density with clarity**: Show what matters, hide what doesn't. Progressive disclosure.
3. **Offline-capable mindset**: The app works with localStorage. Network failures are expected.
4. **Print-ready reports**: Shift handover sheets must render cleanly on A4.
