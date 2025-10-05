let currentScreen = 'login';
const testFrequencies = [250, 500, 1000, 2000, 4000, 5000]; // Ascending order for table
let userId = null;
let calibrationVolume = 0.3; // Default volume set to a low value
const debugMode = true; // Enable debug logging
let userName = '';
let userSurname = '';

function logDebug(message) {
    if (debugMode) console.log(`[DEBUG] ${message}`);
}

// UI helpers
function showScreen(screenId) {
    document.querySelectorAll('#main-frame > div').forEach(div => div.classList.add('hidden'));
    document.getElementById(screenId + '-screen').classList.remove('hidden');
    currentScreen = screenId;
    logDebug(`Switched to screen: ${screenId}`);
}

// Play a tone from the server and return a Promise that resolves after the sound finishes
function playServerTone(params) {
    const url = new URL('/tone', window.location);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v.toString()));
    logDebug(`Playing tone: ${JSON.stringify(params)}`);
    return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.volume = calibrationVolume;
        audio.onended = () => {
            logDebug('Audio playback ended');
            resolve();
        };
        const fallbackMs = (parseFloat(params.duration || 0.35) * 1000) + 150;
        let fallback = setTimeout(() => {
            try { audio.pause(); } catch (e) {}
            logDebug('Audio playback timeout');
            resolve();
        }, fallbackMs);

        audio.play().then(() => {
            logDebug('Audio playback started');
        }).catch(err => {
            console.error('Audio playback error:', err);
            clearTimeout(fallback);
            setTimeout(() => resolve(), fallbackMs);
        });
    });
}

async function playTestTone(freq, channel, levelDb) {
    const amplitude = Math.pow(10, (levelDb - 40) / 20);
    const duration = 0.35;
    await playServerTone({ freq: freq, duration: duration, volume: amplitude, channel: channel });
}

// Quick left/right channel test
function playChannelTest(channel) {
    const status = document.getElementById('channel-status');
    status.textContent = `Playing in ${channel.toUpperCase()} ear 🔊`;
    status.style.color = channel === 'left' ? '#3498db' : '#e74c3c';
    playServerTone({ freq: 1000, duration: 0.7, volume: 0.6, channel: channel })
        .then(() => setTimeout(() => status.textContent = '', 400));
}

// Event listeners and navigation
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    userName = document.getElementById('name').value;
    userSurname = document.getElementById('surname').value;
    const data = {
        name: userName,
        surname: userSurname,
        age_group: document.querySelector('input[name="age_group"]:checked')?.value || null,
        gender: document.querySelector('input[name="gender"]:checked')?.value || null
    };
    logDebug('Submitting registration form');
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(5000)
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
    }
});

document.getElementById('start-btn').addEventListener('click', () => {
    logDebug('Start button clicked');
    showScreen('consent');
});
document.getElementById('agree-btn').addEventListener('click', () => {
    logDebug('Agree button clicked');
    showScreen('device-check');
});
document.getElementById('back-welcome-btn').addEventListener('click', () => showScreen('welcome'));
document.getElementById('left-ear-btn').addEventListener('click', () => playChannelTest('left'));
document.getElementById('right-ear-btn').addEventListener('click', () => playChannelTest('right'));
document.getElementById('headphones-ready-btn').addEventListener('click', () => showScreen('calibration'));
document.getElementById('back-consent-btn').addEventListener('click', () => showScreen('consent'));
document.getElementById('play-tone-btn').addEventListener('click', () => playServerTone({ freq: 1000, duration: 1.0, volume: 1.0, channel: 'both' }));
document.getElementById('volume-slider').addEventListener('input', (e) => {
    calibrationVolume = parseFloat(e.target.value);
    logDebug(`Volume set to: ${calibrationVolume}`);
});
document.getElementById('volume-set-btn').addEventListener('click', () => showScreen('instructions'));
document.getElementById('back-device-btn').addEventListener('click', () => showScreen('device-check'));
document.getElementById('start-test-btn').addEventListener('click', startHearingTest);
document.getElementById('back-calibration-btn').addEventListener('click', () => showScreen('calibration'));
document.getElementById('try-again-btn').addEventListener('click', restartTest);
document.getElementById('exit-btn').addEventListener('click', () => location.reload());
document.getElementById('download-results-btn').addEventListener('click', downloadResults);

