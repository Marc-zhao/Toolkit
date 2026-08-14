import { chromium } from '../qa/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';

const baseUrl = 'http://127.0.0.1:8765';
const executablePath = "../qa/.playwright/headless-shell-1200/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const outputDir = './qa-results/updates';
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath });
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function newPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 600 });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort('blockedbyclient'));
  await context.addInitScript(() => {
    const result = { data: [], error: null };
    const query = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') return (resolve) => resolve(result);
        if (prop === 'maybeSingle' || prop === 'single') return () => Promise.resolve({ data: null, error: null });
        return () => query;
      }
    });
    const db = {
      from: () => query,
      rpc: () => Promise.resolve({ data: { valid: false }, error: null }),
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        getUser: () => Promise.resolve({ data: { user: null } }),
        signInWithPassword: () => Promise.resolve({ data: {}, error: { message: 'Invalid login' } }),
        signUp: () => Promise.resolve({ data: {}, error: null }),
        signOut: () => Promise.resolve({ error: null })
      }
    };
    window.supabase = { createClient: () => db };
  });
  const page = await context.newPage();
  return { page, context };
}

async function check(name, fn) {
  try {
    const details = await fn();
    results.push({ name, ok: true, details });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}

await check('landing-core-features', async () => {
  const { page, context } = await newPage();
  await page.goto(`${baseUrl}/landing.html`, { waitUntil: 'domcontentloaded' });
  const text = await page.locator('#features').innerText();
  const cards = await page.locator('#features .feature-row').count();
  for (const expected of ['自适应学生水平', '故事化 RPG 学习地图', '可导出的学习报告', '成就、XP 与排行榜']) {
    assert(text.includes(expected), `Homepage is missing ${expected}`);
  }
  assert(cards >= 4, 'Homepage does not show the core feature set');
  await page.screenshot({ path: `${outputDir}/landing-desktop.png`, fullPage: true });
  await context.close();
  return { cards };
});

await check('landing-mobile-layout', async () => {
  const { page, context } = await newPage({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/landing.html`, { waitUntil: 'networkidle' });
  const details = await page.evaluate(() => ({
    title: document.querySelector('.hero h1')?.textContent.trim(),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    emojiCount: (document.body.innerText.match(/[\p{Extended_Pictographic}]/gu) || []).length
  }));
  assert(details.title === '每个词包，都是一场新的冒险', 'Mobile homepage hero is missing');
  assert(!details.overflow, 'Mobile homepage has horizontal overflow');
  assert(details.emojiCount === 0, 'Mobile homepage still contains decorative emoji');
  await page.screenshot({ path: `${outputDir}/landing-mobile.png`, fullPage: false });
  await context.close();
  return details;
});

for (const [name, route, openRegistration, inputId] of [
  ['dashboard-register', '/dashboard.html', () => renderLogin('register'), 'r-inv'],
  ['fillblank-register', '/fillblank.html', () => renderLogin('register'), 'r-inv'],
  ['word-register', '/index.html', () => renderLogin('register'), 's-inv'],
]) {
  await check(name, async () => {
    const { page, context } = await newPage();
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(openRegistration);
    const invite = page.locator(`#${inputId}`);
    assert(await invite.count() === 1, 'Invite input is missing');
    const oldClassSelects = await page.locator('#r-cl,#s-cl').count();
    assert(oldClassSelects === 0, 'Registration still forces a class before invite type is known');
    const body = route === '/index.html' ? await page.locator('#login-section').innerText() : await page.locator('#login-body').innerText();
    assert(body.includes('班级邀请码'), 'Registration does not explain class invitations');
    await context.close();
    return { oldClassSelects };
  });
}

await check('word-map-444-words', async () => {
  const { page, context } = await newPage();
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  const details = await page.evaluate(() => {
    const words = Array.from({ length: 444 }, (_, index) => ({ w: `word${index + 1}`, m: `词义${index + 1}` }));
    G.pack = { id: 'qa-large', name: 'QA Large Pack', words };
    G.levels = buildStoryLevels(words);
    G.prog = { cleared: [], xp: 0, badges: [], wrongWords: [], unfamiliar: [], mapState: { version: mapVersionForPack(), storyId: storyForPack().id, hero: 'aria', completed: {}, choices: {}, history: [] } };
    const graph = buildLearningMap();
    const chapterNodes = graph.nodes.filter(node => node.type === 'chapter' && node.branch !== 'b');
    return {
      chapters: G.levels.length,
      maxWords: Math.max(...G.levels.map(level => level.words.length)),
      width: graph.width,
      uniquePoints: new Set(chapterNodes.map(node => `${node.x}:${node.y}`)).size,
      chapterPoints: chapterNodes.length
    };
  });
  assert(details.chapters === 45, '444 words were not split into 45 chapters');
  assert(details.maxWords <= 10, 'A vocabulary chapter exceeds 10 words');
  assert(details.width > 5000, 'Large map did not expand horizontally');
  assert(details.uniquePoints === details.chapterPoints, 'Large map still has overlapping chapter coordinates');
  await context.close();
  return details;
});

await check('word-map-confirmation', async () => {
  const { page, context } = await newPage();
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  const details = await page.evaluate(() => {
    const words = Array.from({ length: 20 }, (_, index) => ({ w: `term${index + 1}`, m: `释义${index + 1}` }));
    G.pack = { id: 'qa-confirm', name: 'QA Confirm', words };
    G.levels = buildStoryLevels(words);
    G.prog = { cleared: [], xp: 0, badges: [], wrongWords: [], unfamiliar: [], mapState: { version: mapVersionForPack(), storyId: storyForPack().id, hero: 'aria', completed: {}, choices: {}, history: [] } };
    G.mapGraph = buildLearningMap();
    const first = G.mapGraph.nodes.find(node => node.type === 'chapter');
    requestMapNode(first.id);
    return { open: document.getElementById('m-route-confirm').classList.contains('open'), title: document.getElementById('route-confirm-title').textContent };
  });
  assert(details.open, 'Clicking an available vocabulary level does not open confirmation');
  assert(details.title, 'Confirmation dialog does not describe the selected level');
  await context.close();
  return details;
});

await check('hero-presentation', async () => {
  const { page, context } = await newPage();
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  const details = await page.evaluate(() => {
    const words = Array.from({ length: 20 }, (_, index) => ({ w: `hero${index + 1}`, m: `释义${index + 1}` }));
    G.pack = { id: 'qa-heroes', name: 'QA Heroes', words };
    G.levels = buildStoryLevels(words);
    G.prog = { cleared: [], xp: 0, badges: [], wrongWords: [], unfamiliar: [], mapState: { version: mapVersionForPack(), storyId: storyForPack().id, hero: '', completed: {}, choices: {}, history: [] } };
    openHeroPicker();
    const portrait = document.querySelector('.hero-choice-avatar');
    return {
      choices: document.querySelectorAll('.hero-choice').length,
      animation: getComputedStyle(portrait).animationName,
      height: portrait.getBoundingClientRect().height,
      backgroundImage: getComputedStyle(portrait).backgroundImage,
      backgroundSize: getComputedStyle(portrait).backgroundSize,
      backgroundPosition: getComputedStyle(portrait).backgroundPosition
    };
  });
  assert(details.choices === 3, 'Hero picker does not show three curated protagonists');
  assert(details.animation === 'none' && details.height >= 240, 'Hero presentation is still a jumping thumbnail');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outputDir}/hero-picker-desktop.png`, fullPage: false });
  await context.close();
  return details;
});

await check('fillblank-large-map-and-confirmation', async () => {
  const { page, context } = await newPage({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/fillblank.html`, { waitUntil: 'domcontentloaded' });
  const details = await page.evaluate(() => {
    G.packId = 'qa-fill'; G.packName = 'QA Fill';
    G.words = Array.from({ length: 444 }, (_, index) => ({ w: `fill${index + 1}`, m: `释义${index + 1}` }));
    G.totalStages = Math.ceil(G.words.length / 5);
    G.completedStages = [];
    G.availablePacks = [{ id: G.packId, name: G.packName, words: G.words }];
    G.fbMapState = { version: `fillblank-map-v1:${G.packId}:fallback:${G.totalStages}`, hero: 'aria', choices: {}, completed: [], currentStage: 1, history: [] };
    window.renderMapGrid();
    go('s-map');
    const world = document.getElementById('fb-world-map');
    openFillblankNode(1, 'a');
    const nodes = [...world.querySelectorAll('.fb-node')];
    return {
      width: world.getBoundingClientRect().width,
      viewportOverflow: document.getElementById('fb-map-viewport').scrollWidth > document.getElementById('fb-map-viewport').clientWidth,
      touchAction: getComputedStyle(document.getElementById('fb-map-viewport')).touchAction,
      confirmation: document.getElementById('modal-fb-route').classList.contains('open'),
      uniqueLeft: new Set(nodes.map(node => node.style.left)).size,
      stages: G.totalStages
    };
  });
  assert(details.width > 10000, `Large FillBlank map did not expand (measured ${details.width}px for ${details.stages} stages)`);
  assert(details.viewportOverflow, 'FillBlank map is not horizontally scrollable');
  assert(details.touchAction.includes('pan-y'), 'Mobile map touch behavior is not configured for horizontal dragging');
  assert(details.confirmation, 'FillBlank level click does not open confirmation');
  assert(details.uniqueLeft >= details.stages, 'FillBlank stages still overlap horizontally');
  await page.screenshot({ path: `${outputDir}/fillblank-large-mobile.png`, fullPage: false });
  await page.evaluate(() => closeModal('modal-fb-route'));
  await page.screenshot({ path: `${outputDir}/fillblank-map-mobile.png`, fullPage: false });
  await context.close();
  return details;
});

