// ── File Menu ─────────────────────────────────────────────────────

export function toggleFileMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('fileMenuDropdown');
    const btn = document.getElementById('fileMenuBtn');
    if (!menu) return;

    const isOpen = menu.classList.contains('open');
    if (isOpen) {
        closeFileMenu();
    } else {
        menu.classList.add('open');
        if (btn) btn.classList.add('active');
    }
}

export function closeFileMenu() {
    const menu = document.getElementById('fileMenuDropdown');
    const btn = document.getElementById('fileMenuBtn');
    if (menu) menu.classList.remove('open');
    if (btn) btn.classList.remove('active');
}
