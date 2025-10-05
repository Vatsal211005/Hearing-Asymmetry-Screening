# app.py - Flask backend
import sqlite3
import numpy as np
from scipy.io.wavfile import write
from io import BytesIO
from flask import Flask, render_template, request, jsonify, Response
import json
import logging

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)

def init_db():
    try:
        conn = sqlite3.connect('users.db', timeout=15)
        c = conn.cursor()
        
        c.execute('''CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            surname TEXT,
            age_group TEXT,
            gender TEXT,
            left_avg REAL,
            right_avg REAL,
            dissimilarity REAL
        )''')
        
        c.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in c.fetchall()]
        if 'test_state' not in columns:
            c.execute('ALTER TABLE users ADD COLUMN test_state TEXT')
        
        conn.commit()
        logger.debug("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization error: {e}")
        raise
    finally:
        conn.close()

init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/tone')
def generate_tone():
    try:
        freq = int(request.args.get('freq', 1000))
        duration = float(request.args.get('duration', 0.35))
        volume = float(request.args.get('volume', 1.0))
        channel = request.args.get('channel', 'both')

        if freq < 20 or freq > 20000:
            logger.error(f"Invalid frequency: {freq} Hz")
            return ("Frequency out of audible range (20-20000 Hz)", 400)

        logger.debug(f"Generating tone: freq={freq}, duration={duration}, volume={volume}, channel={channel}")

        sample_rate = 44100
        t = np.linspace(0, duration, int(sample_rate * duration), False)
        note = np.sin(2 * np.pi * freq * t) * volume

        fade_samples = int(sample_rate * 0.01)  # 10ms fade
        fade_in = np.linspace(0, 1, fade_samples)
        fade_out = np.linspace(1, 0, fade_samples)
        note[:fade_samples] *= fade_in
        note[-fade_samples:] *= fade_out

        if channel == 'both':
            audio = np.column_stack((note, note))
        elif channel == 'left':
            audio = np.column_stack((note, np.zeros_like(note)))
        else:  # 'right'
            audio = np.column_stack((np.zeros_like(note), note))

        max_val = np.max(np.abs(audio))
        if max_val > 1.0:
            audio = audio / max_val

        audio_int16 = (audio * 32767 * 0.8).astype(np.int16)

        bio = BytesIO()
        write(bio, sample_rate, audio_int16)
        bio.seek(0)
        wav_bytes = bio.getvalue()
        return Response(wav_bytes, mimetype='audio/wav')
    except Exception as e:
        logger.error(f"Error generating tone: {e}")
        return ("Error generating tone", 500)

