(function () {
    'use strict';

    const THEMES = [
        { body: '#315a74', shade: '#14293e', accent: '#68e1ff', eye: '#d9fbff', kind: 'dragon' },
        { body: '#79664a', shade: '#33291f', accent: '#ffc75e', eye: '#fff2b2', kind: 'golem' },
        { body: '#50376f', shade: '#21162f', accent: '#d697ff', eye: '#f7dcff', kind: 'wraith' },
        { body: '#536473', shade: '#1b2833', accent: '#63efff', eye: '#f6ffff', kind: 'mech' },
        { body: '#6c3d59', shade: '#281629', accent: '#ff7bc8', eye: '#fff0fa', kind: 'fungus' },
        { body: '#286d72', shade: '#123238', accent: '#64ffd4', eye: '#e5fff8', kind: 'tide' },
        { body: '#764a35', shade: '#2e1b18', accent: '#ff9367', eye: '#fff0d7', kind: 'beast' },
        { body: '#32305f', shade: '#121226', accent: '#8a8cff', eye: '#fff2a1', kind: 'void' }
    ];

    const parts = {
        dragon: '<path d="M49 63 24 45l9 35-20 18 36-3M131 63l25-18-9 35 20 18-36-3" fill="var(--shade)" stroke="var(--accent)" stroke-width="3"/><path d="m69 39 10-24 11 20 12-20 10 24" fill="var(--accent)" opacity=".8"/>',
        golem: '<path d="M47 68 20 77l-7 31 29 8M133 68l27 9 7 31-29 8" fill="var(--body)" stroke="var(--accent)" stroke-width="4"/><path d="M66 37 78 18h24l12 19" fill="var(--shade)" stroke="var(--accent)" stroke-width="3"/>',
        wraith: '<path d="M58 49Q32 57 27 89l23-9-8 27 25-18M122 49q26 8 31 40l-23-9 8 27-25-18" fill="var(--shade)" stroke="var(--accent)" stroke-width="3"/><path d="M67 36q23-29 46 0L99 29 88 13 79 30Z" fill="var(--accent)" opacity=".72"/>',
        mech: '<path d="M54 68 26 60 14 83l24 16M126 68l28-8 12 23-24 16" fill="var(--body)" stroke="var(--accent)" stroke-width="4"/><path d="m68 35 5-18h34l5 18M90 18V5" fill="none" stroke="var(--accent)" stroke-width="5"/>',
        fungus: '<path d="M54 47Q31 49 18 74q38 14 72-2 34 16 72 2-13-25-36-27" fill="var(--accent)" opacity=".78" stroke="var(--shade)" stroke-width="4"/><circle cx="43" cy="64" r="5" fill="#fff" opacity=".65"/><circle cx="137" cy="61" r="7" fill="#fff" opacity=".55"/>',
        tide: '<path d="M51 60Q21 48 14 77q22-1 31 20M129 60q30-12 37 17-22-1-31 20" fill="var(--body)" stroke="var(--accent)" stroke-width="4"/><path d="m75 37 15-25 15 25 15-13-1 30" fill="var(--accent)" opacity=".7"/>',
        beast: '<path d="M60 47 39 19l3 39M120 47l21-28-3 39" fill="var(--body)" stroke="var(--accent)" stroke-width="4"/><path d="M50 70 21 66 42 85M130 70l29-4-21 19" fill="var(--shade)" stroke="var(--accent)" stroke-width="4"/>',
        void: '<path d="M52 55 25 35l8 39-21 16 37 2M128 55l27-20-8 39 21 16-37 2" fill="var(--shade)" stroke="var(--accent)" stroke-width="3"/><path d="M67 35 90 8l23 27-23-9Z" fill="var(--accent)" opacity=".78"/>'
    };

    function svgMarkup(theme, stage) {
        const armor = stage >= 2
            ? '<path d="M58 91h64l-8 35-24 13-24-13Z" fill="none" stroke="var(--accent)" stroke-width="5" opacity=".72"/><path d="M90 94v39M66 108h48" stroke="var(--accent)" stroke-width="2" opacity=".5"/>'
            : '';
        const horns = stage >= 3
            ? '<path d="M66 52Q43 33 48 14q14 11 25 30M114 52q23-19 18-38-14 11-25 30" fill="var(--accent)" stroke="var(--shade)" stroke-width="3"/>'
            : '';
        return `<svg viewBox="0 0 180 160" role="img" aria-label="战斗怪物">
            <defs><linearGradient id="vqBody" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${theme.body}"/><stop offset="1" stop-color="${theme.shade}"/></linearGradient></defs>
            <g style="--body:${theme.body};--shade:${theme.shade};--accent:${theme.accent}">
                <ellipse class="vq-shadow" cx="90" cy="147" rx="55" ry="9" fill="#000" opacity=".42"/>
                <g class="vq-silhouette">${parts[theme.kind]}${horns}</g>
                <g class="vq-core">
                    <path d="M57 68Q59 41 90 39q31 2 33 29l10 42q2 30-43 35-45-5-43-35Z" fill="url(#vqBody)" stroke="${theme.accent}" stroke-width="4"/>
                    <path d="M63 79q27 18 54 0v42q-27 17-54 0Z" fill="${theme.shade}" opacity=".42"/>
                    ${armor}
                    <path d="M66 71q11-13 22 0M94 71q11-13 22 0" fill="none" stroke="${theme.shade}" stroke-width="8" stroke-linecap="round"/>
                    <g class="vq-eye"><ellipse cx="77" cy="72" rx="8" ry="6" fill="${theme.eye}"/><ellipse cx="103" cy="72" rx="8" ry="6" fill="${theme.eye}"/><circle cx="79" cy="73" r="3" fill="${theme.shade}"/><circle cx="101" cy="73" r="3" fill="${theme.shade}"/></g>
                    <path d="M78 89q12 8 24 0" fill="none" stroke="${theme.accent}" stroke-width="3" stroke-linecap="round"/>
                    <path class="vq-glow" d="m90 101 10 10-10 10-10-10Z" fill="${theme.accent}"/>
                </g>
                <g fill="${theme.accent}"><circle class="vq-spark" cx="32" cy="45" r="3"/><circle class="vq-spark" cx="150" cy="112" r="2.5"/><circle class="vq-spark" cx="143" cy="37" r="2"/></g>
            </g>
        </svg>`;
    }

    function mount(target, options) {
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;
        const index = Math.abs(Number(options?.index) || 0);
        const stage = Math.max(0, Math.min(3, Number(options?.stage) || 0));
        const theme = THEMES[index % THEMES.length];
        el.className = 'vq-monster';
        el.dataset.monsterKind = theme.kind;
        el.style.setProperty('--monster-accent', theme.accent);
        el.style.setProperty('--monster-glow', `${theme.accent}88`);
        el.innerHTML = svgMarkup(theme, stage);
        el.closest('.mon-area')?.classList.add('vq-battle-stage');
    }

    function pulse(target, className, duration) {
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        if (!el) return;
        el.classList.remove(className);
        void el.offsetWidth;
        el.classList.add(className);
        window.setTimeout(() => el.classList.remove(className), duration);
    }

    function impact(target) {
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        const stage = el?.closest('.mon-area');
        if (!stage) return;
        const mark = document.createElement('span');
        mark.className = 'vq-battle-impact';
        stage.appendChild(mark);
        window.setTimeout(() => mark.remove(), 520);
    }

    window.VQBattleMonster = {
        mount,
        hurt(target) { impact(target); pulse(target, 'is-hurt', 520); },
        attack(target) { pulse(target, 'is-attacking', 760); },
        enrage(target, active) {
            const el = typeof target === 'string' ? document.querySelector(target) : target;
            el?.classList.toggle('is-enraged', Boolean(active));
        },
        defeat(target) { pulse(target, 'is-defeated', 900); }
    };
})();
