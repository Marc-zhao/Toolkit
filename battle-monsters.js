(function () {
    'use strict';

    const MONSTERS = [
        { id: 'moss-guardian', name: '苔岩守卫', col: 0, row: 0, accent: '#3e8a69' },
        { id: 'ember-drake', name: '余烬翼兽', col: 1, row: 0, accent: '#d76434' },
        { id: 'crystal-moth', name: '晶羽幻灵', col: 2, row: 0, accent: '#7d7ed6' },
        { id: 'clockwork-knight', name: '机巧甲卫', col: 0, row: 1, accent: '#9a6c2e' },
        { id: 'storm-raven', name: '雷云渡鸦', col: 1, row: 1, accent: '#4c609a' },
        { id: 'ink-keeper', name: '墨海典藏者', col: 2, row: 1, accent: '#3b597d' }
    ];

    function findElement(target) {
        return typeof target === 'string' ? document.querySelector(target) : target;
    }

    function mount(target, options) {
        const element = findElement(target);
        if (!element) return;
        const index = Math.abs(Number(options?.index) || 0) % MONSTERS.length;
        const monster = MONSTERS[index];
        element.className = 'vq-monster';
        element.dataset.monsterKind = monster.id;
        element.style.setProperty('--monster-accent', monster.accent);
        element.innerHTML = `<span class="vq-monster-sprite" aria-label="${monster.name}" role="img" style="--atlas-x:${monster.col * 50}%;--atlas-y:${monster.row * 100}%"></span>`;
        element.closest('.mon-area')?.classList.add('vq-battle-stage');
    }

    function pulse(target, className, duration) {
        const element = findElement(target);
        if (!element) return;
        element.classList.remove(className);
        void element.offsetWidth;
        element.classList.add(className);
        window.setTimeout(() => element.classList.remove(className), duration);
    }

    function impact(target, kind) {
        const element = findElement(target);
        const stage = element?.closest('.mon-area');
        if (!stage) return;
        const mark = document.createElement('span');
        mark.className = `vq-battle-impact ${kind || ''}`;
        stage.appendChild(mark);
        window.setTimeout(() => mark.remove(), 620);
    }

    window.VQBattleMonster = {
        mount,
        hurt(target) {
            impact(target, 'is-player-hit');
            pulse(target, 'is-hurt', 520);
        },
        attack(target) {
            impact(target, 'is-monster-attack');
            pulse(target, 'is-attacking', 720);
        },
        enrage(target, active) {
            findElement(target)?.classList.toggle('is-enraged', Boolean(active));
        },
        defeat(target) {
            pulse(target, 'is-defeated', 900);
        }
    };
})();
