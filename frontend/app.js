// === PipeGuard AI - Main Application JS ===
// Shared logic loaded by ALL pages. Uses PipeGuard state module.

// Live Clock
function updateClock() {
    const el = document.getElementById('liveClock');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' }) + ' UTC';
}
setInterval(updateClock, 1000);
updateClock();

// Sidebar Toggle (mobile)
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== menuToggle) {
            sidebar.classList.remove('open');
        }
    });
}

// Toggle Switches
document.querySelectorAll('.toggle-switch').forEach(el => {
    el.addEventListener('click', () => el.classList.toggle('on'));
});

// ── Detection History Chart (data-driven) ──────────────────────────
function drawDetectionChart() {
    const canvas = document.getElementById('historyCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;

    // Get REAL data from state
    const histogram = (typeof PipeGuard !== 'undefined') ? PipeGuard.getHourlyHistogram() : [];
    const hours = histogram.map((_, i) => {
        const hr = new Date(Date.now() - (23 - i) * 3600000).getHours();
        return String(hr).padStart(2, '0') + ':00';
    });
    const normal = histogram.map(h => h.normal);
    const corrosion = histogram.map(h => h.corrosion);
    const leakage = histogram.map(h => h.leakage);

    // Fallback if no data yet — show zero lines
    if (histogram.length === 0) {
        for (let i = 0; i < 24; i++) {
            normal.push(0); corrosion.push(0); leakage.push(0);
            hours.push(String(i).padStart(2, '0') + ':00');
        }
    }

    const maxVal = Math.max(...normal, ...corrosion, ...leakage, 5) + 2;
    const padL = 40, padR = 16, padT = 16, padB = 32;
    const chartW = w - padL - padR, chartH = h - padT - padB;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(132,148,149,0.15)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
        const y = padT + (chartH / 5) * i;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
        ctx.fillStyle = '#849495'; ctx.font = '10px Space Grotesk'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxVal - (maxVal / 5) * i), padL - 6, y + 3);
    }
    // X labels
    ctx.fillStyle = '#849495'; ctx.font = '9px Space Grotesk'; ctx.textAlign = 'center';
    for (let i = 0; i < hours.length; i += 4) {
        const x = padL + (chartW / (hours.length - 1)) * i;
        ctx.fillText(hours[i], x, h - 6);
    }

    // Draw area + line
    function drawLine(data, color, fillAlpha) {
        if (data.length < 2) return;
        ctx.beginPath();
        data.forEach((v, i) => {
            const x = padL + (chartW / (data.length - 1)) * i;
            const y = padT + chartH - (v / maxVal) * chartH;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
        // Fill
        ctx.lineTo(padL + chartW, padT + chartH);
        ctx.lineTo(padL, padT + chartH);
        ctx.closePath();
        ctx.fillStyle = color.replace('1)', fillAlpha + ')');
        ctx.fill();
    }
    drawLine(normal, 'rgba(0,255,136,1)', '0.08');
    drawLine(corrosion, 'rgba(255,140,0,1)', '0.06');
    drawLine(leakage, 'rgba(255,68,68,1)', '0.04');

    // Legend
    const legends = [{c:'#00ff88',l:'Normal'},{c:'#ff8c00',l:'Corrosion'},{c:'#ff4444',l:'Leakage'}];
    let lx = w - padR - 200;
    legends.forEach(({c, l}) => {
        ctx.fillStyle = c; ctx.fillRect(lx, 6, 10, 10);
        ctx.fillStyle = '#b9cacb'; ctx.font = '10px Inter'; ctx.textAlign = 'left';
        ctx.fillText(l, lx + 14, 15); lx += 70;
    });
}

// ── Dashboard live update ──────────────────────────────────────────
function updateDashboardFromState() {
    if (typeof PipeGuard === 'undefined') return;
    const stats = PipeGuard.getStats();

    // Metric cards
    const sensors = document.getElementById('activeSensors');
    if (sensors) sensors.textContent = stats.total.toLocaleString();

    const precision = document.getElementById('aiPrecision');
    if (precision) precision.textContent = (stats.avgConfidence * 100).toFixed(1) + '%';

    const alertsEl = document.getElementById('activeAlerts');
    if (alertsEl) alertsEl.textContent = stats.activeAlerts;

    const healthEl = document.getElementById('systemHealth');
    if (healthEl) {
        if (stats.activeAlerts > 3) healthEl.textContent = 'CRITICAL';
        else if (stats.activeAlerts > 0) healthEl.textContent = 'WARNING';
        else healthEl.textContent = 'OPTIMAL';
    }

    // Notification badge
    const badge = document.querySelector('.notif-badge');
    if (badge) badge.textContent = stats.activeAlerts;

    // Health ring
    const ringValue = document.querySelector('.ring-value');
    if (ringValue) ringValue.textContent = stats.healthPct + '%';
    const ringText = document.querySelector('.ring-text');
    if (ringText) {
        const hp = parseFloat(stats.healthPct);
        ringText.textContent = hp > 90 ? 'Healthy' : hp > 70 ? 'Warning' : 'Critical';
    }
    const ringFill = document.getElementById('healthRing');
    if (ringFill) {
        const pct = parseFloat(stats.healthPct) / 100;
        const circumference = 2 * Math.PI * 52; // r=52
        ringFill.setAttribute('stroke-dashoffset', circumference * (1 - pct));
    }

    // Condition breakdown
    const condItems = document.querySelectorAll('.condition-item .condition-value');
    if (condItems.length >= 3) {
        condItems[0].textContent = stats.normalPct + '%';
        condItems[1].textContent = stats.corrosionPct + '%';
        condItems[2].textContent = stats.leakagePct + '%';
    }

    // Metric trends
    const sensorsTrend = document.getElementById('sensorsTrend');
    if (sensorsTrend) sensorsTrend.innerHTML = `<span class="material-icons-outlined">trending_up</span> ${stats.total} total`;
    const precisionTrend = document.getElementById('precisionTrend');
    if (precisionTrend) precisionTrend.innerHTML = `<span class="material-icons-outlined">trending_up</span> live`;
    const alertsTrend = document.getElementById('alertsTrend');
    if (alertsTrend) alertsTrend.innerHTML = `<span class="material-icons-outlined">trending_down</span> last 5 min`;
    const healthTrend = document.getElementById('healthTrend');
    if (healthTrend) healthTrend.innerHTML = `<span class="material-icons-outlined">check_circle</span> ${stats.normalPct}% normal`;

    // Critical Alerts list
    const alertsList = document.getElementById('alertsList');
    if (alertsList) {
        const alerts = PipeGuard.getAlerts(5);
        if (alerts.length === 0) {
            alertsList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--outline);font-size:13px;">No alerts detected yet. Start the camera on the Live Feed page.</div>';
        } else {
            alertsList.innerHTML = alerts.map(a => {
                const sev = a.label === 'LEAKAGE' ? 'critical' : 'warning';
                const icon = a.label === 'LEAKAGE' ? 'error' : 'build';
                const title = a.label === 'LEAKAGE' ? 'Leakage Detected' : 'Corrosion Warning';
                return `<div class="alert-item ${sev}">
                    <div class="alert-icon"><span class="material-icons-outlined">${icon}</span></div>
                    <div class="alert-content">
                        <h4>${title}</h4>
                        <p>Confidence: ${(a.confidence * 100).toFixed(1)}%</p>
                        <span class="alert-time">${PipeGuard.timeAgo(a.timestamp)}</span>
                    </div>
                    <span class="alert-severity ${sev}">${sev.toUpperCase()}</span>
                </div>`;
            }).join('');
        }
    }

    // Recent Activity timeline
    const activityTimeline = document.querySelector('.activity-timeline');
    if (activityTimeline && document.querySelector('.activity-card')) {
        const recent = stats.recentEvents.slice(0, 5);
        if (recent.length === 0) {
            activityTimeline.innerHTML = '<div style="text-align:center;padding:20px;color:var(--outline);font-size:13px;">No activity yet.</div>';
        } else {
            activityTimeline.innerHTML = recent.map(e => {
                const dotClass = e.label === 'NORMAL' ? 'success' : e.label === 'CORROSION' ? 'warning' : 'info';
                const title = e.label === 'NORMAL' ? 'Normal Scan' : e.label === 'CORROSION' ? 'Corrosion Detected' : 'Leakage Alert';
                return `<div class="timeline-item">
                    <div class="timeline-dot ${dotClass}"></div>
                    <div class="timeline-content">
                        <h4>${title}</h4>
                        <p>Confidence: ${(e.confidence * 100).toFixed(1)}%</p>
                        <span class="timeline-time">${PipeGuard.timeAgo(e.timestamp)}</span>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // Predictive Insight (dynamic)
    const insightMsg = document.querySelector('.insight-message');
    if (insightMsg) {
        if (stats.activeAlerts > 0) {
            insightMsg.innerHTML = `<p><strong>${stats.activeAlerts} active alert(s)</strong> detected in the last 5 minutes. 
                Corrosion: <strong>${stats.corrosion}</strong> | Leakage: <strong>${stats.leakage}</strong></p>
                <p class="insight-warning">System health at <span class="${parseFloat(stats.healthPct) < 80 ? 'highlight-red' : ''}">${stats.healthPct}%</span>. 
                ${parseFloat(stats.healthPct) < 80 ? 'Immediate inspection recommended.' : 'Continue monitoring.'}</p>`;
        } else {
            insightMsg.innerHTML = `<p>All systems operating within normal parameters. <strong>${stats.total}</strong> total detections recorded.</p>
                <p>System health: <strong style="color:var(--secondary)">${stats.healthPct}%</strong>. No immediate action required.</p>`;
        }
    }

    // Redraw chart with live data
    drawDetectionChart();
}

// Anomaly feed live pulse
function pulseAnomalyItems() {
    document.querySelectorAll('.anomaly-item').forEach((item, i) => {
        item.style.animation = `fadeSlideIn 0.4s ease ${i * 0.1}s both`;
    });
}

// Init
window.addEventListener('DOMContentLoaded', () => {
    drawDetectionChart();
    pulseAnomalyItems();

    // Start dashboard auto-refresh if on dashboard page
    if (document.getElementById('metricsSection')) {
        updateDashboardFromState();
        setInterval(updateDashboardFromState, 2000);
    }
});
window.addEventListener('resize', drawDetectionChart);

// Fade-in animation keyframes (injected)
const style = document.createElement('style');
style.textContent = `@keyframes fadeSlideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`;
document.head.appendChild(style);