await check('fillblank-does-not-leak-chinese-answer', async () => {
  const { page, context } = await newPage();
  await page.goto(`${baseUrl}/fillblank.html`, { waitUntil: 'domcontentloaded' });
  const details = await page.evaluate(() => {
    const question = {
      word: 'resilient', answer: 'resilient', meaning: '有韧性的', translation: '这名队员在压力下依然很有韧性。',
      sentence: 'The young explorer remained ____ after the difficult journey.',
      options: ['resilient', 'silent', 'distant', 'ancient'], grammar_point: '系动词后接形容词',
      steps: ['观察系动词', '判断空格词性', '结合语境选择']
    };
    G.questions = [question]; G.qIdx = 0; G.phase = 1; G.gameStep = 1; G.adaptiveDifficulty = 2;
    renderQ();
    const firstText = document.getElementById('q-area').innerText;
    G.gameStep = 3; renderQ();
    const spellingText = document.getElementById('q-area').innerText;
    return {
      firstLeaksMeaning: firstText.includes(question.meaning) || firstText.includes(question.translation),
      spellingLeaksMeaning: spellingText.includes(question.meaning) || spellingText.includes(question.translation),
      hasEnglishContext: firstText.includes('young explorer') && spellingText.includes('young explorer')
    };
  });
  assert(!details.firstLeaksMeaning && !details.spellingLeaksMeaning, 'Chinese meaning is visible before an answer is submitted');
  assert(details.hasEnglishContext, 'The English sentence context is missing');
  await context.close();
  return details;
});

