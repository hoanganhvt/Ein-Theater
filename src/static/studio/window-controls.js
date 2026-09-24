// The desktop shell owns window actions; browser development keeps its native chrome.
export function mountWindowControls() {
    const bridge = window.einDesktop?.windowControls;
    const bar = document.getElementById('studioMenubar');
    if (!bridge || !bar || bar.querySelector('.window-controls')) return;

    document.body.classList.add('desktop-app');
    const dragRegion = document.createElement('div');
    dragRegion.className = 'window-drag-region';
    dragRegion.setAttribute('aria-hidden', 'true');
    const modeLabel = bar.querySelector('.studio-current-mode');
    bar.insertBefore(dragRegion, modeLabel);

    const controls = document.createElement('div');
    controls.className = 'window-controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Window controls');
    controls.innerHTML = `
        <button type="button" class="window-control" data-window-action="minimize" aria-label="Minimize" title="Minimize">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5h10" /></svg>
        </button>
        <button type="button" class="window-control" data-window-action="maximize" aria-label="Maximize" title="Maximize">
            <svg class="maximize-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx=".5" /></svg>
            <svg class="restore-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4.5V3h7.5v7.5h-1.5M3 5.5h7.5V13H3z" /></svg>
        </button>
        <button type="button" class="window-control window-control-close" data-window-action="close" aria-label="Close" title="Close">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
        </button>`;
    bar.appendChild(controls);

    const maximizeButton = controls.querySelector('[data-window-action="maximize"]');
    const updateMaximized = maximized => {
        maximizeButton.classList.toggle('is-maximized', maximized);
        const label = maximized ? 'Restore' : 'Maximize';
        maximizeButton.setAttribute('aria-label', label);
        maximizeButton.title = label;
    };
    controls.querySelector('[data-window-action="minimize"]').addEventListener('click', () => bridge.minimize());
    maximizeButton.addEventListener('click', () => bridge.toggleMaximize().then(updateMaximized));
    controls.querySelector('[data-window-action="close"]').addEventListener('click', () => bridge.close());
    bridge.onMaximizeChange(updateMaximized);
    void bridge.isMaximized().then(updateMaximized);
}
