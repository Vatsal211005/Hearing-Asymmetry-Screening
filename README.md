Hearing Asymmetry Screening
A web-based application for screening hearing asymmetry using pure-tone audiometry, built by Vatsal211005. This tool tests hearing thresholds across frequencies (250–5000 Hz) for both ears, visualizes results in an audiogram using Chart.js, and detects potential hearing asymmetry. Developed with Flask (Python) for the backend and JavaScript for frontend logic, it’s a demo project, not for medical diagnosis.
Features

User Registration: Collects name, surname, age group, and optional gender via a clean HTML form.
Headphone Calibration: Adjusts volume with a 1000 Hz test tone for accurate testing.
Hearing Test: Uses a "down 10 dB, up 5 dB" method to find hearing thresholds for each ear.
Results Visualization: Displays thresholds in a numerical table and an interactive audiogram chart.
Result Downloads: Exports results as a PNG image with user details and test date.

Tech Stack

Backend: Flask, SQLite (for user data and test state), NumPy, and SciPy for audio generation.
Frontend: HTML, CSS, JavaScript, and Chart.js for audiogram visualization.
Audio: Generates WAV tones server-side for precise frequency testing.

Setup Instructions

Clone the Repository:git clone https://github.com/Vatsal211005/hearing-asymmetry-screening.git
cd hearing-asymmetry-screening


Install Dependencies:Ensure Python 3.8+ is installed, then run:pip install flask numpy scipy


Include Chart.js:The frontend uses Chart.js. Ensure the following is in templates/index.html before <script src="static/script.js"></script>:<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>


Run the Flask App:python app.py


Access the App:Open http://localhost:5000 in a browser. Use headphones in a quiet environment for testing.

Project Structure
hearing-asymmetry-screening/
├── app.py              # Flask backend for API and audio generation
├── templates/
│   └── index.html      # Main HTML template with UI screens
├── static/
│   ├── styles.css      # Styling for responsive design
│   └── script.js       # Frontend logic for test flow and audiogram
├── README.md           # Project documentation
├── LICENSE             # MIT License
└── .gitignore          # Excludes users.db, __pycache__, etc.

Usage

Register: Enter name, surname, age group, and optional gender.
Consent & Headphone Check: Confirm demo terms and test left/right audio channels.
Calibrate Volume: Adjust volume using a 1000 Hz tone.
Run Test: Respond “YES” or “NO” to tones to measure hearing thresholds.
View Results: See thresholds in a table and audiogram; download as PNG.

Notes

Demo Only: This is not a medical tool. Consult an audiologist for professional hearing assessments.
Environment: Use high-quality headphones and a quiet setting for accurate results.
Database: users.db (SQLite) is created automatically to store user data and results.
Portfolio Context: This project showcases machine learning (audio signal processing, threshold detection) and web development skills (Flask, JavaScript).

License
MIT License - see the LICENSE file for details.
Acknowledgments

Built by Vatsal211005.
Uses Chart.js (MIT License) for audiogram visualization.
Inspired by audiometry concepts and web-based health demos.
