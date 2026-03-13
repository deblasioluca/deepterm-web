# DeepTerm Stripe Live Migration

**Date:** 2026-03-13  
**Status:** READY — all code in place, config-only migration

---

## Prerequisites Checklist

Before switching to live mode, verify:

- [ ] Stripe account identity verification complete (business info, bank account)
- [ ] deepterm.net SSL certificate active (required for live webhooks)
- [ ] Test mode fully verified: checkout, webhook, subscription upgrades/downgrades

---

## Step 1: Create Live Products & Prices in Stripe Dashboard

Go to https://dashboard.stripe.com → Products → Add product

Create these 6 prices (matching test prices):

| Product | Billing | Amount | Note |
|---------|---------|--------|------|
| DeepTerm Pro | Monthly | CHF 12.99 | or USD — match PLAN_DETAILS |
| DeepTerm Pro | Yearly | CHF 9.99/mo × 12 = CHF 119.88 | |
| DeepTerm Team | Monthly | CHF 24.99 | |
| DeepTerm Team | Yearly | CHF 19.99/mo × 12 = CHF 239.88 | |
| DeepTerm Business | Monthly | CHF 39.99 | |
| DeepTerm Business | Yearly | CHF 29.99/mo × 12 = CHF 359.88 | |

Copy each `price_live_XXXXXXXX` ID — needed for .env update.

---

## Step 2: Create Live Webhook Endpoint

Go to https://dashboard.stripe.com → Developers → Webhooks → Add endpoint

- **URL:** `https://deepterm.net/api/stripe/webhook`
- **Events to listen:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.updated`
  - `setup_intent.succeeded`
  - `payment_method.attached`

Copy the **Signing secret** (`whsec_live_...`).

---

## Step 3: Update .env on Pi

SSH to Pi: `ssh macan@10.10.10.10`

Edit `/home/macan/deepterm/.env`:

```bash
# Replace these 3 test lines:
STRIPE_SECRET_KEY="sk_test_51SynSv3J..."    → sk_live_...
STRIPE_PUBLISHABLE_KEY="pk_test_51SynSv3J..." → pk_live_...
STRIPE_WEBHOOK_SECRET="whsec_7Y9L7q..."     → whsec_live_...

# Replace 6 price IDs with live versions:
STRIPE_PRO_MONTHLY_PRICE_ID="price_live_..."
STRIPE_PRO_YEARLY_PRICE_ID="price_live_..."
STRIPE_TEAM_MONTHLY_PRICE_ID="price_live_..."
STRIPE_TEAM_YEARLY_PRICE_ID="price_live_..."
STRIPE_BUSINESS_MONTHLY_PRICE_ID="price_live_..."
STRIPE_BUSINESS_YEARLY_PRICE_ID="price_live_..."
```

Then restart: `pm2 restart deepterm`

---

## Step 4: Update Stripe Publishable Key in Swift App

The Swift app sends the publishable key to Stripe's iOS/macOS SDK.

File: `Sources/Services/StoreKitManager.swift` or similar — search for `pk_test`:

```bash
# On CI Mac:
grep -rn "pk_test\|publishableKey\|STRIPE_PK" ~/Development/deepterm/Sources --include="*.swift"
```

If found: update to `pk_live_...` and rebuild.

---

## Step 5: Test Live Mode

1. Use a real card (e.g. your own Visa) for a CHF 0.50 test charge
2. Verify webhook fires: check Pi logs `pm2 logs deepterm | grep stripe`
3. Verify subscription created in DB:
   ```bash
   ssh macan@10.10.10.10 'cd /home/macan/deepterm && node -e "
   const {PrismaClient}=require(\"@prisma/client\");
   const p=new PrismaClient();
   p.subscription.findMany({take:3,orderBy:{createdAt:\"desc\"}}).then(r=>{console.log(JSON.stringify(r,null,2));p.\$disconnect()});
   "'
   ```
4. Refund the test charge from Stripe Dashboard

---

## Step 6: (Optional) Migrate Existing Test Subscriptions

If any users signed up during beta testing with test cards, they need to re-subscribe.
Send migration email via admin panel.

---

## Rollback

If live mode has issues:
- Revert .env to `sk_test_` keys
- `pm2 restart deepterm`
- No code changes needed

---

## Code Changes Required: NONE

All Stripe code is environment-driven. Only .env needs updating.
No rebuild required (env vars read at runtime by Next.js).
