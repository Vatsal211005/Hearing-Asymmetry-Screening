// script.js (fixed scrolling + cross-browser timeouts + small UI fixes)
let currentScreen = 'login';
const testFrequencies = [250, 500, 1000, 2000, 4000, 5000];
let userId = null;
let calibrationVolume = 0.3;
const debugMode = true;
let userName = '';
let userSurname = '';

function logDebug(message) {
    if (debugMode) console.log(`[DEBUG] ${message}`);
}

/* -----------------------
   Small utility: fetch with timeout (cross-browser)
   ----------------------- */
function fetchWithTimeout(resource, options = {}) {
    const { timeout = 7000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    return fetch(resource, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(id));
}

/* -----------------------
   UI helpers
   ----------------------- */
function showScreen(screenId) {
    const scrollableScreens = ['testing', 'results']; // screens that should scroll
    document.querySelectorAll('#main-frame > section').forEach(sec => sec.classList.add('hidden'));
    const el = document.getElementById(screenId + '-screen') || document.getElementById(screenId);
    if (el) el.classList.remove('hidden');
    currentScreen = screenId;
    logDebug(`Switched to screen: ${screenId}`);

    // handle scrolling
    const mainFrame = document.getElementById('main-frame');
    if (!mainFrame) return;
    if (scrollableScreens.includes(screenId)) {
        mainFrame.classList.add('scrollable');
    } else {
        mainFrame.classList.remove('scrollable');
    }
}


function toggleLoader(show) {
    const ov = document.getElementById('loader-overlay');
    if (!ov) return;
    ov.classList.toggle('hidden', !show);
}

/* Set ear active visuals */
function setActiveEar(ear) {
    const left = document.getElementById('left-ear-icon');
    const right = document.getElementById('right-ear-icon');
    if (!left || !right) return;
    if (ear === 'left') {
        left.classList.add('ear-active'); left.classList.remove('ear-inactive');
        right.classList.add('ear-inactive'); right.classList.remove('ear-active');
    } else if (ear === 'right') {
        right.classList.add('ear-active'); right.classList.remove('ear-inactive');
        left.classList.add('ear-inactive'); left.classList.remove('ear-active');
    } else {
        left.classList.add('ear-inactive'); left.classList.remove('ear-active');
        right.classList.add('ear-inactive'); right.classList.remove('ear-active');
    }
}

/* -----------------------
   Audio playback (server)
   ----------------------- */
function playServerTone(params) {
    const url = new URL('/tone', window.location);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v.toString()));
    logDebug(`Playing tone: ${JSON.stringify(params)}`);
    return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.volume = Math.max(0, Math.min(1, calibrationVolume * (params.volume ?? 1)));
        audio.onended = () => {
            logDebug('Audio playback ended');
            resolve();
        };
        const baseDuration = parseFloat(params.duration || 0.35) * 1000;
        const fallbackMs = baseDuration + (params.freq <= 500 ? 300 : 150);
        const fallback = setTimeout(() => {
            try { audio.pause(); } catch (e) {}
            logDebug('Audio playback fallback triggered');
            resolve();
        }, fallbackMs + 200);

        audio.play().then(() => {
            logDebug('Audio playback started');
        }).catch(err => {
            console.error('Audio playback error:', err);
            clearTimeout(fallback);
            // resolve after fallback to keep flow moving
            setTimeout(() => resolve(), fallbackMs + 200);
        });
    });
}