@app.route('/register', methods=['POST'])
def register():
    data = request.json or {}
    try:
        conn = sqlite3.connect('users.db', timeout=15)
        c = conn.cursor()
        c.execute('''INSERT INTO users (
            name, surname, age_group, gender, test_state
        ) VALUES (?, ?, ?, ?, ?)''', (
            data.get('name'), data.get('surname'), data.get('age_group'), data.get('gender'), json.dumps({})
        ))
        user_id = c.lastrowid
        conn.commit()
        logger.debug(f"User registered: ID={user_id}")
        return jsonify({'user_id': user_id})
    except Exception as e:
        logger.error(f"Registration error: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/start_test', methods=['POST'])
def start_test():
    data = request.json or {}
    user_id = data.get('user_id')
    if not user_id:
        logger.error("Start test failed: User ID required")
        return jsonify({'error': 'User ID required'}), 400

    test_frequencies = [5000, 4000, 2000, 1000, 500, 250]
    test_sequence = []
    for freq in test_frequencies:
        for ear in ['left', 'right']:
            test_sequence.append({'freq': freq, 'ear': ear})

    test_state = {
        'thresholds': {'left': {}, 'right': {}},
        'test_sequence': test_sequence,
        'current_test_index': 0,
        'total_tests': len(test_sequence),
        'current_test': {
            'frequency': test_sequence[0]['freq'],
            'ear': test_sequence[0]['ear'],
            'current_level': 40,
            'responses': [],
            'trial_count': 0,
            'max_trials': 12
        }
    }

    try:
        conn = sqlite3.connect('users.db', timeout=15)
        c = conn.cursor()
        c.execute('SELECT id FROM users WHERE id = ?', (user_id,))
        if not c.fetchone():
            logger.error(f"User not found: ID={user_id}")
            return jsonify({'error': 'User not found'}), 404
        c.execute('UPDATE users SET test_state = ? WHERE id = ?', (json.dumps(test_state), user_id))
        conn.commit()
        logger.debug(f"Test started for user ID={user_id}, sequence: {test_sequence}")
        return jsonify({
            'freq': test_state['current_test']['frequency'],
            'ear': test_state['current_test']['ear'],
            'level': test_state['current_test']['current_level'],
            'progress': 0,
            'test_number': 1,
            'total_tests': test_state['total_tests']
        })
    except Exception as e:
        logger.error(f"Start test error for user {user_id}: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/next_test', methods=['GET'])
def next_test():
    user_id = request.args.get('user_id')
    if not user_id:
        logger.error("Next test failed: User ID required")
        return jsonify({'error': 'User ID required'}), 400

    try:
        conn = sqlite3.connect('users.db', timeout=15)
        c = conn.cursor()
        c.execute('SELECT test_state FROM users WHERE id = ?', (user_id,))
        result = c.fetchone()
        if not result:
            logger.error(f"User not found: ID={user_id}")
            return jsonify({'error': 'User not found'}), 404

        try:
            test_state = json.loads(result[0] or '{}')
        except json.JSONDecodeError as e:
            logger.error(f"Invalid test_state JSON for user {user_id}: {e}")
            return jsonify({'error': 'Invalid test state data'}), 500

        current_test_index = test_state.get('current_test_index', 0)
        total_tests = test_state.get('total_tests', 0)

        if current_test_index >= total_tests:
            test_frequencies = [5000, 4000, 2000, 1000, 500, 250]
            # Ensure thresholds use integer keys and set defaults
            for ear in ['left', 'right']:
                test_state['thresholds'][ear] = {int(k): float(v) for k, v in test_state['thresholds'][ear].items()}
                for freq in test_frequencies:
                    if freq not in test_state['thresholds'][ear]:
                        test_state['thresholds'][ear][freq] = 40.0
                        logger.debug(f"Set default threshold for {ear} ear at {freq} Hz: 40 dB")

            left_values = [test_state['thresholds']['left'].get(freq, 40.0) for freq in test_frequencies]
            right_values = [test_state['thresholds']['right'].get(freq, 40.0) for freq in test_frequencies]
            left_avg = sum(left_values) / len(left_values) if left_values else 0.0
            right_avg = sum(right_values) / len(right_values) if right_values else 0.0
            max_diff = 0.0
            for freq in test_frequencies:
                left_threshold = test_state['thresholds']['left'].get(freq, 40.0)
                right_threshold = test_state['thresholds']['right'].get(freq, 40.0)
                diff = abs(left_threshold - right_threshold)
                max_diff = max(max_diff, diff)
                logger.debug(f"Frequency {freq} Hz: Left={left_threshold}, Right={right_threshold}, Diff={diff}")

            logger.debug(f"Final thresholds: {test_state['thresholds']}")
            logger.debug(f"Calculated max_diff: {max_diff}, left_avg: {left_avg}, right_avg: {right_avg}")

            c.execute('UPDATE users SET left_avg = ?, right_avg = ?, dissimilarity = ? WHERE id = ?',
                      (left_avg, right_avg, abs(left_avg - right_avg), user_id))
            conn.commit()
            logger.debug(f"Test completed for user ID={user_id}, left_avg={left_avg}, right_avg={right_avg}, max_diff={max_diff}")
            return jsonify({
                'completed': True,
                'thresholds': test_state['thresholds'],
                'left_avg': left_avg,
                'right_avg': right_avg,
                'max_diff': max_diff
            })

        current_test = test_state.get('current_test', {})
        if not current_test:
            logger.error(f"No current test found in test_state for user {user_id}")
            return jsonify({'error': 'Invalid test state: no current test'}), 500

        progress = (current_test_index / total_tests) * 100 if total_tests > 0 else 0

        return jsonify({
            'freq': current_test.get('frequency'),
            'ear': current_test.get('ear'),
            'level': current_test.get('current_level'),
            'progress': progress,
            'test_number': current_test_index + 1,
            'total_tests': total_tests
        })
    except Exception as e:
        logger.error(f"Next test error for user {user_id}: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/submit_response', methods=['POST'])
def submit_response():
    data = request.json or {}
    user_id = data.get('user_id')
    heard = data.get('heard')
    if not user_id or heard is None:
        logger.error("Submit response failed: User ID and response required")
        return jsonify({'error': 'User ID and response required'}), 400

    try:
        conn = sqlite3.connect('users.db', timeout=15)
        c = conn.cursor()
        c.execute('SELECT test_state FROM users WHERE id = ?', (user_id,))
        result = c.fetchone()
        if not result:
            logger.error(f"User not found: ID={user_id}")
            return jsonify({'error': 'User not found'}), 404

        try:
            test_state = json.loads(result[0] or '{}')
        except json.JSONDecodeError as e:
            logger.error(f"Invalid test_state JSON for user {user_id}: {e}")
            return jsonify({'error': 'Invalid test state data'}), 500

        if not test_state:
            logger.error(f"Empty test_state for user {user_id}")
            return jsonify({'error': 'Empty test state'}), 500

        current_test = test_state.get('current_test')
        if not current_test:
            logger.error(f"No current_test in test_state for user {user_id}")
            return jsonify({'error': 'Invalid test state: no current test'}), 500

        logger.debug(f"Processing response for user {user_id}, freq={current_test.get('frequency')}, ear={current_test.get('ear')}, heard={heard}")

        current_test['responses'] = current_test.get('responses', [])
        current_test['trial_count'] = current_test.get('trial_count', 0) + 1
        old_level = current_test.get('current_level', 40)

        current_test['responses'].append({'level': old_level, 'heard': heard})

        if heard:
            current_test['current_level'] = max(-10, old_level - 10)
        else:
            current_test['current_level'] = min(40, old_level + 5)

        # Check if threshold should be computed
        should_compute_threshold = (
            (heard and current_test['current_level'] == old_level) or
            current_test['trial_count'] >= current_test.get('max_trials', 12)
        )

        if should_compute_threshold:
            threshold = compute_threshold(current_test['responses'])
            # Ensure frequency is stored as integer
            freq = int(current_test['frequency'])
            test_state['thresholds'][current_test['ear']][freq] = float(threshold)
            test_state['current_test_index'] = test_state.get('current_test_index', 0) + 1

            if test_state['current_test_index'] < test_state.get('total_tests', 0):
                next_test_data = test_state['test_sequence'][test_state['current_test_index']]
                test_state['current_test'] = {
                    'frequency': next_test_data['freq'],
                    'ear': next_test_data['ear'],
                    'current_level': 40,
                    'responses': [],
                    'trial_count': 0,
                    'max_trials': 12
                }
            else:
                # Ensure all frequencies have a threshold
                test_frequencies = [5000, 4000, 2000, 1000, 500, 250]
                for freq in test_frequencies:
                    for ear in ['left', 'right']:
                        if freq not in test_state['thresholds'][ear]:
                            test_state['thresholds'][ear][freq] = 40.0
                            logger.debug(f"Set default threshold for {ear} ear at {freq} Hz: 40 dB")
                logger.debug(f"Test completed, thresholds set: {test_state['thresholds']}")

        c.execute('UPDATE users SET test_state = ? WHERE id = ?', (json.dumps(test_state), user_id))
        conn.commit()
        logger.debug(f"Response submitted for user ID={user_id}, heard={heard}, test_state updated")
        return jsonify({'success': True})
    except sqlite3.OperationalError as e:
        logger.error(f"Database error for user {user_id}: {e}")
        return jsonify({'error': 'Database error occurred'}), 500
    except Exception as e:
        logger.error(f"Submit response error for user {user_id}: {e}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500
    finally:
        conn.close()

def compute_threshold(responses):
    if not responses:
        logger.warning("No responses provided, defaulting threshold to 40 dB")
        return 40.0

    map = {}
    for r in responses:
        level = r.get('level')
        if level is None:
            logger.warning("Response missing level, skipping")
            continue
        try:
            level = float(level)
        except (TypeError, ValueError):
            logger.warning(f"Invalid level in response: {r}")
            continue
        if level not in map:
            map[level] = {'yes': 0, 'total': 0}
        map[level]['total'] += 1
        if r.get('heard'):
            map[level]['yes'] += 1

    levels = sorted([l for l in map.keys()])
    threshold = levels[-1] if levels else 40.0

    candidate_levels = [l for l in levels if (map[l]['yes'] / map[l]['total']) >= 0.5]
    if candidate_levels:
        threshold = min(candidate_levels)
    else:
        heard_levels = [l for l in levels if map[l]['yes'] > 0]
        if heard_levels:
            threshold = min(heard_levels)
        else:
            threshold = 40.0

    logger.debug(f"Computed threshold: {threshold} dB")
    return threshold

@app.route('/save_results', methods=['POST'])
def save_results():
    data = request.json or {}
    try:
        conn = sqlite3.connect('users.db', timeout=15)
        c = conn.cursor()
        c.execute('''UPDATE users SET
            left_avg = ?, right_avg = ?, dissimilarity = ?
            WHERE id = ?''', (
            data.get('left_avg'), data.get('right_avg'), data.get('dissimilarity'), data.get('user_id')
        ))
        conn.commit()
        logger.debug(f"Results saved for user ID={data.get('user_id')}")
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Save results error: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/audiogram', methods=['GET'])
def get_audiogram():
    user_id = request.args.get('user_id')
    try:
        conn = sqlite3.connect('users.db', timeout=15)
        c = conn.cursor()
        c.execute('SELECT left_avg, right_avg, dissimilarity FROM users WHERE id = ?', (user_id,))
        result = c.fetchone()
        if result:
            return jsonify({
                'left_avg': result[0],
                'right_avg': result[1],
                'dissimilarity': result[2]
            })
        logger.error(f"Audiogram user not found: ID={user_id}")
        return jsonify({'error': 'User not found'}), 404
    except Exception as e:
        logger.error(f"Audiogram error for user {user_id}: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/get_user_info', methods=['GET'])
def get_user_info():
    user_id = request.args.get('user_id')
    if not user_id:
        logger.error("Get user info failed: User ID required")
        return jsonify({'error': 'User ID required'}), 400
    try:
        conn = sqlite3.connect('users.db', timeout=15)
        c = conn.cursor()
        c.execute('SELECT name, surname FROM users WHERE id = ?', (user_id,))
        result = c.fetchone()
        if result:
            return jsonify({
                'name': result[0],
                'surname': result[1]
            })
        logger.error(f"User not found: ID={user_id}")
        return jsonify({'error': 'User not found'}), 404
    except Exception as e:
        logger.error(f"Get user info error for user {user_id}: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    app.run(debug=True)