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

- All six user-facing pages share persisted light/dark and font-size selectors.
- A newly uploaded word pack is analyzed once by Zhipu AI. Its dedicated world,
  three protagonists, 12-chapter story, A/B branches, map image, and character
  art are persisted in Supabase and shared by every student using that pack.
- Reopening the same unchanged pack reads the cached story and does not make a
  new AI request. A database claim function prevents duplicate concurrent
  generation.
- Students choose one of the pack-specific protagonists, see the entire
  branching map, and decide the next plot route after each completed chapter.
- Built-in worlds remain available as a resilient fallback while a teacher
  generates or retries a pack's dedicated artwork.
- Story choices also change the next chapter's practice mix between meaning,
  listening, spelling, and combined battles.
- The dashboard combines vocabulary, sentence practice, weak-word review, and the
  weekly boss into one personalized daily route.

## Deploy

1. Apply every SQL file in `supabase/migrations/` in filename order.
2. Add `ZHIPU_API_KEY` to the Vercel project for all environments. Existing
   deployments using the `Zhipu` variable name are also supported.
   `ZHIPU_IMAGE_MODEL` is optional and defaults to `cogview-3-flash`.
   `ZHIPU_WATERMARK_ENABLED=false` may be used only after the Zhipu account has
   permission to generate watermark-free images. The UI also uses a safe crop
   so previously generated artwork does not expose provider marks.
3. Deploy this directory. The root URL rewrites to `landing.html`.
4. Verify student and teacher workflows, theme persistence, mobile layout, and
   the AI proxy before promoting the deployment.

The browser Supabase anon key is intentionally public. Authorization is enforced
by Supabase RLS and security-definer registration/quota RPCs.
