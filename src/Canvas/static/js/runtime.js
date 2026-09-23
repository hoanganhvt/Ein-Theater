import { api } from './api.js';

function banner() {
    let element = document.getElementById('pythonRuntimeBanner');
    if (element) return element;
    element = document.createElement('aside');
    element.id = 'pythonRuntimeBanner';
    element.className = 'python-runtime-banner';
    element.hidden = true;
    element.innerHTML = '<span></span><button type="button">Configure Python</button>';
    element.querySelector('button').addEventListener('click', configurePython);
    document.body.appendChild(element);
    return element;
}

function render(status) {
    const element = banner();
    element.hidden = !!status.available;
    element.querySelector('span').textContent = status.available
        ? ''
        : 'Python 3 with PyTorch is unavailable. Canvas editing still works, but shape inference and model generation are paused.';
}

export async function configurePython() {
    try {
        let path = '';
        if (window.einDesktop?.selectPythonExecutable) {
            path = await window.einDesktop.selectPythonExecutable();
        } else {
            path = window.prompt('Path to python executable:') || '';
        }
        if (!path) return;
        render(await api.setPython(path));
    } catch (error) {
        window.alert('Python configuration failed: ' + error.message);
        render({ available: false });
    }
}

export async function initPythonRuntime() {
    try {
        render(await api.pythonStatus());
    } catch (error) {
        render({ available: false, error: error.message });
    }
}
