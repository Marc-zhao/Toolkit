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

## Deploy

1. Apply both SQL files in `supabase/migrations/` in filename order.
2. Add `ZHIPU_API_KEY` to the Vercel project for all environments.
3. Deploy this directory. The root URL rewrites to `landing.html`.
4. Verify both student and teacher workflows before promoting the deployment.

The browser Supabase anon key is intentionally public. Authorization is enforced
by Supabase RLS and security-definer registration/quota RPCs.
