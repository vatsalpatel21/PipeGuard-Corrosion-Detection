import streamlit as st
import cv2
import numpy as np
import tensorflow as tf
import time

# ---------------------------------
# PAGE CONFIG
# ---------------------------------
st.set_page_config(
    page_title="PipeGuard AI",
    page_icon="🛠️",
    layout="wide"
)

# ---------------------------------
# CUSTOM UI STYLE
# ---------------------------------
st.markdown("""
<style>
.main {
    background-color: #0f172a;
    color: white;
}
.block-container {
    padding-top: 1rem;
    padding-bottom: 1rem;
}
h1, h2, h3 {
    color: #ffffff;
}
.status-card {
    padding: 20px;
    border-radius: 16px;
    text-align: center;
    font-size: 22px;
    font-weight: bold;
}
.green {
    background: #16a34a;
    color: white;
}
.orange {
    background: #f97316;
    color: white;
}
.red {
    background: #dc2626;
    color: white;
}
.metric-box {
    background: #1e293b;
    padding: 12px;
    border-radius: 12px;
    text-align: center;
}
</style>
""", unsafe_allow_html=True)

# ---------------------------------
# LOAD MODEL
# ---------------------------------
model = tf.keras.models.load_model(
    r"E:\NUV\VIDEOS\COMPUTER\sem6\CV\project\corrosion_leakage_model.h5",
    compile=False
)

labels = ["CORROSION", "LEAKAGE", "NORMAL"]

# ---------------------------------
# HEADER
# ---------------------------------
st.title("🛠️ PipeGuard AI")
st.caption("Real-Time Smart Pipe Monitoring System")

# ---------------------------------
# SIDEBAR
# ---------------------------------
with st.sidebar:
    st.header("⚙️ Controls")
    run = st.toggle("Start Webcam")
    confidence_limit = st.slider("Detection Confidence", 0.0, 1.0, 0.60)

# ---------------------------------
# LAYOUT
# ---------------------------------
col1, col2 = st.columns([2, 1])

with col1:
    frame_window = st.image([])

with col2:
    status_box = st.empty()
    corrosion_box = st.empty()
    leakage_box = st.empty()

    st.markdown("### 📊 Live Metrics")
    metric1 = st.empty()
    metric2 = st.empty()
    metric3 = st.empty()

# ---------------------------------
# MAIN LOOP
# ---------------------------------
if run:
    cap = cv2.VideoCapture(0)

    corrosion_detected = False
    leakage_detected = False

    while True:
        ret, frame = cap.read()
        if not ret:
            st.error("Camera Error")
            break

        frame = cv2.flip(frame, 1)

        # -----------------------------
        # PREPROCESS
        # -----------------------------
        img = cv2.resize(frame, (224, 224)) / 255.0
        img = np.expand_dims(img, axis=0)

        # -----------------------------
        # PREDICT
        # -----------------------------
        pred = model.predict(img, verbose=0)[0]
        class_id = np.argmax(pred)

        status = labels[class_id]
        confidence = float(pred[class_id])

        # -----------------------------
        # DETECTION LOGIC
        # -----------------------------
        if confidence >= confidence_limit:
            if status == "CORROSION":
                corrosion_detected = True
            elif status == "LEAKAGE":
                leakage_detected = True

        # -----------------------------
        # STATUS PANEL
        # -----------------------------
        if leakage_detected:
            status_box.markdown(
                '<div class="status-card red">🔴 CRITICAL ALERT</div>',
                unsafe_allow_html=True
            )
        elif corrosion_detected:
            status_box.markdown(
                '<div class="status-card orange">🟠 CORROSION FOUND</div>',
                unsafe_allow_html=True
            )
        else:
            status_box.markdown(
                '<div class="status-card green">🟢 SYSTEM NORMAL</div>',
                unsafe_allow_html=True
            )

        # -----------------------------
        # ALERTS
        # -----------------------------
        if corrosion_detected:
            corrosion_box.warning("⚠️ Corrosion detected in pipeline")

        if leakage_detected:
            leakage_box.error("🚨 Leakage detected immediately")

        # -----------------------------
        # LIVE METRICS
        # -----------------------------
        metric1.markdown(
            f'<div class="metric-box">Prediction<br><b>{status}</b></div>',
            unsafe_allow_html=True
        )

        metric2.markdown(
            f'<div class="metric-box">Confidence<br><b>{confidence:.2f}</b></div>',
            unsafe_allow_html=True
        )

        metric3.markdown(
            f'<div class="metric-box">Camera<br><b>ONLINE</b></div>',
            unsafe_allow_html=True
        )

        # -----------------------------
        # FRAME UI
        # -----------------------------
        if status == "CORROSION":
            color = (0, 165, 255)
        elif status == "LEAKAGE":
            color = (0, 0, 255)
        else:
            color = (0, 255, 0)

        cv2.rectangle(frame, (10, 10), (500, 60), color, -1)

        cv2.putText(
            frame,
            f"{status} | {confidence:.2f}",
            (20, 45),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (255, 255, 255),
            2
        )

        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        frame_window.image(frame, channels="RGB")

        time.sleep(0.03)

    cap.release()