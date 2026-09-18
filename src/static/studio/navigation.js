// Shared mode navigation depends only on the studio registry, never on Canvas.
export async function initModeNavigation() {
    const tabs = document.getElementById('appModeTabs');
    if (!tabs) return;
    try {
        const response = await fetch('/api/modes');
        if (!response.ok) throw new Error(`Mode registry: HTTP ${response.status}`);
        const modes = await response.json();
        const active = document.body.dataset.studioMode;
        const buttons = modes.map(mode => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'mode-tab';
            button.dataset.mode = mode.id;
            button.textContent = mode.name;
            button.disabled = !mode.available;
            button.classList.toggle('active', mode.id === active);
            button.classList.toggle('disabled', !mode.available);
            button.title = mode.available ? `Open ${mode.name}` : `${mode.name} (Coming Soon)`;
            if (mode.id === active) button.setAttribute('aria-current', 'page');
            if (mode.available) button.addEventListener('click', () => {
                if (mode.id !== active) window.location.assign(mode.url);
            });
            return button;
        });
        tabs.replaceChildren(...buttons);
    } catch (error) {
        console.error('Unable to load studio modes:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModeNavigation);
} else {
    void initModeNavigation();
}