await check('battle-monster-curated-atlas', async () => {
  const { page, context } = await newPage();
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  const details = await page.evaluate(async () => {
    go('s-battle');
    const host = document.getElementById('mon-em');
    VQBattleMonster.mount(host, { index: 3, stage: 3, name: 'QA Mech' });
    VQBattleMonster.hurt(host);
    const hurt = host.classList.contains('is-hurt');
    VQBattleMonster.attack(host);
    return {
      sprites: host.querySelectorAll('.vq-monster-sprite').length,
      atlas: getComputedStyle(host.querySelector('.vq-monster-sprite')).backgroundImage.includes('monster-atlas.png'),
      hurt,
      attack: host.classList.contains('is-attacking'),
      stage: host.closest('.mon-area').classList.contains('vq-battle-stage')
    };
  });
  assert(details.sprites === 1 && details.atlas, 'Battle monster did not render from the curated atlas');
  assert(details.hurt && details.attack && details.stage, 'Battle animation states are incomplete');
  await page.screenshot({ path: `${outputDir}/battle-monster-desktop.png`, fullPage: false });
  await context.close();
  return details;
});

await check('teacher-world-version-manager', async () => {
  const { page, context } = await newPage();
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
  const details = await page.evaluate(async () => {
    const pack = { id: 'qa-world-pack', name: 'QA World Pack', words: Array.from({ length: 20 }, (_, i) => ({ w: `term${i}`, m: `词义${i}` })), story_data: { status: 'ready', signature: 'a'.repeat(64), story: { title: 'Current World' } } };
    window._teacherPacks = [pack];
    vqClient.rpc = async name => name === 'list_vq_story_versions' ? { data: {
      allowed: true, maxVersions: 5, activeVersionId: '11111111-1111-1111-1111-111111111111', versions: [
        { id: '11111111-1111-1111-1111-111111111111', versionNo: 1, status: 'ready', isActive: true, createdAt: '2026-08-14', storyData: { status: 'ready', story: { title: 'Current World', short: '旧城防线' }, art: {} } },
        { id: '22222222-2222-2222-2222-222222222222', versionNo: 2, status: 'ready', isActive: false, createdAt: '2026-08-14', storyData: { status: 'ready', story: { title: 'Alternative World', short: '风暴航路' }, art: {} } }
      ]
    }, error: null } : { data: null, error: null };
    await openWorldManager(pack.id);
    return {
      cards: document.querySelectorAll('.world-version-card').length,
      active: document.querySelectorAll('.world-version-card.active').length,
      switchButtons: [...document.querySelectorAll('.world-version-actions .btn')].filter(button => button.textContent.includes('设为学生世界')).length,
      createButton: [...document.querySelectorAll('.world-version-toolbar .btn')].some(button => button.textContent.includes('生成候选世界'))
    };
  });
  assert(details.cards === 2 && details.active === 1, 'World version library does not distinguish active and candidate worlds');
  assert(details.switchButtons === 1 && details.createButton, 'Teacher cannot select or create a world version');
  await context.close();
  return details;
});

