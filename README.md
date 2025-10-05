Hearing Asymmetry Screening
A web-based application for screening hearing asymmetry using pure-tone audiometry. Built with Flask (Python) for the backend, JavaScript for frontend logic, and Chart.js for audiogram visualization. Users provide personal details, calibrate headphone volume, and respond to tones to detect potential hearing asymmetry.
Features

User Registration: Collects name, surname, age group, and gender.
Headphone Calibration: Adjusts volume for accurate testing.
Hearing Test: Tests frequencies (250–5000 Hz) for both ears, using a "down 10 dB, up 5 dB" method.
Results Visualization: Displays thresholds in a table and an audiogram chart.
Result Download: Saves results as a PNG image with user details.

Tech Stack

Backend: Flask, SQLite for user data storage.
Frontend: HTML, CSS, JavaScript, Chart.js for plotting.
Audio: Generates WAV tones server-side with NumPy and SciPy.

Setup Instructions

Clone the repository:git clone https://github.com/your-username/hearing-asymmetry-screening.git
cd hearing-asymmetry-screening


Install dependencies:pip install flask numpy scipy


Run the Flask app:python app.py


Open http://localhost:5000 in a browser.
Ensure headphones are connected for audio testing.

Project Structure
hearing-asymmetry-screening/
├── app.py              # Flask backend
├── templates/
│   └── index.html      # Main HTML template
├── static/
│   ├── styles.css      # Styling
│   └── script.js       # Frontend logic
├── README.md           # Project documentation
└── .gitignore          # Git ignore file

Notes

This is a demo application, not for medical diagnosis. Consult an audiologist for professional assessment.
Ensure a quiet environment and functional headphones for accurate results.
The database (users.db) is created automatically on first run.

License
MIT License
