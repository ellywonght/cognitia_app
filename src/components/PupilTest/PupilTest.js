import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import './PupilTest.css'; // Ensure this CSS file is updated with new styles below

const calculateStdDev = (arr) => {
  if (!arr || arr.length === 0) return 0;
  const validValues = arr.filter(val => typeof val === 'number' && !isNaN(val));
  if (validValues.length === 0) return 0;
  const mean = validValues.reduce((acc, val) => acc + val, 0) / validValues.length;
  const variance = validValues.reduce((acc, val) => acc + (val - mean) ** 2, 0) / validValues.length;
  return Math.sqrt(variance);
};

const getConstrictionCategory = (percentage) => {
  const numericPercent = parseFloat(percentage);
  if (isNaN(numericPercent) || numericPercent === null) {
    return { category: "N/A", color: "var(--response-na)", advice: "Data not available or insufficient for an average." };
  }

  if (numericPercent >= 25) return { category: "Strong Response", color: "var(--response-strong)", advice: "A strong pupillary light reflex was detected." };
  if (numericPercent >= 15) return { category: "Moderate Response", color: "var(--response-moderate)", advice: "A moderate pupillary light reflex was detected." };
  if (numericPercent >= 5) return { category: "Reduced Response", color: "var(--response-reduced)", advice: "Pupillary response appears reduced. Consider rechecking setup (monitor brightness, room darkness) if retrying." };
  return { category: "Minimal/No Constriction", color: "var(--response-minimal)", advice: "Minimal or no constriction detected. This strongly suggests issues with measurement precision, setup (especially insufficient monitor brightness for the flash or inadequate darkness for baseline), or a significantly reduced/absent reflex." };
};

const calculatePointerPosition = (actualValue, minValOnScale, maxValOnScale) => {
  if (actualValue === null || actualValue === undefined || isNaN(parseFloat(actualValue))) return 0; 
  const numericValue = parseFloat(actualValue);
  if (numericValue <= minValOnScale) return 0;
  if (numericValue >= maxValOnScale) return 100;
  if (maxValOnScale <= minValOnScale) return 0; 
  return ((numericValue - minValOnScale) / (maxValOnScale - minValOnScale)) * 100;
};

function PerformanceScale({ title, value, unit, scaleParams, pointerPos, analysisComment }) {
  return (
    <div className="performance-scale-container">
      <h4>{title}: {value !== null && value !== undefined ? `${value}${unit}` : "N/A"}</h4>
      <div className="scale-bar-wrapper">
        <div className="scale-bar">
          {scaleParams.segments.map((segment, index) => {
            const scaleMin = scaleParams.min;
            const scaleMax = scaleParams.max;
            const segmentStartOnScale = (index === 0) ? scaleMin : scaleParams.segments[index - 1].limit;
            let segmentEndOnScale = segment.limit;
            if (segment.limit === Infinity && index === scaleParams.segments.length -1) {
                segmentEndOnScale = scaleMax;
            }
            const displayStart = Math.max(scaleMin, segmentStartOnScale);
            let displayEnd = Math.min(scaleMax, segmentEndOnScale);
            
            let widthPercent = 0;
            if (displayEnd > displayStart && scaleMax > scaleMin) {
              widthPercent = ((displayEnd - displayStart) / (scaleMax - scaleMin)) * 100;
            }

            return widthPercent > 0 ? (
              <div
                key={segment.label}
                className="scale-segment"
                style={{ width: `${widthPercent}%`, backgroundColor: segment.color }}
                title={`${segment.label}: ${segmentStartOnScale}-${segmentEndOnScale === Infinity ? 'above' : segmentEndOnScale}${unit}`}
              ></div>
            ) : null;
          })}
        </div>
        <div 
          className="scale-pointer" 
          style={{ left: `${pointerPos}%` }}
          title={`Your value: ${value}${unit}`}
        >▼</div> 
        <div className="scale-thresholds">
          <span className="scale-threshold-label" style={{ left: `0%` }}>{scaleParams.min}{unit}</span>
          {scaleParams.thresholds.map(thr => {
            const pos = calculatePointerPosition(thr, scaleParams.min, scaleParams.max);
            if (pos > 5 && pos < 95) { 
              return <span key={thr} className="scale-threshold-label" style={{ left: `${pos}%` }}>{thr}{unit}</span>;
            }
            return null;
          })}
          <span className="scale-threshold-label" style={{ right: `0%`, transform: 'translateX(50%)' }}>{scaleParams.max}{unit}</span>
        </div>
      </div>
      {analysisComment && (
        <p className="scale-analysis-comment">{analysisComment}</p>
      )}
    </div>
  );
}