async function playTestTone(freq, channel, levelDb) {
    // levelDb -> relative amplitude mapping (preserve original calculation)
    const amplitude = Math.pow(10, (levelDb - 40) / 20);
    const duration = 0.35;
    setActiveEar(channel);
    await playServerTone({ freq: freq, duration: duration, volume: amplitude, channel: channel });
    const earEl = channel === 'left' ? document.getElementById('left-ear-icon') : document.getElementById('right-ear-icon');
    if (earEl) {
        earEl.animate([{ transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
    }
}

/* Channel test button (device check) */
function playChannelTest(channel) {
    const status = document.getElementById('channel-status');
    if (status) {
        status.textContent = `Playing in ${channel.toUpperCase()} ear — listen...`;
        status.style.color = channel === 'left' ? '#3b2f2f' : '#7a5a4a';
    }
    setActiveEar(channel);
    playServerTone({ freq: 1000, duration: 0.7, volume: 0.6, channel: channel })
        .then(() => setTimeout(() => {
            if (status) status.textContent = '';
            setActiveEar(null);
        }, 400));
}

/* -----------------------
   Event listeners (wiring)
   ----------------------- */
document.addEventListener('DOMContentLoaded', () => {
    // attach listeners to elements that might exist in markup
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', onSubmitRegistration);

    // demo button (preview) and start button (real start)
    const demoBtn = document.getElementById('demo-btn');
    if (demoBtn) demoBtn.addEventListener('click', () => showScreen('consent'));

    // start button in welcome screen
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.addEventListener('click', () => showScreen('consent'));

    const agreeBtn = document.getElementById('agree-btn');
    if (agreeBtn) agreeBtn.addEventListener('click', () => showScreen('device-check'));

    const backWelcomeBtn = document.getElementById('back-welcome-btn');
    if (backWelcomeBtn) backWelcomeBtn.addEventListener('click', () => showScreen('welcome'));

    const leftBtn = document.getElementById('left-ear-btn');
    if (leftBtn) leftBtn.addEventListener('click', () => playChannelTest('left'));
    const rightBtn = document.getElementById('right-ear-btn');
    if (rightBtn) rightBtn.addEventListener('click', () => playChannelTest('right'));

    const headphonesReady = document.getElementById('headphones-ready-btn');
    if (headphonesReady) headphonesReady.addEventListener('click', () => showScreen('calibration'));
    const backConsentBtn = document.getElementById('back-consent-btn');
    if (backConsentBtn) backConsentBtn.addEventListener('click', () => showScreen('consent'));

    const playToneBtn = document.getElementById('play-tone-btn');
    if (playToneBtn) playToneBtn.addEventListener('click', () => playServerTone({ freq: 1000, duration: 1.0, volume: 1.0, channel: 'both' }));

    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) volumeSlider.addEventListener('input', (e) => {
        calibrationVolume = parseFloat(e.target.value);
        logDebug(`Volume set to: ${calibrationVolume}`);
    });

    const volumeSetBtn = document.getElementById('volume-set-btn');
    if (volumeSetBtn) volumeSetBtn.addEventListener('click', () => showScreen('instructions'));

    const backDeviceBtn = document.getElementById('back-device-btn');
    if (backDeviceBtn) backDeviceBtn.addEventListener('click', () => showScreen('device-check'));

    const startTestBtn = document.getElementById('start-test-btn');
    if (startTestBtn) startTestBtn.addEventListener('click', startHearingTest);

    const backCalibrationBtn = document.getElementById('back-calibration-btn');
    if (backCalibrationBtn) backCalibrationBtn.addEventListener('click', () => showScreen('calibration'));

    const tryAgainBtn = document.getElementById('try-again-btn');
    if (tryAgainBtn) tryAgainBtn.addEventListener('click', restartTest);

    document.querySelectorAll('#exit-btn, #exit-test-early').forEach(b => {
        if (b) b.addEventListener('click', () => location.reload());
    });

    const downloadBtn = document.getElementById('download-results-btn');
    if (downloadBtn) downloadBtn.addEventListener('click', downloadResults);

    const yesBtn = document.getElementById('yes-btn');
    const noBtn = document.getElementById('no-btn');
    if (yesBtn) yesBtn.addEventListener('click', () => submitResponse(true));
    if (noBtn) noBtn.addEventListener('click', () => submitResponse(false));

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (confirm('Sure you want to exit?')) showScreen('welcome');
        } else if (event.key === ' ' && (currentScreen === 'welcome' || currentScreen === 'login')) {
            showScreen('consent');
        }
    });

    setActiveEar(null);
});

/* -----------------------
   Registration
   ----------------------- */
async function onSubmitRegistration(e) {
    e.preventDefault();
    userName = document.getElementById('name')?.value || '';
    userSurname = document.getElementById('surname')?.value || '';
    const data = {
        name: userName,
        surname: userSurname,
        age_group: document.querySelector('input[name="age_group"]:checked')?.value || null,
        gender: document.querySelector('input[name="gender"]:checked')?.value || null
    };
    logDebug('Submitting registration form');
    toggleLoader(true);
    try {
        const response = await fetchWithTimeout('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            timeout: 6000
        });
        if (!response.ok) throw new Error(`Registration failed: ${response.statusText}`);
        const result = await response.json();
        userId = result.user_id;
        if (!userId) throw new Error('No user ID returned from server');
        logDebug(`User registered: ID=${userId}`);
        showScreen('welcome');
    } catch (err) {
        console.error('Registration error:', err);
        alert('Failed to register user. Please try again.');
    } finally {
        toggleLoader(false);
    }
}

/* -----------------------
   Start test / run test
   ----------------------- */
