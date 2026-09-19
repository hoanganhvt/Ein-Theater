let openMenu = null;
const bar = document.getElementById('studioMenubar');

function closeMenu(restoreFocus = false) {
    if (!openMenu) return;
    const button = openMenu.querySelector('.menu-btn');
    openMenu.querySelector('.menu-dropdown-content')?.classList.remove('open');
    button?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button?.focus();
    openMenu = null;
}

function openDropdown(wrapper) {
    if (openMenu === wrapper) { closeMenu(true); return; }
    closeMenu();
    openMenu = wrapper;
    wrapper.querySelector('.menu-dropdown-content')?.classList.add('open');
    wrapper.querySelector('.menu-btn')?.setAttribute('aria-expanded', 'true');
    if (wrapper.querySelector('#editMenuDropdown')) window.refreshHistory?.();
    window.updateClipboardUI?.();
}

if (bar) {
    bar.addEventListener('click', event => {
        const button = event.target.closest('.menu-btn');
        if (button) { openDropdown(button.closest('.menu-dropdown')); return; }
        const item = event.target.closest('[data-command]');
        if (!item || item.disabled) return;
        const actions = {
            'open-folder': () => window.openSelectFolderModal?.(),
            save: () => window.saveActiveModel?.(),
            undo: () => window.undoCanvas?.(),
            redo: () => window.redoCanvas?.(),
            cut: () => window.cutSelection?.(),
            copy: () => window.copySelection?.(),
            paste: () => window.pasteClipboard?.(),
            'select-all': () => window.selectAllNodes?.(),
            clear: () => window.clearGraph?.()
        };
        closeMenu();
        actions[item.dataset.command]?.();
    });
    document.addEventListener('pointerdown', event => { if (!bar.contains(event.target)) closeMenu(); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && openMenu) { event.preventDefault(); closeMenu(true); return; }
        if (!openMenu) return;
        const items = [...openMenu.querySelectorAll('.menu-dropdown-content button:not(:disabled)')];
        const index = items.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            const menus = [...bar.querySelectorAll('.menu-dropdown')];
            const next = (menus.indexOf(openMenu) + (event.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length;
            openDropdown(menus[next]);
            menus[next].querySelector('.menu-btn')?.focus();
        }
    });
}
