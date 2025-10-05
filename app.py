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
        conn = sqlite3.connect('users.db', timeout=10)
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
        logger.debug(f"Generating tone: freq={freq}, duration={duration}, volume={volume}, channel={channel}")
    except Exception as e:
        logger.error(f"Bad parameters in /tone: {e}")
        return ("Bad parameters", 400)

    sample_rate = 44100
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    note = np.sin(2 * np.pi * freq * t) * volume

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

@app.route('/register', methods=['POST'])
def register():
    data = request.json or {}
    try:
        conn = sqlite3.connect('users.db', timeout=10)
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
        conn = sqlite3.connect('users.db', timeout=10)
        c = conn.cursor()
        c.execute('SELECT id FROM users WHERE id = ?', (user_id,))
        if not c.fetchone():
            logger.error(f"User not found: ID={user_id}")
            return jsonify({'error': 'User not found'}), 404
        c.execute('UPDATE users SET test_state = ? WHERE id = ?', (json.dumps(test_state), user_id))
        conn.commit()
        logger.debug(f"Test started for user ID={user_id}")
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
        conn = sqlite3.connect('users.db', timeout=10)
        c = conn.cursor()
        c.execute('SELECT test_state FROM users WHERE id = ?', (user_id,))
        result = c.fetchone()
        if not result:
            logger.error(f"User not found: ID={user_id}")
            return jsonify({'error': 'User not found'}), 404

        test_state = json.loads(result[0])
        current_test_index = test_state['current_test_index']
        total_tests = test_state['total_tests']

        if current_test_index >= total_tests:
            left_values = list(test_state['thresholds']['left'].values())
            right_values = list(test_state['thresholds']['right'].values())
            left_avg = sum(left_values) / len(left_values) if left_values else 0
            right_avg = sum(right_values) / len(right_values) if right_values else 0
            max_diff = 0
            for freq in test_frequencies:
                if freq in test_state['thresholds']['left'] and freq in test_state['thresholds']['right']:
                    diff = abs(test_state['thresholds']['left'][freq] - test_state['thresholds']['right'][freq])
                    max_diff = max(max_diff, diff)
                    logger.debug(f"Frequency {freq} Hz: Left={test_state['thresholds']['left'][freq]}, Right={test_state['thresholds']['right'][freq]}, Diff={diff}")

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

        current_test = test_state['current_test']
        progress = (current_test_index / total_tests) * 100

        return jsonify({
            'freq': current_test['frequency'],
            'ear': current_test['ear'],
            'level': current_test['current_level'],
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
        conn = sqlite3.connect('users.db', timeout=10)
        c = conn.cursor()
        c.execute('SELECT test_state FROM users WHERE id = ?', (user_id,))
        result = c.fetchone()
        if not result:
            logger.error(f"User not found: ID={user_id}")
            return jsonify({'error': 'User not found'}), 404

        try:
            test_state = json.loads(result[0])
        except json.JSONDecodeError as e:
            logger.error(f"Invalid test_state JSON for user {user_id}: {e}")
            return jsonify({'error': 'Invalid test state data'}), 500

        current_test = test_state['current_test']
        current_test['responses'].append({'level': current_test['current_level'], 'heard': heard})
        current_test['trial_count'] += 1
        old_level = current_test['current_level']

        if heard:
            current_test['current_level'] = max(-10, current_test['current_level'] - 10)
        else:
            current_test['current_level'] = min(40, current_test['current_level'] + 5)

        if heard and current_test['current_level'] == old_level:
            threshold = compute_threshold(current_test['responses'])
            test_state['thresholds'][current_test['ear']][current_test['frequency']] = threshold
            test_state['current_test_index'] += 1

            if test_state['current_test_index'] < test_state['total_tests']:
                next_test_data = test_state['test_sequence'][test_state['current_test_index']]
                test_state['current_test'] = {
                    'frequency': next_test_data['freq'],
                    'ear': next_test_data['ear'],
                    'current_level': 40,
                    'responses': [],
                    'trial_count': 0,
                    'max_trials': 12
                }
        elif current_test['trial_count'] >= current_test['max_trials']:
            threshold = compute_threshold(current_test['responses'])
            test_state['thresholds'][current_test['ear']][current_test['frequency']] = threshold
            test_state['current_test_index'] += 1

            if test_state['current_test_index'] < test_state['total_tests']:
                next_test_data = test_state['test_sequence'][test_state['current_test_index']]
                test_state['current_test'] = {
                    'frequency': next_test_data['freq'],
                    'ear': next_test_data['ear'],
                    'current_level': 40,
                    'responses': [],
                    'trial_count': 0,
                    'max_trials': 12
                }

        c.execute('UPDATE users SET test_state = ? WHERE id = ?', (json.dumps(test_state), user_id))
        conn.commit()
        logger.debug(f"Response submitted for user ID={user_id}, heard={heard}")
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Submit response error for user {user_id}: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

def compute_threshold(responses):
    map = {}
    for r in responses:
        level = r['level']
        if level not in map:
            map[level] = {'yes': 0, 'total': 0}
        map[level]['total'] += 1
        if r['heard']:
            map[level]['yes'] += 1

    levels = sorted([float(l) for l in map.keys()])
    threshold = levels[-1] if levels else 40

    candidate_levels = [l for l in levels if (map[l]['yes'] / map[l]['total']) >= 0.5]
    if candidate_levels:
        threshold = min(candidate_levels)
    else:
        heard_levels = [l for l in levels if map[l]['yes'] > 0]
        if heard_levels:
            threshold = min(heard_levels)

    return threshold

@app.route('/save_results', methods=['POST'])
def save_results():
    data = request.json or {}
    try:
        conn = sqlite3.connect('users.db', timeout=10)
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
        conn = sqlite3.connect('users.db', timeout=10)
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
        conn = sqlite3.connect('users.db', timeout=10)
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