async function startHearingTest() {
    if (!userId) {
        alert('User ID is missing. Please restart the test.');
        showScreen('login');
        return;
    }
    logDebug(`Starting test for user ID=${userId}`);
    showScreen('testing');
    toggleLoader(true);
    try {
        const response = await fetchWithTimeout('/start_test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId }),
            timeout: 7000
        });
        if (!response.ok) throw new Error(`Start test failed: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        logDebug(`Test started: ${JSON.stringify(data)}`);
        toggleLoader(false);
        await runTest(data);
    } catch (err) {
        toggleLoader(false);
        console.error('Start test error:', err);
        alert(`Failed to start test: ${err.message}. Please try again.`);
        showScreen('welcome');
    }
}

async function runTest(testData) {
    logDebug(`Running test: ${JSON.stringify(testData)}`);
    document.getElementById('progress-bar').value = testData.progress ?? 0;
    document.getElementById('progress-label').textContent = `${Math.round(testData.progress ?? 0)}%`;
    document.getElementById('status-label').textContent = `Testing ${testData.freq} Hz`;
    document.getElementById('test-info').textContent = `Test ${testData.test_number}/${testData.total_tests} ⚡`;

    const currentEar = testData.ear;
    setActiveEar(currentEar);

    const responseStatus = document.getElementById('response-status');
    if (responseStatus) responseStatus.textContent = 'Playing tone...';
    const yesBtn = document.getElementById('yes-btn');
    const noBtn = document.getElementById('no-btn');
    if (yesBtn) yesBtn.disabled = true;
    if (noBtn) noBtn.disabled = true;

    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
        try {
            await playTestTone(testData.freq, testData.ear, testData.level ?? 40);
            if (responseStatus) responseStatus.textContent =
                `Freq: ${testData.freq} Hz | Level: ${testData.level ?? 40} dB HL — Did you hear it?`;
            if (yesBtn) yesBtn.disabled = false;
            if (noBtn) noBtn.disabled = false;
            logDebug('Tone played, buttons enabled');
            return;
        } catch (err) {
            attempts++;
            console.error(`Tone playback error (attempt ${attempts}):`, err);
            if (attempts === maxAttempts) {
                console.error('Max playback attempts reached');
                alert('Error playing tone after multiple attempts. Please try again or restart the test.');
                if (responseStatus) responseStatus.textContent = 'Error playing tone. Please try again.';
                if (yesBtn) yesBtn.disabled = false;
                if (noBtn) noBtn.disabled = false;
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}

/* -----------------------
   Submit response and next test
   ----------------------- */
async function submitResponse(heard) {
    if (!userId) {
        alert('User ID is missing. Please restart the test.');
        showScreen('login');
        return;
    }

    logDebug(`Submitting response: heard=${heard}`);
    const responseStatus = document.getElementById('response-status');
    if (responseStatus) responseStatus.textContent = 'Submitting response...';
    const yesBtn = document.getElementById('yes-btn');
    const noBtn = document.getElementById('no-btn');
    if (yesBtn) yesBtn.disabled = true;
    if (noBtn) noBtn.disabled = true;

    toggleLoader(true);
    try {
        const response = await fetchWithTimeout('/submit_response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, heard: heard }),
            timeout: 6000
        });
        if (!response.ok) throw new Error(`Submit response failed: ${response.statusText}`);
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        logDebug('Response submitted successfully');

        const nextTest = await fetchWithTimeout(`/next_test?user_id=${userId}`, { timeout: 6000 });
        if (!nextTest.ok) throw new Error(`Next test failed: ${nextTest.statusText}`);
        const testData = await nextTest.json();
        if (testData.error) throw new Error(testData.error);
        logDebug(`Next test data: ${JSON.stringify(testData)}`);

        toggleLoader(false);
        if (testData.completed) {
            logDebug('Test completed, showing results');
            showResultsScreen(testData);
        } else {
            setTimeout(() => runTest(testData), 150);
        }
    } catch (err) {
        toggleLoader(false);
        console.error('Submit response error:', err);
        alert(`Error: ${err.message}. Please try again or restart the test.`);
        if (yesBtn) yesBtn.disabled = false;
        if (noBtn) noBtn.disabled = false;
        if (responseStatus) responseStatus.textContent = 'Error submitting response. Please try again.';
    }
}

/* -----------------------
   Download results (canvas)
   ----------------------- */
async function downloadResults() {
    logDebug('Download results button clicked');
    try {
        const canvas = document.getElementById('audiogram-chart');
        const chart = window.__audiogramChart;
        if (!chart || !canvas) throw new Error('Chart not found');

        // Ensure chart has finished rendering (Chart.js v3 renders synchronously, but just in case)
        // create a bigger canvas with header
        const newCanvas = document.createElement('canvas');
        newCanvas.width = canvas.width + 40;
        newCanvas.height = canvas.height + 140;
        const ctx = newCanvas.getContext('2d');

        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);

        // draw existing chart
        ctx.drawImage(canvas, 20, 80, canvas.width, canvas.height);

        // Header (user name + status)
        ctx.font = 'bold 20px Inter, Arial';
        ctx.fillStyle = '#3b2f2f';
        ctx.fillText(`Name: ${userName} ${userSurname}`, 20, 36);

        const statusText = document.getElementById('status-text')?.textContent || '';
        ctx.font = '16px Inter, Arial';
        ctx.fillStyle = statusText.includes('Asymmetry detected') ? '#c0392b' : '#2e7d5e';
        ctx.fillText(statusText, 20, 60);

        // Date
        const date = new Date().toISOString().split('T')[0];
        ctx.fillStyle = '#3b2f2f';
        ctx.fillText(`Date: ${date}`, 20, newCanvas.height - 24);

        const link = document.createElement('a');
        link.download = `Hearing_Test_${(userName||'user')}_${(userSurname||'')}_${date}.png`;
        link.href = newCanvas.toDataURL('image/png');
        link.click();
        logDebug('Results downloaded successfully');
    } catch (err) {
        console.error('Download results error:', err);
        alert('Failed to download results. Please try again.');
    }
}

/* -----------------------
   Results screen and chart
   ----------------------- */
async function showResultsScreen(data) {
    logDebug(`Showing results screen with data: ${JSON.stringify(data)}`);
    showScreen('results');

    const thresholds = data.thresholds || { left: {}, right: {} };
    const leftAvg = (data.left_avg === undefined) ? 0 : data.left_avg;
    const rightAvg = (data.right_avg === undefined) ? 0 : data.right_avg;
    const maxDiff = (data.max_diff === undefined) ? 0 : data.max_diff;

    // Fill numeric results table (ascending order)
    const tbody = document.querySelector('#results-table tbody');
    if (tbody) tbody.innerHTML = '';
    testFrequencies.forEach(freq => {
        const left = thresholds.left[freq] !== undefined ? thresholds.left[freq] : '-';
        const right = thresholds.right[freq] !== undefined ? thresholds.right[freq] : '-';
        const diff = (left !== '-' && right !== '-') ? Math.abs(left - right).toFixed(1) : '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${freq}</td><td>${left}</td><td>${right}</td><td>${diff}</td>`;
        if (tbody) tbody.appendChild(tr);
    });

    // Chart (Chart.js)
    const ctx = document.getElementById('audiogram-chart')?.getContext('2d');
    if (!ctx) return;
    if (window.__audiogramChart) window.__audiogramChart.destroy();

    window.__audiogramChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: testFrequencies,
           datasets: [
    {
        label: 'Left Ear (Blue)',
        data: testFrequencies.map(f => thresholds.left[f] !== undefined ? thresholds.left[f] : null),
        borderColor: '#007bff',
        backgroundColor: '#007bff',
        spanGaps: true,
        tension: 0.2,
        pointRadius: 6
    },
    {
        label: 'Right Ear (Red)',
        data: testFrequencies.map(f => thresholds.right[f] !== undefined ? thresholds.right[f] : null),
        borderColor: '#e74c3c',
        backgroundColor: '#e74c3c',
        spanGaps: true,
        tension: 0.2,
        pointRadius: 6
    }
]

        },
        options: {
            plugins: { legend: { position: 'top' } },
            scales: {
                x: {
                    type: 'logarithmic',
                    title: { display: true, text: 'Frequency (Hz)' },
                    ticks: {
                        callback: function(val, index, ticks) {
                            return Number(val).toFixed(0);
                        }
                    }
                },
                y: {
                    reverse: true,
                    title: { display: true, text: 'Threshold (dB HL)' },
                    min: -10,
                    max: 40
                }
            }
        }
    });

    const asymmetryDetected = (Math.abs(maxDiff) >= 20);
    const statusText = asymmetryDetected
        ? `⚠️ Asymmetry detected (max difference ${maxDiff.toFixed(1)} dB)`
        : `✅ No major asymmetry (max difference ${maxDiff.toFixed(1)} dB)`;
    const statusEl = document.getElementById('status-text');
    if (statusEl) {
        statusEl.textContent = statusText;
        statusEl.style.color = asymmetryDetected ? '#c0392b' : '#2e7d5e';
    }

    const recEl = document.getElementById('recommendation');
    if (recEl) recEl.textContent = asymmetryDetected
        ? 'Recommendation: Consult an audiologist for follow-up.'
        : 'This is a demo — if you have concerns, consult a professional.';

    // Save aggregated results (unchanged endpoint) - silent
    try {
        await fetchWithTimeout('/save_results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                left_avg: leftAvg,
                right_avg: rightAvg,
                dissimilarity: Math.abs(leftAvg - rightAvg)
            }),
            timeout: 5000
        });
        logDebug('Results saved successfully');
    } catch (err) {
        console.error('Save results error:', err);
    }
}

/* -----------------------
   Restart test
   ----------------------- */
function restartTest() {
    userId = null;
    userName = '';
    userSurname = '';
    calibrationVolume = 0.3;
    const slider = document.getElementById('volume-slider');
    if (slider) slider.value = 0.3;
    showScreen('login');
    logDebug('Test restarted');
}
