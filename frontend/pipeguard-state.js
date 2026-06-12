// === PipeGuard AI — Shared State Module ===
// All pages import this to read/write the unified detection event log.

const PipeGuard = (() => {
    const STORAGE_KEY = 'pipeguard_events';
    const SETTINGS_KEY = 'pipeguard_settings';
    const MAX_EVENTS = 500;
    const BACKEND_URL_DEFAULT = 'http://127.0.0.1:8000';

    // ── Audio context for alert sounds ─────────────────────────────
    let audioCtx = null;
    function playAlertSound(type) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            if (type === 'CRITICAL') {
                osc.frequency.value = 880;
                gain.gain.value = 0.3;
            } else if (type === 'WARNING') {
                osc.frequency.value = 660;
                gain.gain.value = 0.2;
            } else {
                return; // no sound for NORMAL
            }
            osc.type = 'square';
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
        } catch (e) { /* audio not available */ }
    }

    // ── Event Log CRUD ─────────────────────────────────────────────
    function getEvents() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch { return []; }
    }

    function saveEvents(events) {
        // FIFO: keep only last MAX_EVENTS
        if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    }

    function addEvent(label, confidence, scores) {
        const events = getEvents();
        events.push({
            timestamp: new Date().toISOString(),
            label,
            confidence: parseFloat(confidence.toFixed(4)),
            scores: scores || {}
        });
        saveEvents(events);

        // Alert sound
        const settings = getSettings();
        if (settings.soundEnabled !== false) {
            if (label === 'LEAKAGE') playAlertSound('CRITICAL');
            else if (label === 'CORROSION') playAlertSound('WARNING');
        }
    }

    function clearEvents() {
        localStorage.removeItem(STORAGE_KEY);
    }

    // ── Computed Stats ─────────────────────────────────────────────
    function getStats() {
        const events = getEvents();
        const total = events.length;
        if (total === 0) {
            return {
                total: 0,
                corrosion: 0, leakage: 0, normal: 0,
                corrosionPct: 0, leakagePct: 0, normalPct: 0,
                avgConfidence: 0,
                activeAlerts: 0,
                recentEvents: [],
                todayDetections: 0,
                healthPct: 100
            };
        }

        let corrosion = 0, leakage = 0, normal = 0;
        let confSum = 0;
        events.forEach(e => {
            if (e.label === 'CORROSION') corrosion++;
            else if (e.label === 'LEAKAGE') leakage++;
            else normal++;
            confSum += e.confidence;
        });

        // Active alerts = corrosion/leakage in last 5 minutes
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        const activeAlerts = events.filter(e =>
            (e.label === 'CORROSION' || e.label === 'LEAKAGE') &&
            new Date(e.timestamp).getTime() > fiveMinAgo
        ).length;

        // Today's detections
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayDetections = events.filter(e =>
            (e.label === 'CORROSION' || e.label === 'LEAKAGE') &&
            new Date(e.timestamp).getTime() > todayStart.getTime()
        ).length;

        const healthPct = total > 0 ? ((normal / total) * 100) : 100;

        return {
            total,
            corrosion, leakage, normal,
            corrosionPct: total > 0 ? ((corrosion / total) * 100).toFixed(1) : 0,
            leakagePct: total > 0 ? ((leakage / total) * 100).toFixed(1) : 0,
            normalPct: total > 0 ? ((normal / total) * 100).toFixed(1) : 0,
            avgConfidence: (confSum / total).toFixed(3),
            activeAlerts,
            recentEvents: events.slice(-20).reverse(),
            todayDetections,
            healthPct: healthPct.toFixed(1)
        };
    }

    // Get alerts (corrosion/leakage events)
    function getAlerts(limit = 10) {
        return getEvents()
            .filter(e => e.label === 'CORROSION' || e.label === 'LEAKAGE')
            .slice(-limit)
            .reverse();
    }

    // Get hourly histogram for chart (last 24h)
    function getHourlyHistogram() {
        const events = getEvents();
        const now = Date.now();
        const hours = Array.from({ length: 24 }, (_, i) => {
            const h = new Date(now - (23 - i) * 3600000);
            return { hour: h.getHours(), normal: 0, corrosion: 0, leakage: 0 };
        });

        events.forEach(e => {
            const t = new Date(e.timestamp).getTime();
            const age = now - t;
            if (age > 24 * 3600000) return;
            const idx = 23 - Math.floor(age / 3600000);
            if (idx >= 0 && idx < 24) {
                if (e.label === 'NORMAL') hours[idx].normal++;
                else if (e.label === 'CORROSION') hours[idx].corrosion++;
                else if (e.label === 'LEAKAGE') hours[idx].leakage++;
            }
        });
        return hours;
    }

    // ── Settings ───────────────────────────────────────────────────
    function getSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            return raw ? JSON.parse(raw) : { backendUrl: BACKEND_URL_DEFAULT, soundEnabled: true, confidenceThreshold: 0.6 };
        } catch { return { backendUrl: BACKEND_URL_DEFAULT, soundEnabled: true, confidenceThreshold: 0.6 }; }
    }

    function saveSettings(settings) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function getBackendUrl() {
        return getSettings().backendUrl || BACKEND_URL_DEFAULT;
    }

    // ── Backend Health ─────────────────────────────────────────────
    async function checkBackend() {
        try {
            const resp = await fetch(getBackendUrl() + '/health', { signal: AbortSignal.timeout(3000) });
            if (resp.ok) return await resp.json();
            return null;
        } catch { return null; }
    }

    // ── CSV Export ──────────────────────────────────────────────────
    function exportCSV() {
        const events = getEvents();
        if (events.length === 0) { alert('No events to export.'); return; }
        let csv = 'Timestamp,Label,Confidence,Corrosion_Score,Leakage_Score,Normal_Score\n';
        events.forEach(e => {
            csv += `${e.timestamp},${e.label},${e.confidence},${(e.scores && e.scores.CORROSION) || ''},${(e.scores && e.scores.LEAKAGE) || ''},${(e.scores && e.scores.NORMAL) || ''}\n`;
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pipeguard_log_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Time formatting helper ─────────────────────────────────────
    function timeAgo(isoStr) {
        const diff = Date.now() - new Date(isoStr).getTime();
        const sec = Math.floor(diff / 1000);
        if (sec < 60) return sec + 's ago';
        const min = Math.floor(sec / 60);
        if (min < 60) return min + ' min ago';
        const hr = Math.floor(min / 60);
        if (hr < 24) return hr + 'h ago';
        return Math.floor(hr / 24) + 'd ago';
    }

    // Public API
    return {
        addEvent,
        getEvents,
        clearEvents,
        getStats,
        getAlerts,
        getHourlyHistogram,
        getSettings,
        saveSettings,
        getBackendUrl,
        checkBackend,
        exportCSV,
        timeAgo,
        playAlertSound
    };
})();
