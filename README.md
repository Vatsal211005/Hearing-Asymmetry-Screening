Hearing Asymmetry Screening

A web-based audiometry application for detecting potential hearing asymmetry
Built by Vatsal211005

Overview

Hearing Asymmetry Screening is a web-based application designed to screen for potential hearing asymmetry using pure-tone audiometry. The tool measures hearing thresholds across key frequencies (250–5000 Hz) for both ears, visualizes the results using an interactive audiogram, and flags possible asymmetry.

This project is intended for demonstration and educational purposes only. It is not a medical diagnostic tool.

Features

User Registration
Collects user details such as name, surname, age group, and optional gender through a simple and responsive HTML form.

Headphone Calibration
Plays a 1000 Hz reference tone to help users adjust volume for accurate hearing threshold detection.

Hearing Test (Down 10 dB, Up 5 dB Method)
Determines hearing thresholds for each ear using an adaptive staircase approach commonly used in audiometry.

Results Visualization
Displays results in both a numerical table and an interactive audiogram generated using Chart.js.

Result Export and Storage
Allows users to download audiogram results as a PNG file containing user details and the test date.
Session data is automatically stored in a local SQLite database (users.db).

Tech Stack
Layer	Technologies
Backend	Flask (Python), SQLite, NumPy, SciPy
Frontend	HTML, CSS, JavaScript, Chart.js
Audio Generation	WAV tone synthesis using SciPy for precise frequency playback
Setup Instructions
1. Clone the Repository
git clone https://github.com/Vatsal211005/hearing-asymmetry-screening.git
cd hearing-asymmetry-screening

2. Install Dependencies

Ensure Python 3.8+ is installed. Then run:

pip install flask numpy scipy

3. Include Chart.js

In templates/index.html, add the following line before
<script src="static/script.js"></script>:

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

4. Run the Application
python app.py

5. Access the App

Open your browser and visit:

http://localhost:5000


Use high-quality headphones in a quiet environment for accurate results.

Project Structure
hearing-asymmetry-screening/
├── app.py              # Flask backend (API endpoints, audio generation)
├── templates/
│   └── index.html      # Main HTML interface
├── static/
│   ├── styles.css      # CSS for responsive layout
│   └── script.js       # Frontend JavaScript logic and audiogram rendering
├── README.md           # Project documentation
├── LICENSE             # MIT License
└── .gitignore          # Exclusions (users.db, __pycache__, etc.)

Usage Flow

Register: Enter personal details and provide consent for demo testing.

Headphone Check: Verify left and right audio channels.

Volume Calibration: Adjust using the 1000 Hz reference tone.

Hearing Test: Respond “Yes” or “No” to test tones to identify thresholds.

View Results: View and analyze thresholds and potential asymmetry.

Download Results: Export the audiogram as a PNG image including metadata.

Notes

This is a demo-only project and should not be used for clinical or medical assessment.

For accurate results, use high-quality stereo headphones in a quiet environment.

The SQLite database (users.db) is automatically created to store user data and test results.

This project demonstrates integration of audio signal processing, Flask APIs, and interactive data visualization.

License

This project is licensed under the MIT License.
See the LICENSE
 file for details.