await check('fillblank-ai-three-difficulty-cache', async () => {
  const { page, context } = await newPage();
  await page.goto(`${baseUrl}/fillblank.html`, { waitUntil: 'domcontentloaded' });
  const details = await page.evaluate(async () => {
    const words = [
      { w: 'adapt', m: '适应' }, { w: 'resilient', m: '有韧性的' }, { w: 'persist', m: '坚持' },
      { w: 'recover', m: '恢复' }, { w: 'strategy', m: '策略' }
    ];
    const inserted = [];
    let aiCalls = 0;
    window.confirm = () => true;
    callAI = async () => {
      aiCalls++;
      return JSON.stringify(words.map(item => ({
        word: item.w, meaning: item.m, sentence: `Students can ____ during the expedition.`, translation: '学生可以在远征中完成这个动作。',
        answer: item.w, options: [item.w, 'observe', 'retreat', 'compare'], steps: ['理解语境', '判断词性', '完成拼写'], grammar_point: '情态动词后接动词原形'
      })));
    };
    const query = {
      select() { return this; }, eq() { return this; }, neq() { return this; }, order() { return this; }, limit() { return Promise.resolve({ data: [], error: null }); },
      delete() { return this; },
      insert(payload) { inserted.push(...payload); return Promise.resolve({ error: null }); },
      upsert() { return Promise.resolve({ error: null }); },
      then(resolve) { resolve({ data: [], error: null }); }
    };
    db.from = () => Object.create(query);
    switchT = async () => {};
    G.userId = 'qa-teacher'; G.isTeacher = true; G.words = words;
    await genAll('qa-pack', 'QA Pack', words);
    return {
      aiCalls,
      inserted: inserted.length,
      difficulties: [...new Set(inserted.map(item => item.difficulty))].sort(),
      allHaveBlank: inserted.every(item => item.sentence.includes('____')),
      allHaveAnswer: inserted.every(item => item.options.includes(item.answer))
    };
  });
  assert(details.aiCalls === 1, 'Question bank did not use the AI generation path');
  assert(details.inserted === 15, 'Five words did not produce three cached difficulty variants each');
  assert(details.difficulties.join(',') === '1,2,3', 'The three adaptive difficulty levels are incomplete');
  assert(details.allHaveBlank && details.allHaveAnswer, 'Generated question validation failed');
  await context.close();
  return details;
});