const AutoCalibrationCheckOverlayUI = memo(({
  isCameraInitializing,
  isCameraReady,
  currentLiveDiameter,
  calibrationSignalQuality,
  calibrationReadings,
  measurementError,
  onCancelAndReturn, 
  baselineDotRadius,
  isFinalizing 
}) => {
  let statusMessage = "";
  let qualityColor = "var(--dim-overlay-text-secondary)"; 
  let helperText = "";

  if (isCameraInitializing) {
    statusMessage = "Initializing camera for detection check...";
  } else if (!isCameraReady) {
    statusMessage = "Camera not ready. Please wait or check permissions.";
  } else {
    if (calibrationSignalQuality === 'Initializing...' && calibrationReadings.length === 0 && !currentLiveDiameter) {
      statusMessage = "Attempting to detect face/eyes...";
      helperText = "Ensure your face is well-lit and centered in the camera view. Looking for pupil...";
    } else {
      statusMessage = calibrationSignalQuality;
      if (calibrationSignalQuality.startsWith('Good')) {
        qualityColor = 'var(--response-strong)';
        helperText = isFinalizing ? "Detection is good! Finalizing and preparing test..." : "Detection is good! Hold steady...";
      } else if (calibrationSignalQuality.startsWith('Fair')) {
        qualityColor = 'var(--response-reduced)';
        helperText = "Almost there! Hold head very still for a more stable reading.";
      } else if (calibrationSignalQuality.startsWith('Poor')) {
        qualityColor = 'var(--response-minimal)';
        helperText = "Trying to stabilize detection. Adjust position if needed, ensure face is gently lit. Hold still.";
      } else { 
         helperText = "Keep focusing on the ring. Trying to get a stable reading.";
      }
    }
  }

  return (
    <div className="full-black-overlay" style={{ backgroundColor: 'var(--dark-overlay-bg)' }}>
      <div className="calibration-overlay-content-wrapper" style={{ color: 'var(--dim-overlay-text-primary)' }}>
        <h3>Automatic Detection Check</h3>
        <p>Please focus on the central ring and hold still.</p>
        
        <div className="ring-indicator" style={{ borderColor: 'rgba(200, 200, 200, 0.25)', margin: '20px auto' }}>
          <div className="pupil-dot" style={{
            width: baselineDotRadius,
            height: baselineDotRadius,
            background: 'var(--dark-overlay-bg)' 
          }}/>
        </div>

        <div className="calibration-feedback" style={{ margin: '20px auto', padding: '15px', background: 'rgba(50,50,50,0.5)', borderRadius: '8px', maxWidth: '450px' }}>
          <p>Live Pupil Diameter: <strong>{currentLiveDiameter || 'N/A'} px</strong></p>
          <p style={{ fontWeight: 'bold', marginTop: '10px' }}>
            Detection Quality: <strong style={{ color: qualityColor }}>
              {statusMessage}
            </strong>
          </p>
        </div>

        {helperText && !measurementError && (
          <p className="warning-text" style={{ marginTop: '10px', color: 'var(--dim-overlay-text-secondary)' }}>{helperText}</p>
        )}

        {measurementError && (
          <>
            <div className="error-message" style={{ marginTop: '15px', background: 'rgba(210, 140, 60, 0.2)', color: 'var(--dim-warning-text-on-dark)', borderColor: 'var(--dim-warning-text-on-dark)' }}>{measurementError}</div>
            <button 
              className="secondary-button" 
              style={{ marginTop: '15px', background: 'var(--dim-button-bg-on-dark)', color: 'var(--dim-button-text-on-dark)', border: '1px solid var(--dim-button-text-on-dark)' }}
              onClick={onCancelAndReturn}
            >
              Try Setup Again
            </button>
          </>
        )}
        
        {!calibrationSignalQuality.startsWith('Good') && !measurementError && !isCameraInitializing && isCameraReady && (
          <button
            className="secondary-button"
            style={{ marginTop: '20px', background: 'var(--dim-button-bg-on-dark)', color: 'var(--dim-button-text-on-dark)', border: '1px solid var(--dim-button-text-on-dark)' }}
            onClick={onCancelAndReturn}
          >
            Cancel and Return to Preparation
          </button>
        )}
      </div>
    </div>
  );
});

// RE-INSERTED TestCycleOverlay component definition
const TestCycleOverlay = memo(({ 
    overlayState, 
    cycleIndex, 
    lightFlashDurations, 
    currentLiveDiameter, 
    detectionWarning, 
    baselineDotRadius 
}) => {
    // Constants for colors, should match those in PupilTest main component if not passed as props
    const darkOverlayColor = 'rgb(0,0,0)'; 
    const lightOverlayColor = '#FFFFFF';

    if (overlayState.type !== 'baseline' && overlayState.type !== 'flash') return null;
    
    const baseClass = overlayState.type === 'flash' ? 'full-flash-overlay' : 'full-black-overlay';
    // Use overlayState.color if provided, otherwise fallback to type-based color
    const bgColor = overlayState.color || (overlayState.type === 'flash' ? lightOverlayColor : darkOverlayColor);

    return (
      <div className={baseClass} style={{ backgroundColor: bgColor }}>
        {overlayState.type === 'baseline' && (
          <>
            <div className="overlay-text">
              Cycle {cycleIndex + 1} of {lightFlashDurations.length}: Focus on the dot
            </div>
            <div className="ring-indicator"><div className="pupil-dot" style={{ width: baselineDotRadius, height: baselineDotRadius, background: darkOverlayColor /* Dot is dark on dark overlay */ }}/></div>
            {currentLiveDiameter && (<div className="live-feedback">{currentLiveDiameter}px</div>)}
            {detectionWarning && (<div className="error-message overlay-error">{detectionWarning}</div>)}
          </>
        )}
        {/* Flash overlay usually doesn't have text, but you can add if needed */}
      </div>
    );
});


