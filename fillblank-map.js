/* FillBlank story map: shares each word pack's generated world and persists one route per student. */
(function () {
  const fallbackMaps = [
    './assets/story/star-chart-map.jpg',
    './assets/story/abyss-crown-map.jpg',
    './assets/story/sun-engine-map.jpg'
  ];
  const heroIds = ['aria', 'noah', 'sora'];
  const baseSelPack = window.selPack;
  const baseStartStage = window.startStage;
  const baseEndBattle = window.endBattle;
  let pendingChoice = null;

  function hash(value) {
    let result = 2166136261;
    for (const char of String(value || '')) {
      result ^= char.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }

  function activePack() {
    return (G.availablePacks || []).find(pack => pack.id === G.packId) || {};
  }

  function storyData() {
    const data = activePack().story_data;
    return ['ready', 'partial'].includes(data?.status) && data?.story?.beats?.length > 0 ? data : null;
  }

  function currentStory() {
    const data = storyData();
    if (data) return data.story;
    return {
      title: `${G.packName || '词包'} · 语境远征`,
      short: '语境远征',
      premise: '沿着词包的故事路线，在真实句子中夺回每一个关键线索。',
      beats: Array.from({ length: 12 }, (_, index) => ({
        title: `第 ${index + 1} 处据点`,
        text: '完成句子填空挑战，继续推进本次冒险。',
        a: ['正面行动', '从主路进入下一处据点。', '队伍成功打开前进通道。'],
        b: ['秘密调查', '沿隐蔽路线寻找新的线索。', '队伍发现了另一条安全路线。']
      }))
    };
  }

  function safeArtUrl(value, fallback) {
    const url = String(value || '');
    if (/^\.\/assets\/story\/[a-z0-9-]+\.(?:jpg|png|webp)$/i.test(url)) return url;
    if (/^https:\/\/dosseusntiuzmldpwpow\.supabase\.co\/storage\/v1\/object\/public\/story-assets\/[a-zA-Z0-9_./-]+$/.test(url)) return url;
    return fallback;
  }

  function mapArt() {
    const data = storyData();
    const fallback = fallbackMaps[hash(G.packId) % fallbackMaps.length];
    return safeArtUrl(data?.art?.mapImage, fallback);
  }

  function heroArt() {
    return safeArtUrl(storyData()?.art?.heroImage, './assets/story/heroes.jpg');
  }

  function heroes() {
    const custom = storyData()?.heroes;
    const fallback = [
      { id: 'aria', name: '阿澜 · 星火剑士', trait: '勇气', detail: '擅长正面突围。' },
      { id: 'noah', name: '诺亚 · 影纹学者', trait: '洞察', detail: '擅长破解线索。' },
      { id: 'sora', name: '索拉 · 风语游侠', trait: '共情', detail: '擅长发现隐藏道路。' }
    ];
    return heroIds.map((id, index) => ({ ...fallback[index], ...(custom?.find(hero => hero?.id === id) || {}) }));
  }

  function mapVersion() {
    return `fillblank-map-v1:${G.packId}:${storyData()?.signature || 'fallback'}:${G.totalStages}`;
  }

  function emptyState() {
    return { version: mapVersion(), hero: '', choices: {}, completed: [], currentStage: 1, history: [] };
  }

  function normalizeState(value) {
    const state = value?.version === mapVersion() ? value : emptyState();
    state.hero ||= '';
    state.choices ||= {};
    state.completed = [...new Set([...(state.completed || []), ...(G.completedStages || [])].map(Number).filter(Number.isFinite))];
    state.currentStage = Number(state.currentStage) || 1;
    state.history ||= [];
    return state;
  }

  async function loadMapProgress() {
    G.fbMapState = emptyState();
    if (!G.userId || !G.packId || G.isTeacher) return G.fbMapState;
    const [mapResult, stagesResult] = await Promise.all([
      db.from('fillblank_map_progress').select('map_data').eq('user_id', G.userId).eq('pack_id', G.packId).maybeSingle(),
      db.from('fillblank_stage_results').select('stage_num').eq('user_id', G.userId).eq('pack_id', G.packId)
    ]);
    const completed = [...new Set((stagesResult.data || []).map(row => Number(row.stage_num)).filter(stage => stage > 0))];
    G.completedStages = [...new Set([...(G.completedStages || []), ...completed])];
    G.fbMapState = normalizeState(mapResult.data?.map_data);
    return G.fbMapState;
  }

  async function saveMapProgress() {
    if (!G.userId || !G.packId || G.isTeacher || !G.fbMapState) return;
    G.fbMapState.version = mapVersion();
    G.fbMapState.completed = [...new Set(G.fbMapState.completed || [])];
    await db.from('fillblank_map_progress').upsert({
      user_id: G.userId,
      pack_id: G.packId,
      map_data: G.fbMapState,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,pack_id' });
  }

  function beatFor(stage, branch = 'a') {
    const story = currentStory();
    const index = G.totalStages <= 1 ? 0 : Math.round((stage - 1) * Math.max(0, story.beats.length - 1) / (G.totalStages - 1));
    const beat = story.beats[index] || story.beats[0];
    const route = stage === 1 ? null : (beat[branch] || beat.a);
    return {
      title: route?.[0] || beat.title,
      prompt: route?.[1] || beat.text,
      outcome: route?.[2] || beat.text
    };
  }

  function nodeState(stage, branch) {
    const state = G.fbMapState || emptyState();
    if (state.completed.includes(stage)) return state.choices[stage - 1] && state.choices[stage - 1] !== branch ? 'missed' : 'done';
    if (stage === 1) return 'available';
    if (!state.completed.includes(stage - 1)) return 'locked';
    const chosen = state.choices[stage - 1];
    if (!chosen) return 'choice';
    return chosen === branch ? 'available' : 'missed';
  }

  function positions(stage, branch) {
    const progress = G.totalStages <= 1 ? 0 : (stage - 1) / (G.totalStages - 1);
    const x = 95 + (stage - 1) * 116;
    const wave = Math.sin(progress * Math.PI * 2.2) * 55;
    const split = stage === 1 ? 0 : (branch === 'a' ? -112 : 112);
    return [Math.round(x), Math.round(285 + split + wave)];
  }

  function routePath(branch) {
    const points = [];
    for (let stage = 1; stage <= G.totalStages; stage++) points.push(positions(stage, stage === 1 ? 'a' : branch));
    return points.map((point, index) => `${index ? 'L' : 'M'} ${point[0]} ${point[1]}`).join(' ');
  }

  function renderNodes() {
    const state = G.fbMapState || emptyState();
    const nodes = [];
    for (let stage = 1; stage <= G.totalStages; stage++) {
      const branches = stage === 1 ? ['a'] : ['a', 'b'];
      branches.forEach(branch => {
        const status = nodeState(stage, branch);
        const beat = beatFor(stage, branch);
        const point = positions(stage, branch);
        const disabled = ['locked', 'missed'].includes(status);
        nodes.push(`<button class="fb-node ${status} route-${branch}" style="left:${point[0]}px;top:${point[1]}px"
          type="button" ${disabled ? 'disabled' : ''} onclick="openFillblankNode(${stage},'${branch}')">
          ${status === 'done' ? '✓' : stage}
          <span class="fb-node-card"><strong>${escH(beat.title)}</strong><span>第 ${stage} 关 · ${Math.min(5, Math.max(0, G.words.length - (stage - 1) * 5))} 词</span></span>
        </button>`);
      });
    }
    const currentBranch = state.choices[Math.max(1, state.currentStage) - 1] || 'a';
    const currentPoint = positions(Math.max(1, Math.min(G.totalStages, state.currentStage)), currentBranch);
    const hero = state.hero ? `<span class="fb-map-hero hero-${state.hero}" style="left:${currentPoint[0]}px;top:${currentPoint[1]}px;background-image:url('${heroArt()}')"></span>` : '';
    return nodes.join('') + hero;
  }

  function renderStoryMap() {
    const body = document.getElementById('map-body');
    if (!body) return;
    const state = G.fbMapState || emptyState();
    const story = currentStory();
    const done = state.completed.length;
    const nextStage = Math.min(G.totalStages, Math.max(1, done + 1));
    const mapWidth = Math.max(1100, 210 + Math.max(1, G.totalStages) * 116);
    const needsChoice = nextStage > 1 && state.completed.includes(nextStage - 1) && !state.choices[nextStage - 1];
    body.innerHTML = `<div class="fb-story-shell">
      <div class="fb-story-head">
        <div>
          <div class="fb-story-kicker">STORY MAP · 语境冒险</div>
          <div class="fb-story-name">${escH(story.title)}</div>
          <div class="fb-story-copy">${escH(story.premise)}</div>
        </div>
        <div class="fb-story-progress">${done}/${G.totalStages} CLEAR</div>
      </div>
      <div class="fb-map-legend"><span style="color:var(--cyan)"><i></i>可挑战</span><span style="color:var(--purple)"><i></i>待选择</span><span style="color:var(--green)"><i></i>已完成</span><span><i></i>未抵达</span></div>
      <div class="fb-map-viewport" id="fb-map-viewport" aria-label="句子填空完整学习地图">
        <div class="fb-world-map" id="fb-world-map" style="width:${mapWidth}px;min-width:${mapWidth}px;background-image:url('${mapArt()}');background-size:${mapWidth>1500?'auto 100%':'cover'};background-repeat:${mapWidth>1500?'repeat-x':'no-repeat'}">
          <div class="fb-map-plate">${escH(story.short || '语境远征')}<br>完成句子挑战，推进故事路线</div>
          ${storyData() ? '<div class="fb-art-mark-cover" aria-hidden="true"></div>' : ''}
          <svg class="fb-map-line" viewBox="0 0 ${mapWidth} 530" aria-hidden="true">
            <path class="${done ? 'done' : ''}" d="${routePath('a')}"></path>
            <path class="${needsChoice ? 'choice' : ''}" d="${routePath('b')}"></path>
          </svg>
          ${renderNodes()}
        </div>
      </div>
      <div class="fb-map-next">
        <div><strong>${!state.hero ? '先选择本次冒险主角' : needsChoice ? '选择下一段剧情路线' : `下一关：${escH(beatFor(nextStage, state.choices[nextStage - 1] || 'a').title)}`}</strong>
        <span>${!state.hero ? '主角会跟随你出现在整张语境地图中。' : needsChoice ? '点开 A 或 B 查看剧情，确认后才会锁定。' : '完成句子选词、理解和拼写三步挑战。'}</span></div>
        <button class="btn btn-purple btn-sm" type="button" onclick="${!state.hero ? 'openFillblankHeroPicker()' : `focusFillblankStage(${nextStage})`}">${!state.hero ? '选择主角' : '定位下一关'}</button>
      </div>
    </div>`;
    enableFillblankDrag(document.getElementById('fb-map-viewport'));
    requestAnimationFrame(() => focusFillblankStage(nextStage, false));
  }

  function ensureModals() {
    if (document.getElementById('modal-fb-route')) return;
    document.body.insertAdjacentHTML('beforeend', `
      <div class="modal-bg" id="modal-fb-route"><div class="modal" style="max-width:500px">
        <div class="modal-title">确认剧情路线</div>
        <div style="font-size:13px;color:var(--dim);line-height:1.7">查看不会锁定路线，只有点击确认后才会保存选择。</div>
        <div class="fb-confirm-card"><strong id="fb-route-title"></strong><span id="fb-route-copy"></span><span id="fb-route-meta" style="color:var(--cyan);margin-top:8px"></span></div>
        <div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn btn-purple" style="flex:1" onclick="confirmFillblankRoute()">确认并进入</button><button class="btn btn-gray" style="flex:1" onclick="cancelFillblankRoute()">再看看</button></div>
      </div></div>
      <div class="modal-bg" id="modal-fb-hero"><div class="modal" style="max-width:760px">
        <div class="modal-title" style="color:var(--gold)">选择语境冒险主角</div>
        <div style="font-size:13px;color:var(--dim);line-height:1.7">完成第一关后主角将锁定，人物与路线进度会保存在你的账号中。</div>
        <div class="fb-hero-grid" id="fb-hero-grid"></div>
      </div></div>`);
    const result = document.getElementById('res-btns');
    result?.insertAdjacentHTML('beforebegin', '<div class="fb-story-result" id="fb-story-result" style="display:none"></div>');
  }

  window.selPack = function (id, name, idx, silent) {
    baseSelPack(id, name, idx, silent);
    G.mapReadyPromise = loadMapProgress();
  };

  window.showMap = async function () {
    if (!G.packId) return toast('请先选择词包', 'err');
    await (G.mapReadyPromise || loadMapProgress());
    if (!G.fbMapState.hero && !G.isTeacher) setTimeout(openFillblankHeroPicker, 120);
    document.getElementById('map-pack').textContent = G.packName;
    renderStoryMap();
    go('s-map');
  };

  window.renderMapGrid = renderStoryMap;
  window.backToMap = function () {
    renderStoryMap();
    go('s-map');
  };

  window.openFillblankHeroPicker = function () {
    const state = G.fbMapState || emptyState();
    const locked = state.completed.length > 0;
    document.getElementById('fb-hero-grid').innerHTML = heroes().map(hero => `
      <button class="fb-hero-choice" ${locked && state.hero !== hero.id ? 'disabled' : ''} onclick="chooseFillblankHero('${hero.id}')">
        <span class="fb-hero-portrait hero-${hero.id}" style="display:block;background-image:url('${heroArt()}');background-position-x:${hero.id === 'aria' ? '0' : hero.id === 'noah' ? '50%' : '100%'}"></span>
        <strong>${escH(hero.name)}</strong><span>${escH(hero.detail || hero.trait || '')}</span>
      </button>`).join('');
    openModal('modal-fb-hero');
  };

  window.chooseFillblankHero = async function (heroId) {
    const state = G.fbMapState || emptyState();
    if (state.completed.length && state.hero && state.hero !== heroId) return toast('本次冒险已经开始，主角不能更换', 'err');
    state.hero = heroId;
    state.history.push({ event: 'hero', hero: heroId, at: new Date().toISOString() });
    G.fbMapState = state;
    await saveMapProgress();
    closeModal('modal-fb-hero');
    renderStoryMap();
    toast('主角已加入语境冒险');
  };

  window.openFillblankNode = function (stage, branch) {
    const state = G.fbMapState || emptyState();
    const status = nodeState(stage, branch);
    if (['locked', 'missed'].includes(status)) return toast('这条路线还没有解锁', 'err');
    if (!state.hero) return openFillblankHeroPicker();
    if (status === 'done') return showStageDetail(stage);
    const beat = beatFor(stage, branch);
    const locksRoute = stage > 1 && !state.choices[stage - 1];
    pendingChoice = { stage, branch, locksRoute };
    document.querySelector('#modal-fb-route .modal-title').textContent = locksRoute ? '确认剧情路线' : '确认进入关卡';
    document.getElementById('fb-route-title').textContent = `${stage > 1 ? `${branch.toUpperCase()} · ` : ''}${beat.title}`;
    document.getElementById('fb-route-copy').textContent = locksRoute ? beat.prompt : '确认后将进入本关练习；你也可以先继续拖动地图查看其他地点。';
    document.getElementById('fb-route-meta').textContent = `第 ${stage} 关 · 句子选词、语境理解与拼写`;
    document.querySelector('#modal-fb-route .btn-purple').textContent = locksRoute ? '确认路线并进入' : '确认进入';
    openModal('modal-fb-route');
  };

  window.cancelFillblankRoute = function () {
    pendingChoice = null;
    closeModal('modal-fb-route');
  };

  window.confirmFillblankRoute = async function () {
    if (!pendingChoice) return closeModal('modal-fb-route');
    const { stage, branch, locksRoute } = pendingChoice;
    pendingChoice = null;
    if (locksRoute) G.fbMapState.choices[stage - 1] = branch;
    G.fbMapState.currentStage = stage;
    G.fbMapState.history.push({ event: 'route', stage, branch, at: new Date().toISOString() });
    await saveMapProgress();
    closeModal('modal-fb-route');
    baseStartStage(stage);
  };

  window.focusFillblankStage = function (stage, smooth = true) {
    const viewport = document.getElementById('fb-map-viewport');
    const map = document.getElementById('fb-world-map');
    if (!viewport || !map) return;
    const branch = (G.fbMapState?.choices || {})[stage - 1] || 'a';
    const point = positions(stage, branch);
    viewport.scrollTo({ left: Math.max(0, point[0] - viewport.clientWidth / 2), behavior: smooth ? 'smooth' : 'auto' });
  };

  window.startStage = function (stage) {
    const state = G.fbMapState || emptyState();
    if (stage > 1 && !state.choices[stage - 1]) return openFillblankNode(stage, 'a');
    return baseStartStage(stage);
  };

  window.endBattle = async function () {
    const settling = G.phase === 2;
    await baseEndBattle();
    if (!settling || G.stageNum < 1 || G.packId === 'assigned') return;
    G.fbMapState ||= emptyState();
    if (!G.fbMapState.completed.includes(G.stageNum)) G.fbMapState.completed.push(G.stageNum);
    G.fbMapState.currentStage = Math.min(G.totalStages, G.stageNum + 1);
    G.fbMapState.history.push({ event: 'clear', stage: G.stageNum, at: new Date().toISOString() });
    G.fbMapState.history = G.fbMapState.history.slice(-80);
    await saveMapProgress();
    const branch = G.stageNum === 1 ? 'a' : (G.fbMapState.choices[G.stageNum - 1] || 'a');
    const beat = beatFor(G.stageNum, branch);
    const panel = document.getElementById('fb-story-result');
    panel.style.display = 'block';
    panel.innerHTML = `<strong>${escH(beat.title)}</strong>${escH(beat.outcome)}${G.stageNum < G.totalStages ? '<br><span style="color:var(--purple)">返回地图查看并确认下一段剧情路线。</span>' : '<br><span style="color:var(--gold)">本次语境冒险已经完成。</span>'}`;
    const practice = G.stageErrors.length ? '<button class="btn btn-orange" onclick="startPractice()">专项练习</button>' : '';
    document.getElementById('res-btns').innerHTML = `${practice}<button class="btn btn-gray" onclick="startStage(${G.stageNum})">重试</button><button class="btn btn-cyan" onclick="backToMap()">返回故事地图</button>`;
  };

  window.enableFillblankDrag = function (viewport) {
    if (!viewport || viewport.dataset.dragBound) return;
    viewport.dataset.dragBound = '1';
    let sx = 0, sy = 0, scroll = 0, moved = false, suppressUntil = 0;
    viewport.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) return;
      sx = event.touches[0].clientX;
      sy = event.touches[0].clientY;
      scroll = viewport.scrollLeft;
      moved = false;
    }, { passive: true });
    viewport.addEventListener('touchmove', event => {
      if (event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - sx;
      const dy = event.touches[0].clientY - sy;
      if (Math.abs(dx) <= 5 || Math.abs(dx) <= Math.abs(dy)) return;
      moved = true;
      viewport.classList.add('dragging');
      viewport.scrollLeft = scroll - dx;
      event.preventDefault();
    }, { passive: false });
    const finish = () => {
      viewport.classList.remove('dragging');
      if (moved) suppressUntil = Date.now() + 350;
      moved = false;
    };
    viewport.addEventListener('touchend', finish, { passive: true });
    viewport.addEventListener('touchcancel', finish, { passive: true });
    viewport.addEventListener('click', event => {
      if (Date.now() >= suppressUntil) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  };

  ensureModals();
})();
