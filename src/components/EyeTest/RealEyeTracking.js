import React, { useState, useEffect, useRef, useCallback } from 'react';
import './RealEyeTracking.css';

class KalmanFilter {
  constructor(R = 0.01, Q = 0.1) {
    this.R = R; this.Q = Q; this.p = 1; this.k = 1; this.x = null;
  }
  update(measurement) {
    if (this.x === null) { this.x = measurement; return this.x; }
    this.p += this.Q; this.k = this.p / (this.p + this.R);
    this.x += this.k * (measurement - this.x); this.p *= (1 - this.k);
    return this.x;
  }
}

const CALIBRATION_POINTS = [
  { x:0.1, y:0.1 },{ x:0.5, y:0.1 },{ x:0.9, y:0.1 },
  { x:0.1, y:0.5 },{ x:0.5, y:0.5 },{ x:0.9, y:0.5 },
  { x:0.1, y:0.9 },{ x:0.5, y:0.9 },{ x:0.9, y:0.9 }
];
const CLICKS_PER_POINT = 2;
const CLICK_DELAY_MS    = 500;
const TEST_DURATION_MS  = 30000; 

export default function RealEyeTracking({ setCurrentTest }) {
  const [mode, setMode] = useState(null); 
  const [status, setStatus] = useState('Initializing system...'); 
  const [statusType, setStatusType] = useState('info'); 
  const [webgazerReady, setWebgazerReady] = useState(false); 
  const [isCameraActuallyActive, setIsCameraActuallyActive] = useState(false);
  const [cameraError, setCameraError] = useState(false); 
  const [calibrationState,setCalibrationState] = useState({
    isCalibrating: false, currentPointIndex: 0, clicksMade: 0, completedPoints: 0
  });
  const [gazePosition, setGazePosition] = useState({ x:null, y:null });
  const [canClick, setCanClick] = useState(true);
  const [timeLeft, setTimeLeft] = useState(TEST_DURATION_MS/1000);
  const [targetPosition, setTargetPosition] = useState({ x:10, y:10 });
  const [testResults, setTestResults] = useState(null);

  const isMountedRef     = useRef(true);
  const xFilter          = useRef(new KalmanFilter());
  const yFilter          = useRef(new KalmanFilter());
  const lastUpdateTime   = useRef(0);
  const trackingAreaRef  = useRef(null);
  const targetInterval   = useRef(null);
  const countdownInterval= useRef(null);
  const accuracyInterval = useRef(null);
  const gazeDisplayRef   = useRef({ x:null, y:null });
  const targetDisplayRef = useRef(targetPosition);
  const startTimeRef     = useRef(null);
  const accuracyRef      = useRef([]);
  const gazeProcessingLogicRef = useRef(null);

  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { gazeDisplayRef.current = gazePosition; }, [gazePosition]);
  useEffect(() => { targetDisplayRef.current = targetPosition; }, [targetPosition]);

  // CORE: WebGazer mount/unmount logic
  useEffect(() => {
    isMountedRef.current = true;
    // Only manage webgazer session; script loaded in index.html
if (window.webgazer) {
  try {
    window.webgazer.end();
  } catch {}
  try {
    window.webgazer.begin();
    window.webgazer.setGazeListener((data, timestamp) => {
      if (gazeProcessingLogicRef.current) {
        gazeProcessingLogicRef.current(data);
      }
    });
  } catch {}
  setWebgazerReady(true);
  setIsCameraActuallyActive(true);
  setStatus('System ready. Choose a mode.');
  setStatusType('success');
    } else {
      setStatus('Error: webgazer not loaded. Check network or script in index.html.');
      setStatusType('error');
      setCameraError(true);
      setWebgazerReady(false);
      setIsCameraActuallyActive(false);
    }
    return () => {
      isMountedRef.current = false;
      if (window.webgazer) {
        try { window.webgazer.end(); } catch {}
      }
    };
    // eslint-disable-next-line
  }, []);

  const calculateAccuracy = useCallback((gazeCoords, targetCoordsPct, container) => {
    if (!container || typeof gazeCoords.x !== 'number' || typeof gazeCoords.y !== 'number') return 0;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return 0;
    const targetActualX = (targetCoordsPct.x / 100) * rect.width;
    const targetActualY = (targetCoordsPct.y / 100) * rect.height;
    const dist = Math.hypot(gazeCoords.x - targetActualX, gazeCoords.y - targetActualY);
    const maxDist = Math.hypot(rect.width, rect.height);
    return Math.max(0, Math.min(100, 100 - (dist / maxDist * 100)));
  }, []);

  const calculateConsistency = useCallback((samples) => { 
    if (!Array.isArray(samples) || samples.length < 2) return '0.0';
    const validSamples = samples.filter(s => typeof s === 'number' && !isNaN(s));
    if (validSamples.length < 2) return '0.0';
    const mean = validSamples.reduce((acc, val) => acc + val, 0) / validSamples.length;
    if (mean === 0) return '0.0';
    const variance = validSamples.reduce((acc, val) => acc + (val - mean) ** 2, 0) / validSamples.length;
    const stdDev = Math.sqrt(variance);
    const consistencyScore = 100 - (stdDev / mean * 100);
    return Math.max(0, Math.min(100, consistencyScore)).toFixed(1);
  }, []);

  const moveTargetAroundEdge = useCallback(() => {
    setTargetPosition(prevPos => {
      let { x, y } = prevPos; const speed = 0.75; 
      const boundaryMin = 10, boundaryMax = 90;
      if (x < boundaryMax && y <= boundaryMin) { x += speed; y = boundaryMin;} else if (y < boundaryMax && x >= boundaryMax) { y += speed; x = boundaryMax;}
      else if (x > boundaryMin && y >= boundaryMax) { x -= speed; y = boundaryMax;} else if (y > boundaryMin && x <= boundaryMin) { y -= speed; x = boundaryMin;}
      else { x = boundaryMin + speed; y = boundaryMin; }
      x = Math.max(boundaryMin, Math.min(boundaryMax, x)); y = Math.max(boundaryMin, Math.min(boundaryMax, y));
      return { x, y };
    });
  }, []);

  const updateGazeDataProcessing = useCallback((gazeData) => {
    if (!gazeData || !isMountedRef.current || !webgazerReady) return; 

    const filteredX = xFilter.current.update(gazeData.x);
    const filteredY = yFilter.current.update(gazeData.y);
    const now = Date.now();

    if (now - lastUpdateTime.current > 16) { 
      if (trackingAreaRef.current) {
        const rect = trackingAreaRef.current.getBoundingClientRect();
        const gazePxX = Math.max(0, Math.min(filteredX - rect.left, rect.width));
        const gazePxY = Math.max(0, Math.min(filteredY - rect.top, rect.height));
        setGazePosition({ x: gazePxX, y: gazePxY });
      }
      lastUpdateTime.current = now;
    }
  }, [webgazerReady]); 

  useEffect(() => {
    gazeProcessingLogicRef.current = updateGazeDataProcessing;
  }, [updateGazeDataProcessing]);
  
  const stableGazeCallback = useRef((gazeData, clockTimestamp) => {
    if (gazeProcessingLogicRef.current) {
      gazeProcessingLogicRef.current(gazeData);
    }
  }).current;

  const stopAllIntervals = useCallback(() => {
    if (targetInterval.current) { clearInterval(targetInterval.current); targetInterval.current = null; }
    if (countdownInterval.current) { clearInterval(countdownInterval.current); countdownInterval.current = null; }
    if (accuracyInterval.current) { clearInterval(accuracyInterval.current); accuracyInterval.current = null; }
  }, []);

  const endTest = useCallback(async (early = false) => {
    stopAllIntervals(); 
    if (modeRef.current !== 'test' && !early) return;
    try {
      const validSamples = accuracyRef.current.filter(s => typeof s === 'number' && !isNaN(s));
      const avgAccuracy = validSamples.length ? validSamples.reduce((a, b) => a + b, 0) / validSamples.length : 0;
      const duration = (early && startTimeRef.current) 
                        ? ((Date.now() - startTimeRef.current) / 1000).toFixed(1) 
                        : (TEST_DURATION_MS / 1000).toFixed(1);
      if(isMountedRef.current) {
        setTestResults({
          accuracy: avgAccuracy.toFixed(1),
          consistency: calculateConsistency(validSamples), 
          duration: duration,
          samples: validSamples.length
        });
        setTimeLeft(0); 
        setMode('results'); 
        setStatus(early ? 'Test ended early. View results.' : 'Test complete. View your results.');
        setStatusType('success');
      }
    } catch (error) {
      if (isMountedRef.current) {
        setMode('results'); 
        setStatus('Error processing test results. Displaying available data.');
        setStatusType('error');
      }
    }
  }, [calculateConsistency, stopAllIntervals]); 

  const endTestRef = useRef(endTest);
  useEffect(() => { endTestRef.current = endTest; }, [endTest]);

  const startCalibrationMode = useCallback(async () => {
    if (!webgazerReady) {
      setStatus('System not ready. Please wait.'); setStatusType('error'); 
      return;
    }
    setMode('calibration');
    setCalibrationState({ isCalibrating: true, currentPointIndex: 0, clicksMade: 0, completedPoints: 0 });
    setStatus(`Point 1/${CALIBRATION_POINTS.length} - Click ${CLICKS_PER_POINT} times`);
    setStatusType('info');
  }, [webgazerReady]);

  const handleCalibrationClick = useCallback(async () => {
    if (!calibrationState.isCalibrating || !webgazerReady || !canClick) return;
    setCanClick(false);
    setTimeout(() => { if(isMountedRef.current) setCanClick(true); }, CLICK_DELAY_MS);

    let { clicksMade, currentPointIndex, completedPoints } = calibrationState;
    clicksMade++;
    let newState = { ...calibrationState, clicksMade };

    if (clicksMade >= CLICKS_PER_POINT) {
      completedPoints++;
      const nextPtIdx = currentPointIndex + 1;
      if (nextPtIdx < CALIBRATION_POINTS.length) {
        newState = { isCalibrating: true, currentPointIndex: nextPtIdx, clicksMade: 0, completedPoints };
        if(isMountedRef.current) setStatus(`Point ${nextPtIdx + 1}/${CALIBRATION_POINTS.length} - Click ${CLICKS_PER_POINT} times`);
      } else { 
        newState = { ...calibrationState, isCalibrating: false, currentPointIndex: 0, clicksMade: 0, completedPoints:0 };
        if(isMountedRef.current) {
          setStatus('Calibration complete! System remains active.'); 
          setMode(null); 
          setStatusType('success');
        }
      }
    } else {
      if(isMountedRef.current) setStatus(`Point ${currentPointIndex + 1}/${CALIBRATION_POINTS.length} - ${CLICKS_PER_POINT - clicksMade} clicks left`);
    }
    if(isMountedRef.current) setCalibrationState(newState);
  }, [calibrationState, webgazerReady, canClick]);

  const endCalibration = useCallback(async () => { 
    setCalibrationState({ isCalibrating: false, currentPointIndex: 0, clicksMade: 0, completedPoints: 0 });
    setMode(null);
    setStatus('Calibration canceled. System remains active.');
    setStatusType('info');
  }, []);

  const startTestMode = useCallback(async () => {
    if (!webgazerReady) {
      setStatus('System not ready. Please wait or calibrate.'); setStatusType('error'); 
      return;
    }
    startTimeRef.current = Date.now();
    setMode('test'); 
    setTestResults(null);
    setTimeLeft(TEST_DURATION_MS / 1000);
    setTargetPosition({ x: 10 + Math.random() * 80, y: 10 + Math.random() * 80 }); 
    accuracyRef.current = [];
    setStatus(`Follow the blue dot - ${TEST_DURATION_MS / 1000}s left`);
    setStatusType('info');
    if (targetInterval.current) clearInterval(targetInterval.current);
    targetInterval.current = setInterval(moveTargetAroundEdge, 50); 
    if (accuracyInterval.current) clearInterval(accuracyInterval.current);
    accuracyInterval.current = setInterval(() => {
      if (isMountedRef.current && modeRef.current === 'test' && trackingAreaRef.current && webgazerReady) { 
        const acc = calculateAccuracy(gazeDisplayRef.current, targetDisplayRef.current, trackingAreaRef.current);
        accuracyRef.current.push(acc);
      } else if (!isMountedRef.current || modeRef.current !== 'test') {
        if(accuracyInterval.current) {
          clearInterval(accuracyInterval.current);
          accuracyInterval.current = null;
        }
      }
    }, 500);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    countdownInterval.current = setInterval(() => {
      setTimeLeft(prevTimeLeft => {
        if (!isMountedRef.current) { 
          if (countdownInterval.current) clearInterval(countdownInterval.current);
          countdownInterval.current = null;
          return prevTimeLeft; 
        }
        if (prevTimeLeft <= 1) { 
          if (countdownInterval.current) { 
            clearInterval(countdownInterval.current);
            countdownInterval.current = null; 
          }
          endTestRef.current(false); 
          return 0; 
        }
        const nextTime = prevTimeLeft - 1;
        if (modeRef.current === 'test' && isMountedRef.current) { 
          setStatus(`Follow the blue dot - ${nextTime}s left`);
        }
        return nextTime;
      });
    }, 1000);
  }, [webgazerReady, moveTargetAroundEdge, calculateAccuracy]);

  const handleBackToMenu = useCallback(async () => { 
    setMode(null); setTestResults(null);
    setTimeLeft(TEST_DURATION_MS / 1000);
    setGazePosition({ x: null, y: null }); 
    setStatus('System ready. Choose a mode.'); setStatusType('info');
  }, []);

  const handleReturnHome = useCallback(() => {
    setCurrentTest('home');
  }, [setCurrentTest]);

  const retrySystemSetup = useCallback(async () => {
    if (isMountedRef.current) {
      setStatus('Retrying system setup...'); setStatusType('info');
      setCameraError(false);
      setWebgazerReady(false); 
      setIsCameraActuallyActive(false);
      setMode(null);
      // Try restart webgazer if script is loaded
      if (window.webgazer) {
        try { window.webgazer.end(); } catch {}
        try { window.webgazer.begin(); } catch {}
        setWebgazerReady(true);
        setIsCameraActuallyActive(true);
        setStatus('System ready. Choose a mode.');
        setStatusType('success');
      } else {
        setStatus('Error: webgazer not loaded. Check network or script in index.html.');
        setStatusType('error');
        setCameraError(true);
        setWebgazerReady(false);
        setIsCameraActuallyActive(false);
      }
    }
  }, []);

  const getCalibrationPointStyle = useCallback(() => { 
    if (!calibrationState.isCalibrating || !CALIBRATION_POINTS[calibrationState.currentPointIndex]) return { display: 'none' };
    const pt = CALIBRATION_POINTS[calibrationState.currentPointIndex];
    return {
      left: `${pt.x * 100}%`, top: `${pt.y * 100}%`,
      opacity: Math.min(1, 0.2 * calibrationState.clicksMade + 0.2),
      backgroundColor: calibrationState.clicksMade >= CLICKS_PER_POINT ? 'yellow' : 'red'
    };
  }, [calibrationState]);

  const calibrationProgress = calibrationState.isCalibrating
    ? ((calibrationState.completedPoints * CLICKS_PER_POINT + calibrationState.clicksMade) /
       (CALIBRATION_POINTS.length * CLICKS_PER_POINT)) * 100
    : 0;

  const commonButtonDisabled = !webgazerReady || cameraError;

  return (
    <div className="eye-test-container">
      <div className="header-section">
        <h2>Eye Tracking Test</h2>
        <div className={`status ${statusType}`}>{status}</div>
      </div>
      <div className="main-content">
        {cameraError && !webgazerReady ? ( 
          <div className="error-panel">
            <p>A camera or system initialization error occurred. Status: {status}</p>
            <button onClick={retrySystemSetup} className="retry-button">Retry System Setup</button>
            <div className="troubleshooting"> <p>Tips:</p> <ol> <li>Ensure browser has camera permissions for this site.</li> <li>Check if another app is using the camera.</li> <li>Good lighting is important.</li> </ol> </div>
          </div>
        ) : mode === 'results' ? (
          <div className="results-panel">
            <h3>Test Results</h3>
            <div className="result-item"><span className="result-label">Accuracy:</span><span className="result-value">{testResults?.accuracy}%</span><span className="result-description">(Closeness to target)</span></div>
            <div className="result-item"><span className="result-label">Consistency:</span><span className="result-value">{testResults?.consistency}%</span><span className="result-description">(Steadiness)</span></div>
            <div className="result-item"><span className="result-label">Duration:</span><span className="result-value">{testResults?.duration}s</span></div>
            <div className="result-item"><span className="result-label">Samples:</span><span className="result-value">{testResults?.samples}</span></div>
            <button type="button" onClick={handleBackToMenu} className="control-button"> Back to Menu </button>
          </div>
        ) : mode === 'calibration' ? (
          <div className="calibration-view">
            <div className="tracking-area" onClick={handleCalibrationClick} ref={trackingAreaRef}>
              {calibrationState.isCalibrating && <div className="calibration-point" style={getCalibrationPointStyle()} />}
            </div>
            <div className="calibration-progress"> <progress value={calibrationProgress} max="100" /> <span>{Math.round(calibrationProgress)}% complete</span> </div>
            <div className="button-row"><button onClick={endCalibration} className="exit-button">Exit Calibration</button></div>
            <div className="calibration-instructions"> <p>Click each red point until it turns yellow ({CLICKS_PER_POINT} clicks per point). Remain still.</p> </div>
          </div>
        ) : mode === 'test' ? (
          <div className="test-view">
            <div className="tracking-area" ref={trackingAreaRef}>
  {/* Blue target dot (only once) */}
  <div className="target-dot" style={{ left: `${targetPosition.x}%`, top: `${targetPosition.y}%` }} />
  
  {/* Green gaze dot */}
  {webgazerReady && gazePosition && typeof gazePosition.x === 'number' && typeof gazePosition.y === 'number' && (
    <div className="gaze-indicator" style={{
      left: `${gazePosition.x}px`,
      top: `${gazePosition.y}px`
    }} />
  )}
</div>
            <div className="button-row"><button onClick={() => endTestRef.current(true)} className="exit-button">End Test Early</button></div>
          </div>
        ) : ( 
          <div className="mode-selection">
            <div className="mode-card">
              <h3>Calibration</h3>
              <p className="mode-description">Calibrate eye tracker for accuracy ({CLICKS_PER_POINT} clicks per point on {CALIBRATION_POINTS.length} points).</p>
              <button onClick={startCalibrationMode} disabled={commonButtonDisabled}
                      className={`mode-button ${commonButtonDisabled ? 'disabled' : ''}`}>
                Start Calibration
              </button>
            </div>
            <div className="mode-card">
              <h3>Eye Test</h3>
              <p className="mode-description">Follow the moving target for {TEST_DURATION_MS / 1000} seconds.</p>
              <button onClick={startTestMode} disabled={commonButtonDisabled} 
                      className={`mode-button ${commonButtonDisabled ? 'disabled' : ''}`}>
                Start Test
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