await check('leaderboard-xp-visible', async () => {
  const { page, context } = await newPage();
  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  const details = await page.evaluate(() => {
    document.getElementById('s-main').classList.add('active');
    const box = document.getElementById('lb-box');
    box.innerHTML = '<div class="lb-row"><div class="lb-info"><div class="lb-name">QA Student</div></div><div class="lb-score">525 XP</div></div>';
    const score = box.querySelector('.lb-score');
    return { text: score.textContent, display: getComputedStyle(score).display, width: score.getBoundingClientRect().width };
  });
  assert(details.text === '525 XP' && details.width > 0, 'Leaderboard XP is not visible');
  await context.close();
  return details;
});

await check('report-pdf-export', async () => {
  const { page, context } = await newPage();
  await page.goto(`${baseUrl}/dashboard.html`, { waitUntil: 'domcontentloaded' });
  const details = await page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend','<article id="teacher-report-paper"><div class="report-logo">VOCAQUEST</div><h1>班级周报</h1></article>');
    let printed = 0; let written = '';
    const fake = { opener: window, document: { write: value => { written = value; }, close() {} }, focus() {}, print() { printed++; }, addEventListener(_name, callback) { callback(); } };
    window.open = () => fake;
    printTeacherReport();
    return { printed, hasLogo: written.includes('VOCAQUEST'), hasReport: written.includes('班级周报') };
  });
  assert(details.printed === 1, 'PDF export did not open the browser print flow');
  assert(details.hasLogo && details.hasReport, 'Exported report is missing the VocaQuest brand or report content');
  await context.close();
  return details;
});

await check('database-rules-static-audit', async () => {
  const sql = await fs.readFile('./supabase/migrations/202608140001_adaptive_invites_and_class_limits.sql', 'utf8');
  for (const required of ['create_vq_student_invite', 'class_invites', 'join_vq_class_once', 'v_count >= 60', 'student_learning_profiles', 'word_pack_difficulty_variants']) {
    assert(sql.includes(required), `Migration is missing ${required}`);
  }
  assert(sql.includes("used_count = used_count + 1, used_by = new.id, used_at = now(), is_active = false"), 'One-time student code is not invalidated atomically');
  return { lines: sql.split('\n').length };
});

await check('story-world-version-database-audit', async () => {
  const sql = await fs.readFile('./supabase/migrations/202608150001_story_world_versions.sql', 'utf8');
  for (const required of ['vq_story_versions', 'active_story_version_id', 'version_no between 1 and 5', 'list_vq_story_versions', 'claim_vq_story_version', 'finish_vq_story_version', 'select_vq_story_version']) {
    assert(sql.includes(required), `World version migration is missing ${required}`);
  }
  assert(sql.includes('if v_count >= 5'), 'World library does not enforce its five-version limit');
  assert(sql.includes("if v_active is null and v_data->>'status' in ('ready', 'partial')"), 'First completed world is not activated safely');
  return { lines: sql.split('\n').length };
});

await browser.close();
await fs.writeFile(`${outputDir}/report.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
if (results.some(result => !result.ok)) process.exitCode = 1;
