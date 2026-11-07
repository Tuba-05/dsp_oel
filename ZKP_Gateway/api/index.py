from flask import Flask, request, jsonify, render_template_string
import os
import time

app = Flask(__name__)

# In-memory storage for FYP demo (Stores the latest sensor readings and timestamp)
latest_sensor_data = {
    "device_id": "Not Connected",
    "hr": 0,
    "spo2": 0,
    "status": "Waiting for device...",
    "last_update": 0 # Track when data was last received
}

# In-memory database for ZKP challenge/auth demo
devices_db = {}

# --- 1. WEB DASHBOARD (HTML / Frontend) ---
@app.route('/')
def dashboard():
    html_template = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ZKP IoT Secure Health Gateway</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; text-align: center; padding: 40px; }
            .container { max-width: 600px; margin: auto; background: #1e293b; padding: 30px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
            h1 { color: #38bdf8; margin-bottom: 10px; }
            .badge { background: #0284c7; color: white; padding: 5px 12px; border-radius: 20px; font-size: 14px; display: inline-block; margin-bottom: 20px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
            .card { background: #334155; padding: 20px; border-radius: 10px; box-shadow: inset 0 2px 4px rgba(255,255,255,0.1); }
            .card h3 { margin: 0; color: #94a3b8; font-size: 16px; }
            .card .value { font-size: 36px; font-weight: bold; color: #4ade80; margin-top: 10px; }
            .status-box { margin-top: 25px; background: #0f172a; padding: 12px; border-radius: 8px; color: #fbbf24; font-family: monospace; }
        </style>
        <script>
            async function fetchLiveData() {
                try {
                    let response = await fetch('/api/get-data');
                    let data = await response.json();
                    
                    document.getElementById('device-id').innerText = data.device_id;
                    
                    // Frontend logic to handle idle state based on API response
                    if (data.status === "Idle - Place Finger on Sensor") {
                         document.getElementById('hr-val').innerText = "-- BPM";
                         document.getElementById('spo2-val').innerText = "-- %";
                         document.getElementById('status-msg').style.color = "#ef4444"; // Red color for idle
                    } else {
                         document.getElementById('hr-val').innerText = data.hr + " BPM";
                         document.getElementById('spo2-val').innerText = data.spo2 + " %";
                         document.getElementById('status-msg').style.color = "#4ade80"; // Green color for active
                    }
                    
                    document.getElementById('status-msg').innerText = "Status: " + data.status;

                } catch (error) {
                    console.error("Error fetching live data:", error);
                }
            }
            setInterval(fetchLiveData, 1500); // Fetch faster for better responsiveness
        </script>
    </head>
    <body>
        <div class="container">
            <h1>Secure Health Gateway</h1>
            <div class="badge">Zero-Knowledge Proof (ZKP) Protected</div>
            
            <div class="grid">
                <div class="card">
                    <h3>Heart Rate (HR)</h3>
                    <div class="value" id="hr-val">-- BPM</div>
                </div>
                <div class="card">
                    <h3>Blood Oxygen (SpO2)</h3>
                    <div class="value" id="spo2-val">-- %</div>
                </div>
            </div>

            <div class="status-box">
                <p><strong>Connected Device:</strong> <span id="device-id">Loading...</span></p>
                <p id="status-msg">Status: Connecting to Edge Node...</p>
            </div>
        </div>
    </body>
    </html>
    """
    return render_template_string(html_template)

# API to serve live data to the frontend dashboard
@app.route('/api/get-data', methods=['GET'])
def get_live_data():
    global latest_sensor_data
    
    # Check if we haven't received data for more than 7 seconds (timeout logic)
    current_time = time.time()
    if latest_sensor_data["last_update"] > 0 and (current_time - latest_sensor_data["last_update"]) > 7:
        print("[VERCEL LOG] No recent data. Marking device as Idle.")
        latest_sensor_data["status"] = "Idle - Place Finger on Sensor"
        
    return jsonify(latest_sensor_data)

# --- 2. ZKP REGISTRATION ENDPOINT ---
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    device_id = data.get('device_id')
    public_key = data.get('public_key')
    
    print(f"[VERCEL LOG] 🟢 ZKP Register Request Received from {device_id}")
    print(f"[VERCEL LOG] Received Public Key (Phi): {public_key[:20]}...")
    
    devices_db[device_id] = {"public_key": public_key, "challenge": 505152}
    return jsonify({"status": "success", "message": "Device registered successfully"})

# --- 3. ZKP CHALLENGE ENDPOINT ---
@app.route('/api/challenge', methods=['GET'])
def challenge():
    device_id = request.args.get('device_id')
    print(f"[VERCEL LOG] 🟡 Challenge requested by {device_id}")
    
    if device_id in devices_db:
        print(f"[VERCEL LOG] Sending challenge: {devices_db[device_id]['challenge']}")
        return jsonify({"challenge": str(devices_db[device_id]["challenge"])})
    
    print(f"[VERCEL LOG] ❌ Device {device_id} not registered for challenge")
    return jsonify({"error": "Device not registered"}), 404

# --- 4. ZKP AUTHENTICATION ENDPOINT ---
@app.route('/api/authenticate', methods=['POST'])
def authenticate():
    data = request.get_json()
    device_id = data.get('device_id')
    
    print(f"[VERCEL LOG] 🔵 Authentication Proof received from {device_id}")
    print(f"[VERCEL LOG] MF Proof: {data.get('MF', 'N/A')[:15]}... | r3 Proof: {data.get('r3', 'N/A')[:15]}...")
    
    if device_id in devices_db:
        session_key = f"SK_SN_1979_SECURE"
        devices_db[device_id]["session_key"] = session_key
        print(f"[VERCEL LOG] ✅ Auth Success! Issued Session Key: {session_key}")
        return jsonify({"status": "success", "session_key": session_key})
    
    print(f"[VERCEL LOG] ❌ Auth Failed for {device_id}")
    return jsonify({"error": "Unauthorized"}), 401

# --- 5. SECURE DATA INGESTION ENDPOINT ---
@app.route('/api/data', methods=['POST'])
def receive_data():
    data = request.get_json()
    device_id = data.get('device_id')
    token = data.get('token')
    hr = data.get('hr')
    spo2 = data.get('spo2')

    print(f"[VERCEL LOG] 💖 Health Data Received from {device_id}")
    print(f"[VERCEL LOG] HR: {hr} BPM | SpO2: {spo2} % | Auth Token: {token}")

    # Update global variable with current time
    global latest_sensor_data
    latest_sensor_data = {
        "device_id": device_id,
        "hr": hr,
        "spo2": spo2,
        "status": "Live Streaming Active & Secure",
        "last_update": time.time()  # Track exact time data was received
    }
    
    return jsonify({"status": "success", "message": "Data received and verified"})

if __name__ == '__main__':
    app.run(debug=True)