document.getElementById('yes-btn').addEventListener('click', () => {
    logDebug('YES button clicked');
    submitResponse(true);
});
document.getElementById('no-btn').addEventListener('click', () => {
    logDebug('NO button clicked');
    submitResponse(false);
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        if (confirm('Sure you want to exit?')) showScreen('welcome');
    } else if (event.key === ' ' && currentScreen === 'welcome') {
        showScreen('consent');
    }
});

// Start hearing test
async function startHearingTest() {
    if (!userId) {
        alert('User ID is missing. Please restart the test.');
        showScreen('login');
        return;
    }
    logDebug(`Starting test for user ID=${userId}`);
    showScreen('testing');
    try {
        const response = await fetch('/start_test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId }),
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw new Error(`Start test failed: ${response.statusText}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        logDebug(`Test started: ${JSON.stringify(data)}`);
        await runTest(data);
    } catch (err) {
        console.error('Start test error:', err);
        alert(`Failed to start test: ${err.message}. Please try again.`);
        showScreen('welcome');
    }
}

async function runTest(testData) {
    logDebug(`Running test: ${JSON.stringify(testData)}`);
    document.getElementById('progress-bar').value = testData.progress;
    document.getElementById('progress-label').textContent = `${Math.round(testData.progress)}%`;
    document.getElementById('ear-label').textContent = `${testData.ear === 'left' ? '👂 Left Ear' : '👂 Right Ear'}`;
    document.getElementById('status-label').textContent = `Testing ${testData.freq} Hz`;
    document.getElementById('test-info').textContent = `Test ${testData.test_number}/${testData.total_tests} ⚡`;

    document.getElementById('response-status').textContent = 'Playing tone...';
    document.getElementById('yes-btn').disabled = true;
    document.getElementById('no-btn').disabled = true;

    try {
        await playTestTone(testData.freq, testData.ear, testData.level);
        document.getElementById('response-status').textContent =
            `Freq: ${testData.freq} Hz | Level: ${testData.level} dB HL — Did you hear it?`;
        document.getElementById('yes-btn').disabled = false;
        document.getElementById('no-btn').disabled = false;
        logDebug('Tone played, buttons enabled');
    } catch (err) {
        console.error('Tone playback error:', err);
        alert('Error playing tone. Please try again.');
        document.getElementById('yes-btn').disabled = false;
        document.getElementById('no-btn').disabled = false;
        document.getElementById('response-status').textContent = 'Error playing tone. Please try again.';
    }
}

async function submitResponse(heard) {
    if (!userId) {
        alert('User ID is missing. Please restart the test.');
        showScreen('login');
        return;
    }

    logDebug(`Submitting response: heard=${heard}`);
    document.getElementById('response-status').textContent = 'Submitting response...';
    document.getElementById('yes-btn').disabled = true;
    document.getElementById('no-btn').disabled = true;

    try {
        const response = await fetch('/submit_response', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, heard: heard }),
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw new Error(`Submit response failed: ${response.statusText}`);
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        logDebug('Response submitted successfully');

        const nextTest = await fetch(`/next_test?user_id=${userId}`, {
            signal: AbortSignal.timeout(5000)
        });
        if (!nextTest.ok) throw new Error(`Next test failed: ${nextTest.statusText}`);
        const testData = await nextTest.json();
        if (testData.error) throw new Error(testData.error);
        logDebug(`Next test data: ${JSON.stringify(testData)}`);

        if (testData.completed) {
            logDebug('Test completed, showing results');
            showResultsScreen(testData);
        } else {
            setTimeout(() => runTest(testData), 150);
        }
    } catch (err) {
        console.error('Submit response error:', err);
        alert(`Error: ${err.message}. Please try again or restart the test.`);
        document.getElementById('yes-btn').disabled = false;
        document.getElementById('no-btn').disabled = false;
        document.getElementById('response-status').textContent = 'Error submitting response. Please try again.';
    }
}

// Download results as an image
async function downloadResults() {
    logDebug('Download results button clicked');
    try {
        // Get the chart canvas
        const canvas = document.getElementById('audiogram-chart');
        const chart = window.__audiogramChart;
        if (!chart) throw new Error('Chart not found');

        // Create a new canvas to combine chart and text
        const newCanvas = document.createElement('canvas');
        newCanvas.width = canvas.width + 40; // Extra width for padding
        newCanvas.height = canvas.height + 120; // Extra height for text
        const ctx = newCanvas.getContext('2d');

        // Fill background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);

        // Draw the chart
        ctx.drawImage(canvas, 20, 80, canvas.width, canvas.height);

        // Add user name and surname
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#333333';
        ctx.fillText(`Name: ${userName} ${userSurname}`, 20, 40);

        // Add asymmetry result
        const statusText = document.getElementById('status-text').textContent;
        ctx.font = '16px Arial';
        ctx.fillStyle = statusText.includes('Asymmetry detected') ? '#e74c3c' : '#27ae60';
        ctx.fillText(statusText, 20, 60);

        // Add date
        const date = new Date().toISOString().split('T')[0];
        ctx.fillStyle = '#333333';
        ctx.fillText(`Date: ${date}`, 20, newCanvas.height - 20);

        // Create download link
        const link = document.createElement('a');
        link.download = `Hearing_Test_${userName}_${userSurname}_${date}.png`;
        link.href = newCanvas.toDataURL('image/png');
        link.click();
        logDebug('Results downloaded successfully');
    } catch (err) {
        console.error('Download results error:', err);
        alert('Failed to download results. Please try again.');
    }
}

// Analysis + results UI
async function showResultsScreen(data) {
    logDebug(`Showing results screen with data: ${JSON.stringify(data)}`);
    showScreen('results');

    const thresholds = data.thresholds;
    const leftAvg = data.left_avg;
    const rightAvg = data.right_avg;
    const maxDiff = data.max_diff;

    logDebug(`maxDiff: ${maxDiff}, leftAvg: ${leftAvg}, rightAvg: ${rightAvg}`);

    const asymmetryDetected = maxDiff >= 20;
    const statusText = asymmetryDetected 
        ? `⚠️ Asymmetry detected (max difference ${maxDiff.toFixed(1)} dB)` 
        : `✅ No major asymmetry (max difference ${maxDiff.toFixed(1)} dB)`;
    document.getElementById('status-text').textContent = statusText;
    document.getElementById('status-text').style.color = asymmetryDetected ? '#e74c3c' : '#27ae60';
    document.getElementById('recommendation').textContent = asymmetryDetected 
        ? 'Recommendation: Consult an audiologist for follow-up.' 
        : 'This is a demo — if you have concerns, consult a professional.';
    logDebug(`Displayed status: ${statusText}`);

    // Fill numeric results table in ascending order
    const tbody = document.querySelector('#results-table tbody');
    tbody.innerHTML = '';
    testFrequencies.forEach(freq => {
        const left = thresholds.left[freq] !== undefined ? thresholds.left[freq] : '-';
        const right = thresholds.right[freq] !== undefined ? thresholds.right[freq] : '-';
        const diff = (left !== '-' && right !== '-') ? Math.abs(left - right).toFixed(1) : '-';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${freq}</td><td>${left}</td><td>${right}</td><td>${diff}</td>`;
        tbody.appendChild(tr);
    });

    // Plot audiogram with Chart.js
    const ctx = document.getElementById('audiogram-chart').getContext('2d');
    if (window.__audiogramChart) {
        window.__audiogramChart.destroy();
    }
    window.__audiogramChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: testFrequencies,
            datasets: [
                {
                    label: 'Left Ear',
                    data: testFrequencies.map(f => thresholds.left[f] !== undefined ? thresholds.left[f] : null),
                    borderColor: '#3498db',
                    backgroundColor: '#3498db',
                    spanGaps: true,
                    tension: 0.2,
                    pointRadius: 6
                },
                {
                    label: 'Right Ear',
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

    // Save aggregated results to server
    try {
        await fetch('/save_results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                left_avg: leftAvg,
                right_avg: rightAvg,
                dissimilarity: Math.abs(leftAvg - rightAvg)
            }),
            signal: AbortSignal.timeout(5000)
        });
        logDebug('Results saved successfully');
    } catch (err) {
        console.error('Save results error:', err);
        alert('Failed to save results. Results are still displayed.');
    }
}

function restartTest() {
    userId = null;
    userName = '';
    userSurname = '';
    calibrationVolume = 0.3;
    document.getElementById('volume-slider').value = 0.3;
    showScreen('login');
    logDebug('Test restarted');
}

// Initial screen
showScreen('login');
