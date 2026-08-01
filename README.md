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
- Every word pack becomes a complete 4-12 chapter adventure based on its size.
- Students choose one of three protagonists, see the entire branching map, and
  decide the next plot route after each completed chapter.
- The three built-in worlds provide distinct mysteries, turning points, finales,
  and route-dependent endings without making a student AI request.
- Story choices also change the next chapter's practice mix between meaning,
  listening, spelling, and combined battles.
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
