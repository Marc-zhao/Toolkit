# Vocaquest

Production vocabulary learning system deployed from this directory.

## Pages

- `landing.html`: public entry page
- `index.html`: vocabulary learning and review
- `fillblank.html`: word-pack sentence practice
- `dashboard.html`: student and teacher workspace
- `boss.html`: weekly review challenge
- `challenge.html`: class challenge
- `api/ai.js`: authenticated Zhipu AI proxy

## Learning Experience

- All six user-facing pages share a persisted light/dark appearance selector.
- The vocabulary map shows a five-step learning path and the next recommended action.
- The dashboard combines vocabulary, sentence practice, weak-word review, and the
  weekly boss into one personalized daily route.

## Deploy

1. Apply every SQL file in `supabase/migrations/` in filename order.
2. Add `ZHIPU_API_KEY` to the Vercel project for all environments. Existing
   deployments using the `Zhipu` variable name are also supported.
3. Deploy this directory. The root URL rewrites to `landing.html`.
4. Verify student and teacher workflows, theme persistence, mobile layout, and
   the AI proxy before promoting the deployment.

The browser Supabase anon key is intentionally public. Authorization is enforced
by Supabase RLS and security-definer registration/quota RPCs.