export default function PupilTest({ setCurrentTest }) {
  const baselineDotRadius = 80;
  const perCycleBaselineDarkAdaptationDuration = 5000;
  const lightFlashDurations = [1500, 1500, 1500];
  const constrictionMeasurementStartDelay = 280;
  const constrictionSamplingWindowDuration = 250;
  const constrictionSamplesCount = 25;
  const baselineSamplesCount = 40;
  const baselineSamplingWindowDuration = 400;

  const [step, setStep] = useState('intro');
  const [cycleIndex, setCycleIndex] = useState(0);
  const [overlayState, setOverlayState] = useState({ type: null, isTransitioning: false, color: 'rgb(0,0,0)' });
  const [testMetrics, setTestMetrics] = useState([]);
  const [rawReadingsLog, setRawReadingsLog] = useState([]);
  const [recallInput, setRecallInput] = useState('');
  const [isRecallCorrect, setIsRecallCorrect] = useState(null);
  const [currentLiveDiameter, setCurrentLiveDiameter] = useState(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCameraInitializing, setIsCameraInitializing] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);
  const [showPermissionError, setShowPermissionError] = useState(false);
  const [measurementError, setMeasurementError] = useState(null);
  const [detectionWarning, setDetectionWarning] = useState(null);

  const [calibrationReadings, setCalibrationReadings] = useState([]);
  const [calibrationSignalQuality, setCalibrationSignalQuality] = useState('Initializing...');
  const [calibrationProceedEnabled, setCalibrationProceedEnabled] = useState(false); 
  const [isFinalizingDetection, setIsFinalizingDetection] = useState(false); 

  const [isCycleRunning, setIsCycleRunning] = useState(false);

  const videoRef = useRef(null);
  const faceMeshRef = useRef(null);
  const canvasRef = useRef(document.createElement('canvas'));
  const liveDiameterRef = useRef(null);
  const memoryNumberRef = useRef(Math.floor(100 + Math.random() * 900));
  const streamRef = useRef(null);
  const initializationTimeoutRef = useRef(null);
  const noDetectionTimerRef = useRef(null);
  
  const autoProceedAttemptedRef = useRef(false); 
  const autoCheckStartTimeRef = useRef(null); 
  const goodQualityTimestampRef = useRef(null); 

  const darkOverlayColor = 'rgb(0,0,0)'; // Defined here for use in runSingleTestCycle
  const lightOverlayColor = '#FFFFFF'; // Defined here for use in runSingleTestCycle

  const MIN_AUTO_CHECK_DURATION = 4000; 
  const MIN_GOOD_QUALITY_DURATION = 1500; 

  const utilityDelay = ms => new Promise(resolve => setTimeout(resolve, ms));

  const cleanupCameraAndFaceMesh = useCallback(() => {
    console.log('[PupilTest] Cleaning up camera and FaceMesh...');
    if (faceMeshRef.current && typeof faceMeshRef.current.close === 'function') {
      faceMeshRef.current.close().catch(e => console.error("[PupilTest] Error closing facemesh", e));
      faceMeshRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      console.log('[PupilTest] MediaStream stopped.');
    }
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject = null;
    }
    setIsCameraReady(false);
    setIsCameraInitializing(false);
  }, []);

  const handleFaceMeshResults = useCallback(({ multiFaceLandmarks }) => {
    const currentStep = step; 
    if (!multiFaceLandmarks?.length) {
      liveDiameterRef.current = null;
      setCurrentLiveDiameter(prev => prev === null ? null : null);
      if (currentStep === 'testing' && !noDetectionTimerRef.current) {
        noDetectionTimerRef.current = setTimeout(() => {
          setDetectionWarning('Face not detected. Please face the camera directly.');
        }, 2000);
      }
      if (currentStep === 'autoCalibrationCheck') {
        setCalibrationReadings(prev => [...prev, null].slice(-20));
      }
      return;
    }
    if (noDetectionTimerRef.current) { clearTimeout(noDetectionTimerRef.current); noDetectionTimerRef.current = null; setDetectionWarning(null); }

    const landmarks = multiFaceLandmarks[0];
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const irisLandmarks = landmarks.slice(468, 473);
    const points = irisLandmarks.map(p => [p.x * canvasWidth, p.y * canvasHeight]);

    if (points.length < 2) { liveDiameterRef.current = null; setCurrentLiveDiameter(null); return; }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(([x, y]) => {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    });
    const horizontalDiameter = maxX - minX;
    const verticalDiameter = maxY - minY;
    const diameter = Math.max(horizontalDiameter, verticalDiameter);

    if (diameter < 3 || diameter > 70) {
      liveDiameterRef.current = null;
      setCurrentLiveDiameter(null);
      if (currentStep === 'autoCalibrationCheck') setCalibrationReadings(prev => [...prev, null].slice(-20));
      return;
    }

    liveDiameterRef.current = diameter;
    const newDiameterStr = diameter.toFixed(1);
    setCurrentLiveDiameter(prev => prev === newDiameterStr ? prev : newDiameterStr);

    if (currentStep === 'autoCalibrationCheck') {
      setCalibrationReadings(prev => [...prev, diameter].slice(-20));
    }
  }, [step]);

  const processVideoFrame = useCallback(async () => {
    const currentStep = step;
    if (!faceMeshRef.current || !videoRef.current || !videoRef.current.srcObject || videoRef.current.readyState < HTMLMediaElement.HAVE_METADATA || !streamRef.current) {
      if (streamRef.current && videoRef.current?.readyState < HTMLMediaElement.HAVE_METADATA) {
        requestAnimationFrame(processVideoFrame);
      }
      return;
    }
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (overlayState.type === 'baseline' || currentStep === 'autoCalibrationCheck') {
        context.filter = 'brightness(1.1) contrast(170%) grayscale(100%)';
    } else {
        context.filter = 'brightness(0.9) contrast(350%) grayscale(100%)';
    }
    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    if (faceMeshRef.current) {
        await faceMeshRef.current.send({ image: canvas });
    }
    if (streamRef.current) {
        requestAnimationFrame(processVideoFrame);
    }
  }, [overlayState.type, step]);

  const initializeCameraAndFaceMesh = useCallback(async (forCalibrationCheck = false) => {
    if (!hasCameraPermission) {
      setMeasurementError('Camera permission is not granted.');
      setShowPermissionError(true); setStep('intro'); return false;
    }
    if (isCameraInitializing) {
      console.log("[PupilTest] Camera initialization already in progress.");
      return false;
    }
    console.log(`[PupilTest] Initializing camera (forCalibrationCheck: ${forCalibrationCheck}).`);
    setIsCameraInitializing(true);
    setMeasurementError(null);
    setIsCameraReady(false); 

    if (streamRef.current) {
        console.log("[PupilTest] Stopping existing stream before new initialization.");
        cleanupCameraAndFaceMesh();
        setIsCameraInitializing(true); 
        await utilityDelay(100);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (!videoRef.current) {
        console.error("videoRef is null during init"); setIsCameraInitializing(false); return false;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      
      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;

      console.log('[PupilTest] window.FaceMesh:', window.FaceMesh);
      if (!window.FaceMesh) {
        throw new Error('FaceMesh constructor is not available on window object');
      }

      const faceMesh = new window.FaceMesh({
        locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
      });
      faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      faceMesh.onResults(handleFaceMeshResults);
      faceMeshRef.current = faceMesh;

      setIsCameraReady(true); 
      console.log('[PupilTest] Camera and FaceMesh initialized successfully.');
      requestAnimationFrame(processVideoFrame);
      setIsCameraInitializing(false);
      return true;
    } catch (error) {
      console.error('[PupilTest] Camera/FaceMesh initialization failed:', error);
      setMeasurementError(`Failed to initialize camera: ${error.message}. Ensure permissions and try again.`);
      cleanupCameraAndFaceMesh();
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setHasCameraPermission(false); setShowPermissionError(true); setStep('intro');
      }
      setIsCameraInitializing(false);
      return false;
    }
  }, [hasCameraPermission, isCameraInitializing, handleFaceMeshResults, processVideoFrame, cleanupCameraAndFaceMesh]);

  useEffect(() => {
    async function requestAndSetInitialCameraPermission() {
      setIsCheckingPermission(true); setShowPermissionError(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        setHasCameraPermission(true); setShowPermissionError(false);
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        setHasCameraPermission(false); setShowPermissionError(true);
        console.error('[PupilTest] Camera permission DENIED or error:', error);
      } finally {
        setIsCheckingPermission(false);
      }
    }
    if (step === 'intro') requestAndSetInitialCameraPermission();
  }, [step]);

  useEffect(() => { 
    if (step === 'autoCalibrationCheck') {
      const validReadings = calibrationReadings.filter(r => r !== null && !isNaN(r));
      const requiredSamples = 15;

      if (!isCameraReady || isCameraInitializing) {
        setCalibrationSignalQuality('Initializing camera...');
        setCalibrationProceedEnabled(false);
        goodQualityTimestampRef.current = null;
        return;
      }
      
      if (calibrationReadings.length < 5 && validReadings.length < 3) {
          setCalibrationSignalQuality('Initializing detection...');
          setCalibrationProceedEnabled(false);
          goodQualityTimestampRef.current = null;
          return;
      }

      if (validReadings.length < calibrationReadings.length * 0.6 || validReadings.length < 8) {
        setCalibrationSignalQuality(`Poor: Detection unstable (${validReadings.length}/${calibrationReadings.length} valid). Adjust position.`);
        setCalibrationProceedEnabled(false);
        goodQualityTimestampRef.current = null; 
      } else {
        const std = calculateStdDev(validReadings);
        if (std < 1.2 && validReadings.length >= requiredSamples) {
          if (!calibrationSignalQuality.startsWith('Good')) { 
            setCalibrationSignalQuality(`Good (Stability: ${std.toFixed(1)}px)`);
            goodQualityTimestampRef.current = Date.now(); 
          }
          setCalibrationProceedEnabled(true); 
        } else if (std < 2.5 && validReadings.length >=10) {
          setCalibrationSignalQuality(`Fair (Stability: ${std.toFixed(1)}px). Hold still.`);
          setCalibrationProceedEnabled(false);
          goodQualityTimestampRef.current = null;
        } else {
          setCalibrationSignalQuality(`Poor (Stability: ${std.toFixed(1)}px). Reading very unstable.`);
          setCalibrationProceedEnabled(false);
          goodQualityTimestampRef.current = null;
        }
      }
    } else { 
        goodQualityTimestampRef.current = null;
        setCalibrationProceedEnabled(false); 
    }
  }, [calibrationReadings, step, isCameraReady, isCameraInitializing, calibrationSignalQuality]);

  const samplePupilDiameterMedian = useCallback(async (samplesCount, sampleInterval, phase = "unknown") => {
    const readings = [];
    for (let i = 0; i < samplesCount; i++) {
      await utilityDelay(sampleInterval);
      readings.push(liveDiameterRef.current);
    }
    setRawReadingsLog(prev => [...prev, { cycle: cycleIndex, phase, timestamp: Date.now(), readings: [...readings], medianSource: 'beforeTrim' }]);
    
    const validReadings = readings.filter(r => r !== null && !isNaN(r));
    if (!validReadings.length) {
      console.warn(`[PupilTest] No valid pupil readings for ${phase} in cycle ${cycleIndex + 1}`);
      setRawReadingsLog(prev => {
          const lastLog = prev[prev.length-1];
          if(lastLog) lastLog.medianResult = null;
          return [...prev];
      });
      return null;
    }

    validReadings.sort((a, b) => a - b);
    
    const trimCount = validReadings.length >= 10 ? Math.floor(validReadings.length * 0.15) : 0;
    const trimmed = validReadings.slice(trimCount, validReadings.length - trimCount);
    
    let medianResult;
    if (!trimmed.length) {
        medianResult = validReadings[Math.floor(validReadings.length / 2)];
        setRawReadingsLog(prev => {
            const lastLog = prev[prev.length-1];
            if(lastLog) {lastLog.medianSource = 'fallbackNoTrimmed'; lastLog.medianResult = medianResult; }
            return [...prev];
        });
    } else {
        medianResult = trimmed[Math.floor(trimmed.length / 2)];
        setRawReadingsLog(prev => {
            const lastLog = prev[prev.length-1];
            if(lastLog) {lastLog.medianSource = 'trimmed'; lastLog.medianResult = medianResult; }
            return [...prev];
        });
    }
    console.log(`[PupilTest] [${Date.now()}] Raw readings for Cycle ${cycleIndex + 1} (${phase}):`, readings.map(r => r ? r.toFixed(1) : null), ` Valid: ${validReadings.length}, Median: ${medianResult?.toFixed(1)}`);
    return medianResult;
  }, [cycleIndex]);

  const runSingleTestCycle = useCallback(async (currentIndex) => {
    console.log(`[PupilTest] [${Date.now()}] Starting Cycle ${currentIndex + 1}`);
    setIsCycleRunning(true);
    liveDiameterRef.current = null; setCurrentLiveDiameter(null);
    setDetectionWarning(null);

    setOverlayState({ type: 'baseline', isTransitioning: false, color: darkOverlayColor });
    console.log(`[PupilTest] [${Date.now()}] Baseline Screen ON (Cycle ${currentIndex + 1})`);
    await utilityDelay(perCycleBaselineDarkAdaptationDuration - baselineSamplingWindowDuration);
    console.log(`[PupilTest] [${Date.now()}] Starting Baseline Sampling (Cycle ${currentIndex + 1})`);
    const measuredBaseline = await samplePupilDiameterMedian(
        baselineSamplesCount,
        Math.floor(baselineSamplingWindowDuration / baselineSamplesCount),
        "baseline"
    );
    console.log(`[PupilTest] [${Date.now()}] Baseline Measured: ${measuredBaseline?.toFixed(1) || 'N/A'} (Raw: ${measuredBaseline})`);
    setOverlayState({ type: null, isTransitioning: false, color: darkOverlayColor });
    console.log(`[PupilTest] [${Date.now()}] Baseline Screen OFF`);
    await utilityDelay(100);

    const currentFlashDuration = lightFlashDurations[currentIndex];
    setOverlayState({ type: 'flash', isTransitioning: false, color: lightOverlayColor });
    const flashOnTimestamp = Date.now();
    console.log(`[PupilTest] [${flashOnTimestamp}] Flash Screen ON. Planned: ${currentFlashDuration}ms`);
    
    if (constrictionMeasurementStartDelay > 0) await utilityDelay(constrictionMeasurementStartDelay);
    const samplingStartTs = Date.now();
    console.log(`[PupilTest] [${samplingStartTs}] Starting Constriction Sampling. Delay: ${samplingStartTs - flashOnTimestamp}ms. Window: ${constrictionSamplingWindowDuration}ms`);
    const measuredConstricted = await samplePupilDiameterMedian(
      constrictionSamplesCount,
      Math.floor(constrictionSamplingWindowDuration / constrictionSamplesCount),
      "constriction"
    );
    const samplingEndTs = Date.now();
    console.log(`[PupilTest] [${samplingEndTs}] Constriction Measured: ${measuredConstricted?.toFixed(1) || 'N/A'} (Raw: ${measuredConstricted}). Sampling duration: ${samplingEndTs - samplingStartTs}ms`);
    
    const elapsedFlashTimeForSampling = samplingEndTs - flashOnTimestamp;
    const remainingFlashTime = currentFlashDuration - elapsedFlashTimeForSampling;
    if (remainingFlashTime > 0) await utilityDelay(remainingFlashTime);
    
    setOverlayState({ type: null, isTransitioning: true, color: darkOverlayColor });
    console.log(`[PupilTest] [${Date.now()}] Flash Screen OFF. Total ON: ${Date.now() - flashOnTimestamp}ms`);

    let delta = '—', percent = '—', notes = '';
    if (measuredBaseline !== null && measuredConstricted !== null && !isNaN(measuredBaseline) && !isNaN(measuredConstricted)) {
        if (measuredBaseline > 0.1) {
            if (measuredConstricted < measuredBaseline) {
                const change = measuredBaseline - measuredConstricted;
                delta = change.toFixed(1);
                percent = Math.max(0, (change / measuredBaseline) * 100).toFixed(1);
            } else {
                delta = (0).toFixed(1);
                percent = (0).toFixed(1);
                notes = `Cycle ${currentIndex + 1}: No constriction detected (or pupil dilated).`;
                console.warn(`[PupilTest] Warning Cycle ${currentIndex + 1}: Baseline (${measuredBaseline.toFixed(1)}) <= Constricted (${measuredConstricted.toFixed(1)}).`);
            }
        } else {
             delta = '—'; percent = '—';
             notes = `Cycle ${currentIndex + 1}: Invalid baseline data.`;
             console.warn(`[PupilTest] Warning Cycle ${currentIndex + 1}: Invalid or too small baseline (${measuredBaseline?.toFixed(1)}).`);
        }
    } else {
      delta = '—'; percent = '—';
      notes = `Cycle ${currentIndex + 1}: Missing measurement data.`;
      console.warn(`[PupilTest] Missing data for Cycle ${currentIndex + 1}: B=${measuredBaseline}, C=${measuredConstricted}`);
    }

    setTestMetrics(prev => [...prev, {
        cycle: currentIndex + 1,
        baseline: measuredBaseline?.toFixed(1) || '—',
        constricted: measuredConstricted?.toFixed(1) || '—',
        delta,
        percent,
        notes,
        rawBaseline: measuredBaseline,
        rawConstricted: measuredConstricted
    }]);

    if (currentIndex + 1 < lightFlashDurations.length) {
      setCycleIndex(currentIndex + 1);
    } else {
      cleanupCameraAndFaceMesh();
      setStep('recall');
    }
    setIsCycleRunning(false);
  }, [samplePupilDiameterMedian, cleanupCameraAndFaceMesh, darkOverlayColor, lightOverlayColor, lightFlashDurations, perCycleBaselineDarkAdaptationDuration, baselineSamplingWindowDuration, baselineSamplesCount, constrictionMeasurementStartDelay, constrictionSamplingWindowDuration, constrictionSamplesCount, setCurrentLiveDiameter, setDetectionWarning, setOverlayState, setTestMetrics, setCycleIndex, setStep ]);

  const startActualTest = useCallback(async () => {
    console.log('[PupilTest] startActualTest CALLED.');
    setIsFinalizingDetection(false); 
    
    if (isCameraInitializing || isCycleRunning) {
        console.warn('[PupilTest] startActualTest called while camera initializing or cycle running. Aborting.');
        return;
    }

    try {
        setStep('initializing'); 

        if(initializationTimeoutRef.current) clearTimeout(initializationTimeoutRef.current);
        initializationTimeoutRef.current = setTimeout(() => {
          if (step === 'initializing' && !isCameraReady && !isCameraInitializing) {
              console.error('[PupilTest] Camera problem timeout before starting test.');
              setMeasurementError('Camera problem before starting test. Please try auto-calibration again.');
              cleanupCameraAndFaceMesh();
              setStep('preparation'); 
          }
        }, 7000); 

        if (isCameraReady) { 
            clearTimeout(initializationTimeoutRef.current);
            setTestMetrics([]); setRawReadingsLog([]); setCycleIndex(0); setMeasurementError(null);
            setOverlayState({ type: null, isTransitioning: false }); 
            setStep('testing');
        } else { 
            const initialized = await initializeCameraAndFaceMesh(false); 
            clearTimeout(initializationTimeoutRef.current);
            if (initialized) {
                setTestMetrics([]); setRawReadingsLog([]); setCycleIndex(0); setMeasurementError(null);
                setOverlayState({ type: null, isTransitioning: false }); 
                setStep('testing');
            } else {
                setMeasurementError("Failed to initialize camera for test. Please try again from preparation.");
                setOverlayState({ type: null, isTransitioning: false });
                setStep('preparation'); 
            }
        }
    } catch (error) {
        console.error("[PupilTest] CRITICAL ERROR in startActualTest:", error);
        setMeasurementError("A critical error occurred. Please try again.");
        setOverlayState({ type: null, isTransitioning: false });
        setStep('preparation');
    }
  }, [isCameraInitializing, isCycleRunning, isCameraReady, initializeCameraAndFaceMesh, cleanupCameraAndFaceMesh, step]); 


  useEffect(() => { 
    if (step === 'autoCalibrationCheck') {
      setOverlayState({ type: 'auto_calibration_overlay', isTransitioning: false }); 
      setIsFinalizingDetection(false); 
      if (!autoCheckStartTimeRef.current) {
        autoCheckStartTimeRef.current = Date.now();
        if (hasCameraPermission && !isCameraInitializing && !isCameraReady) {
          console.log("[PupilTest] useEffect: Triggering camera init for autoCalibrationCheck.");
          initializeCameraAndFaceMesh(true).then(success => { 
            if (success) {
              setCalibrationReadings([]); 
              console.log("[PupilTest] Camera initialized for auto calibration check.");
            } else {
              console.error("[PupilTest] Camera failed to initialize for auto calibration check.");
              setMeasurementError("Failed to start camera for detection check.");
            }
          });
        } else if (!hasCameraPermission && !isCameraInitializing) {
          setMeasurementError("Camera permission lost or not granted before detection check.");
        }
      }

      if (calibrationProceedEnabled && goodQualityTimestampRef.current && !autoProceedAttemptedRef.current) {
        const timeSinceGoodQuality = Date.now() - goodQualityTimestampRef.current;
        const totalTimeInStep = Date.now() - (autoCheckStartTimeRef.current || Date.now());
        
        if (timeSinceGoodQuality >= MIN_GOOD_QUALITY_DURATION && totalTimeInStep >= MIN_AUTO_CHECK_DURATION) {
          console.log("[PupilTest] Auto-proceeding: Quality good and all durations met.");
          autoProceedAttemptedRef.current = true; 
          setIsFinalizingDetection(false);
          startActualTest();
        } else {
          setIsFinalizingDetection(true); 
          console.log(`[PupilTest] Quality good. Waiting for durations. Time in step: ${totalTimeInStep}, Time good: ${timeSinceGoodQuality}`);
        }
      } else if (calibrationProceedEnabled && !goodQualityTimestampRef.current) {
        console.warn("[PupilTest] calibrationProceedEnabled is true, but goodQualityTimestampRef is not set.");
      } else {
        setIsFinalizingDetection(false); 
      }

    } else { 
      autoCheckStartTimeRef.current = null;
      goodQualityTimestampRef.current = null; 
      autoProceedAttemptedRef.current = false; 
      setIsFinalizingDetection(false);
      if (overlayState.type === 'auto_calibration_overlay') { 
        setOverlayState({ type: null, isTransitioning: false });
      }
    }
    
    if (step === 'testing') {
      if (isCameraReady && !isCameraInitializing && !isCycleRunning) {
        runSingleTestCycle(cycleIndex)
          .catch(error => {
            console.error("[PupilTest] Error in runSingleTestCycle:", error);
            setMeasurementError(prev => prev ? `${prev} Critical error in cycle.` : `Critical error in cycle.`);
            setIsCycleRunning(false); 
          });
      } else if (!isCameraReady && !isCameraInitializing && !isCycleRunning) {
        console.warn("[PupilTest] useEffect: In testing step but camera not ready. Attempting re-init.");
        setIsCycleRunning(true); 
        initializeCameraAndFaceMesh(false).then(success => { 
          if (!success) {
            setMeasurementError("Camera failed to initialize for the test cycles.");
            setStep('preparation'); 
          }
        });
      }
    } else if (step !== 'autoCalibrationCheck' && step !== 'initializing') { 
      if (isCycleRunning) {
        setIsCycleRunning(false);
      }
      if (streamRef.current) { 
         cleanupCameraAndFaceMesh();
      }
    }
  }, [
    step, cycleIndex, isCameraReady, hasCameraPermission, isCameraInitializing,
    isCycleRunning, 
    initializeCameraAndFaceMesh, runSingleTestCycle, cleanupCameraAndFaceMesh,
    calibrationProceedEnabled, startActualTest, overlayState.type 
  ]);

  useEffect(() => {
    return () => {
      console.log("[PupilTest] Component unmounting, ensuring full cleanup.");
      cleanupCameraAndFaceMesh();
      if (initializationTimeoutRef.current) clearTimeout(initializationTimeoutRef.current);
      if (noDetectionTimerRef.current) clearTimeout(noDetectionTimerRef.current);
    };
  }, [cleanupCameraAndFaceMesh]);

  const handleIntroContinue = () => setStep('preparation');

  const handleStartAutoCalibrationCheck = () => {
    setMeasurementError(null);
    setCalibrationSignalQuality('Initializing...'); 
    setCalibrationProceedEnabled(false);
    setCalibrationReadings([]);
    autoProceedAttemptedRef.current = false; 
    autoCheckStartTimeRef.current = null; 
    goodQualityTimestampRef.current = null;
    setIsFinalizingDetection(false);
    setStep('autoCalibrationCheck');
  };
  
  const handleCancelFromAutoCheck = () => {
    cleanupCameraAndFaceMesh();
    setMeasurementError(null);
    setCalibrationSignalQuality('Initializing...');
    setCalibrationReadings([]);
    setCalibrationProceedEnabled(false);
    autoProceedAttemptedRef.current = false;
    autoCheckStartTimeRef.current = null;
    goodQualityTimestampRef.current = null;
    setIsFinalizingDetection(false);
    setOverlayState({ type: null, isTransitioning: false }); 
    setStep('preparation');
  };

  const handleRecallSubmit = () => {
    setIsRecallCorrect(recallInput === memoryNumberRef.current.toString());
    setStep('results');
  };

  const validCyclePercentages = testMetrics
    .map(m => parseFloat(m.percent))
    .filter(v => !isNaN(v));

  const avgDelta = validCyclePercentages.length
    ? (validCyclePercentages.reduce((a, b) => a + b, 0) / validCyclePercentages.length).toFixed(1)
    : null;
  
  const pupilConstrictionScaleParams = {
    min: 0, 
    max: 50, 
    segments: [
      { limit: 5, color: 'var(--response-minimal)', label: 'Minimal/No Constriction' }, 
      { limit: 15, color: 'var(--response-reduced)', label: 'Reduced Response' }, 
      { limit: 25, color: 'var(--response-moderate)', label: 'Moderate Response' }, 
      { limit: Infinity, color: 'var(--response-strong)', label: 'Strong Response' } 
    ],
    thresholds: [5, 15, 25] 
  };

  if (step === 'autoCalibrationCheck') {
    return (
      <>
        <video ref={videoRef} className="hidden-video" playsInline muted />
        <AutoCalibrationCheckOverlayUI
          isCameraInitializing={isCameraInitializing}
          isCameraReady={isCameraReady}
          currentLiveDiameter={currentLiveDiameter}
          calibrationSignalQuality={calibrationSignalQuality}
          calibrationReadings={calibrationReadings}
          measurementError={measurementError}
          onCancelAndReturn={handleCancelFromAutoCheck}
          baselineDotRadius={baselineDotRadius}
          isFinalizing={isFinalizingDetection}
        />
      </>
    );
  }

  return (
    <>
      <video ref={videoRef} className="hidden-video" playsInline muted />
            
      {/* This is where TestCycleOverlay is used */}
      {(overlayState.type === 'baseline' || overlayState.type === 'flash') &&
       step === 'testing' && (
        <TestCycleOverlay
          overlayState={overlayState}
          cycleIndex={cycleIndex}
          lightFlashDurations={lightFlashDurations}
          currentLiveDiameter={currentLiveDiameter}
          detectionWarning={detectionWarning}
          baselineDotRadius={baselineDotRadius}
        />
      )}
      
      <div className="pupil-test-container">
        {step === 'intro' && (
          <div className="intro-step">
            <h2>Pupillary Response Test</h2>
            <div className="memory-number">{memoryNumberRef.current}</div>
            <p>Remember this number. This test requires careful setup for accurate results.</p>
            <button className="primary-button" onClick={handleIntroContinue} disabled={isCheckingPermission || !hasCameraPermission}>
              {isCheckingPermission ? 'Checking Permission...' : 'Continue'}
            </button>
            {showPermissionError && !isCheckingPermission && (
              <div className="error-message">Camera permission required. Grant in browser settings & refresh.</div>
            )}
          </div>
        )}
        {step === 'preparation' && (
          <div className="preparation-step">
            <h3>Test Preparation - CRITICAL</h3>
            <ul className="instructions">
              <li><strong>Dark Room & Pre-Adaptation:</strong> Use a **VERY DARK ROOM**. Stay in these dark conditions for **AT LEAST 5-7 MINUTES BEFORE STARTING** the detection check to adapt your eyes thoroughly. Any light leakage (under doors, other devices) will impact results.</li>
              <li><strong>MONITOR BRIGHTNESS (EXTREMELY IMPORTANT!):</strong>
                  <ul>
                      <li>The white flash from your screen is the light source. It **MUST BE AS BRIGHT AS POSSIBLE.**</li>
                      <li>**Action: Before starting this test, find your computer's main Display Settings (in Windows, Mac, etc.) and set the monitor/screen brightness to 100% (Maximum).** Also, check if your physical monitor has its own brightness buttons and set those to high as well.</li>
                      <li>The "dark" parts of the test will use a black screen. If, *after setting system brightness to max*, this black screen still seems too bright or the focus dot is hard to see, you might have to slightly lower the system brightness. However, **a BRIGHT flash is MORE IMPORTANT than a perfectly black dark screen.** A dim flash will give poor or negative results.</li>
                  </ul>
              </li>
              <li><strong>Distance & Position:</strong> Sit 50-60cm (20-24 inches) from the camera, face centered and clearly visible.</li>
              <li><strong>Stillness & Focus:</strong> Keep head still. During measurements (dark & white screens), fix gaze on the central dot. Minimize blinking during sampling.</li>
            </ul>
            {measurementError && (<div className="error-message">{measurementError}</div>)}
            <button className="primary-button start-button" onClick={handleStartAutoCalibrationCheck} disabled={isCameraInitializing}>
              {isCameraInitializing ? "Initializing Camera..." : "Start Detection Check"}
            </button>
          </div>
        )}
        {step === 'initializing' && (
          <div className="preparation-step" style={{minHeight: '200px'}}>
            <h3>Preparing Test Environment...</h3>
            <p>Please wait. Keep facing the camera.</p>
            {measurementError && (<div className="error-message">{measurementError}</div>)}
          </div>
        )}
        {step === 'testing' && overlayState.type !== 'baseline' && overlayState.type !== 'flash' && (
             <div className="testing-step" style={{minHeight: '200px'}}>
             </div>
        )}
        {step === 'recall' && (
          <div className="recall-step">
            <h3>Memory Recall</h3>
            <p>Please enter the number you were shown at the beginning of the test.</p>
            <div className="recall-task">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={recallInput}
                onChange={e => setRecallInput(e.target.value)}
                placeholder="Enter the number"
              />
              <button className="primary-button" onClick={handleRecallSubmit}>Submit</button>
            </div>
          </div>
        )}
        {step === 'results' && (
          <div className="results-step">
            <h3>Test Results</h3>
            
            <div className="summary-card results-summary-card">
              <PerformanceScale
                title="Average Pupillary Constriction"
                value={avgDelta} 
                unit="%"
                scaleParams={pupilConstrictionScaleParams}
                pointerPos={calculatePointerPosition(avgDelta, pupilConstrictionScaleParams.min, pupilConstrictionScaleParams.max)}
                analysisComment={getConstrictionCategory(avgDelta).advice}
              />
              <div className="interpretation" style={{marginTop: '0px'}}> 
                <p><strong>Reference Range:</strong> Typical pupillary light response often shows 15%—50% constriction to a strong light stimulus with good setup. This varies based on age, ambient lighting, stimulus intensity, and measurement precision.</p>
                {avgDelta !== null && parseFloat(avgDelta) < 15 && ( 
                   <p><strong>Note:</strong> If your response is lower than expected, please meticulously re-check all setup instructions (especially monitor brightness to maximum and ensuring a very dark room) if trying again.</p>
                )}
                <p>If results are consistently low despite optimal setup, or if you have concerns, consult a healthcare professional.</p>
                {testMetrics.some(m => m.notes && (m.notes.includes('missing data') || m.notes.includes('Invalid baseline'))) && (
                  <p><strong>Note:</strong> Some cycles had missing data or measurement issues, which may affect the calculated average.</p>
                )}
                <p><em>Disclaimer: This test is informational and NOT a medical diagnosis.</em></p>
              </div>
            </div>

            {measurementError && !testMetrics.some(m => m.notes && m.notes.includes(measurementError)) && (
                <div className="error-message results-error">{measurementError}</div>
            )}

            <div className="metrics-grid">
              {testMetrics.map((m, i) => (
                <div key={i} className="metric-card">
                  <h4>Cycle {m.cycle}</h4>
                  <div className="metric-row"><span>Baseline:</span><span>{m.baseline}px (raw: {m.rawBaseline?.toFixed(1) || 'N/A'})</span></div>
                  <div className="metric-row"><span>Constricted:</span><span>{m.constricted}px (raw: {m.rawConstricted?.toFixed(1) || 'N/A'})</span></div>
                  <div className="metric-row highlight">
                    <span>Change:</span>
                    <span>{m.delta}px ({m.percent !== '—' ? `${m.percent}%` : '—'})</span>
                  </div>
                  {m.notes && (
                    <div className="metric-row" style={{ fontStyle: 'italic', fontSize: '0.85em' }}>
                      <span style={{ flexBasis: '100%', textAlign: 'center' }}>Note: {m.notes}</span>
                    </div>
                  )}
                </div>
              ))}
              {testMetrics.length === 0 && !measurementError && avgDelta === null && 
                <p>No test cycles were completed or data is unavailable to calculate an average.</p>
              }
            </div>
            
            <div className="recall-task"><h4>Memory Recall Result</h4>{isRecallCorrect !== null && (<div className={`feedback ${isRecallCorrect ? 'correct' : 'incorrect'}`}>{isRecallCorrect ? 'Correct!' : `Incorrect (was ${memoryNumberRef.current})`}</div>)}</div>
            <button className="primary-button" onClick={() => setCurrentTest('home')}>Complete Test</button>
          </div>
        )}
      </div>
    </>
  );
}