// ── HTML Escaping Utility ───────────────────────────────────────
export function esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Model Name Sanitization ─────────────────────────────────────────
// - If the model name has space, replace space with _
// - If the model name has number before the text, add the word model_ infront of it
export function fixModelName(name) {
    if (!name || !String(name).trim()) return 'model';
    let s = String(name).trim();

    // 1. If the model name has space, replace space with _
    if (s.includes(' ')) {
        s = s.replace(/ /g, '_');
    }

    // 2. If the model name has number before the text, add the word model_ infront of it
    let hasNumBefore = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c >= '0' && c <= '9') {
            hasNumBefore = true;
            break;
        }
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
            break;
        }
    }
    if (hasNumBefore) {
        s = 'model_' + s;
    }

    // Clean any invalid characters (keep Latin alphanumeric and underscore)
    s = s.replace(/[^a-zA-Z0-9_]/g, '_');
    if (!s || !/^[a-zA-Z]/.test(s)) {
        s = 'model_' + s.replace(/^_+/, '');
        if (s === 'model_') s = 'model';
    }
    return s;
}

