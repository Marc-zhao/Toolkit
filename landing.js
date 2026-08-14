(function () {
  const nav = document.querySelector('.site-nav');
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    navLinks.setAttribute('aria-hidden', String(!open));
  }

  menuToggle.addEventListener('click', function () {
    setMenu(!nav.classList.contains('is-open'));
  });
  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () { setMenu(false); });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') setMenu(false);
  });

  const heroImage = document.querySelector('.hero-media img');
  const hero = document.querySelector('.hero');
  hero.addEventListener('pointermove', function (event) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const x = (event.clientX / window.innerWidth - .5) * -10;
    const y = (event.clientY / window.innerHeight - .5) * -7;
    heroImage.style.transform = `scale(1.055) translate3d(${x}px,${y}px,0)`;
  });
  hero.addEventListener('pointerleave', function () {
    heroImage.style.transform = '';
  });

  const progressBar = document.querySelector('.page-progress i');
  function updatePageProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const progress = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    progressBar.style.width = `${progress * 100}%`;
  }
  window.addEventListener('scroll', updatePageProgress, { passive: true });
  updatePageProgress();

  const revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .15 });
  document.querySelectorAll('.reveal').forEach(function (element) { revealObserver.observe(element); });

  function animateCount(element) {
    if (element.dataset.counted === 'true') return;
    element.dataset.counted = 'true';
    const target = Number(element.dataset.count || 0);
    const started = performance.now();
    const duration = 850;
    function tick(now) {
      const progress = Math.min(1, (now - started) / duration);
      element.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  const countObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) animateCount(entry.target);
    });
  }, { threshold: .5 });
  document.querySelectorAll('[data-count]').forEach(function (element) { countObserver.observe(element); });

  const mapSection = document.querySelector('.map-story');
  const mapStage = document.querySelector('.map-sticky');
  const mapImage = document.querySelector('.map-image');
  const mapProgressLabel = document.getElementById('map-progress-label');
  const worldName = document.getElementById('world-name');
  const questTitle = document.getElementById('quest-title');
  const questCopy = document.getElementById('quest-copy');
  const worldTabs = Array.from(document.querySelectorAll('.world-tab'));
  const questNodes = Array.from(document.querySelectorAll('.quest-node'));
  const mapChapters = [
    {
      label: 'CHAPTER 01',
      world: '起点 · 星辰观测台',
      title: '先看见完整世界，\n再走出自己的路线',
      copy: '地图从第一天就完整展开。学生知道终点在哪里，也能看见每次练习让自己前进了多少。',
      scale: 1.04,
      x: '-5%',
      y: '4%'
    },
    {
      label: 'CHAPTER 02',
      world: '中段 · 失落字典城',
      title: '学习表现，\n会改变下一段旅程',
      copy: '同一词包准备三档难度。系统根据历史正确率、速度和薄弱词，让学生进入更合适的任务组合。',
      scale: 1.18,
      x: '4%',
      y: '1%'
    },
    {
      label: 'CHAPTER 03',
      world: '分支 · 风暴记忆桥',
      title: '选择有后果，\n但每一步都会被确认',
      copy: '学生先阅读剧情与任务，再确认路线。完成、错题和选择都会进入个人学习档案，成为下一章的依据。',
      scale: 1.29,
      x: '-6%',
      y: '8%'
    }
  ];
  let activeChapter = -1;
  let manualChapterUntil = 0;

  function setChapter(index) {
    const next = Math.max(0, Math.min(mapChapters.length - 1, index));
    if (activeChapter === next) return;
    activeChapter = next;
    const chapter = mapChapters[next];
    mapProgressLabel.textContent = chapter.label;
    worldName.textContent = chapter.world;
    questTitle.innerHTML = chapter.title.replace('\n', '<br>');
    questCopy.textContent = chapter.copy;
    mapStage.style.setProperty('--map-scale', chapter.scale);
    mapStage.style.setProperty('--map-x', chapter.x);
    mapStage.style.setProperty('--map-y', chapter.y);
    worldTabs.forEach(function (tab, tabIndex) { tab.classList.toggle('is-active', tabIndex === next); });
    questNodes.forEach(function (node, nodeIndex) { node.classList.toggle('is-active', nodeIndex === next); });
  }

  function updateMapStory() {
    if (Date.now() < manualChapterUntil) return;
    const start = mapSection.offsetTop;
    const travel = mapSection.offsetHeight - window.innerHeight;
    const progress = travel > 0 ? Math.max(0, Math.min(1, (window.scrollY - start) / travel)) : 0;
    setChapter(Math.min(2, Math.floor(progress * 3)));
    mapImage.style.filter = `saturate(${1 + progress * .12}) contrast(${1.02 + progress * .08})`;
  }
  window.addEventListener('scroll', updateMapStory, { passive: true });
  worldTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      manualChapterUntil = Date.now() + 1400;
      setChapter(Number(tab.dataset.stage));
    });
  });
  questNodes.forEach(function (node) {
    node.addEventListener('click', function () {
      manualChapterUntil = Date.now() + 1400;
      setChapter(Number(node.dataset.stage));
    });
  });
  setChapter(0);

  const heroData = [
    { number: 'HERO 01', name: '林思 · 语言学侦探', description: '从词义和符号里发现规律，用推理打开隐藏路线。', shift: '-2%', focus: '20%' },
    { number: 'HERO 02', name: '陈诺 · 行动派冒险家', description: '依靠听音与快速判断突破危机，让剧情更快向前。', shift: '0%', focus: '45%' },
    { number: 'HERO 03', name: '苏晓 · 记忆收藏家', description: '把单词与场景建立联结，从回忆中找回关键线索。', shift: '2%', focus: '70%' }
  ];
  const characterVisual = document.querySelector('.character-visual');
  const characterTabs = Array.from(document.querySelectorAll('.character-tab'));
  characterTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      const index = Number(tab.dataset.hero);
      const data = heroData[index];
      characterTabs.forEach(function (item, itemIndex) { item.classList.toggle('is-active', itemIndex === index); });
      document.getElementById('character-number').textContent = data.number;
      document.getElementById('character-name').textContent = data.name;
      document.getElementById('character-description').textContent = data.description;
      characterVisual.style.setProperty('--hero-shift', data.shift);
      characterVisual.style.setProperty('--focus-left', data.focus);
    });
  });

  const reportStage = document.querySelector('.report-stage');
  const reportObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) reportStage.classList.add('is-visible');
    });
  }, { threshold: .35 });
  reportObserver.observe(reportStage);

  window.addEventListener('resize', updateMapStory);
  updateMapStory();
})();
