import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import './PupilTest.css'; // 請確保此 CSS 文件已更新

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
    return { category: "無資料", color: "var(--response-na)", advice: "無可用資料或資料不足以計算平均值。" };
  }

  if (numericPercent >= 25) return { category: "強烈反應", color: "var(--response-strong)", advice: "檢測到強烈的瞳孔光反射。" };
  if (numericPercent >= 15) return { category: "中等反應", color: "var(--response-moderate)", advice: "檢測到中等的瞳孔光反射。" };
  if (numericPercent >= 5) return { category: "反應減弱", color: "var(--response-reduced)", advice: "瞳孔反應似乎減弱。如果重試，請考慮重新檢查設定（螢幕亮度、房間黑暗度）。" };
  return { category: "極小/無收縮", color: "var(--response-minimal)", advice: "檢測到極小或無收縮。這強烈表明測量精度、設定（尤其是螢幕閃光亮度不足或基線測量時黑暗度不夠）存在問題，或反射顯著減弱/消失。" };
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
      <h4>{title}: {value !== null && value !== undefined ? `${value}${unit}` : "無資料"}</h4>
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
                title={`${segment.label}: ${segmentStartOnScale}-${segmentEndOnScale === Infinity ? '以上' : segmentEndOnScale}${unit}`}
              ></div>
            ) : null;
          })}
        </div>
        <div
          className="scale-pointer"
          style={{ left: `${pointerPos}%` }}
          title={`您的數值: ${value}${unit}`}
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
    statusMessage = "正在初始化相機以進行偵測檢查...";
  } else if (!isCameraReady) {
    statusMessage = "相機尚未就緒。請稍候或檢查權限。";
  } else {
    if (calibrationSignalQuality === '正在初始化...' && calibrationReadings.length === 0 && !currentLiveDiameter) {
      statusMessage = "正在嘗試偵測臉部/眼睛...";
      helperText = "請確保您的臉部光線充足並位於相機畫面中央。正在尋找瞳孔...";
    } else {
      statusMessage = calibrationSignalQuality; // This will be translated where it's set
      if (calibrationSignalQuality.startsWith('佳') || calibrationSignalQuality.startsWith('Good')) { // Keep 'Good' for logic if `startsWith` is used before translation
        qualityColor = 'var(--response-strong)';
        helperText = isFinalizing ? "偵測良好！正在完成並準備測試..." : "偵測良好！請保持穩定...";
      } else if (calibrationSignalQuality.startsWith('一般') || calibrationSignalQuality.startsWith('Fair')) {
        qualityColor = 'var(--response-reduced)';
        helperText = "快好了！請保持頭部非常靜止以獲得更穩定的讀數。";
      } else if (calibrationSignalQuality.startsWith('差') || calibrationSignalQuality.startsWith('Poor')) {
        qualityColor = 'var(--response-minimal)';
        helperText = "正在嘗試穩定偵測。如果需要，請調整位置，確保臉部光線柔和。保持靜止。";
      } else {
         helperText = "請繼續注視圓環。正在嘗試獲取穩定讀數。";
      }
    }
  }

  return (
    <div className="full-black-overlay" style={{ backgroundColor: 'var(--dark-overlay-bg)' }}>
      <div className="calibration-overlay-content-wrapper" style={{ color: 'var(--dim-overlay-text-primary)' }}>
        <h3>自動偵測檢查</h3>
        <p>請注視中央圓環並保持靜止。</p>
        
        <div className="ring-indicator" style={{ borderColor: 'rgba(200, 200, 200, 0.25)', margin: '20px auto' }}>
          <div className="pupil-dot" style={{
            width: baselineDotRadius,
            height: baselineDotRadius,
            background: 'var(--dark-overlay-bg)'
          }}/>
        </div>

        <div className="calibration-feedback" style={{ margin: '20px auto', padding: '15px', background: 'rgba(50,50,50,0.5)', borderRadius: '8px', maxWidth: '450px' }}>
          <p>即時瞳孔直徑: <strong>{currentLiveDiameter || '無資料'} px</strong></p>
          <p style={{ fontWeight: 'bold', marginTop: '10px' }}>
            偵測品質: <strong style={{ color: qualityColor }}>
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
              重新嘗試設定
            </button>
          </>
        )}
        
        {!calibrationSignalQuality.startsWith('佳') && !calibrationSignalQuality.startsWith('Good') && !measurementError && !isCameraInitializing && isCameraReady && (
          <button
            className="secondary-button"
            style={{ marginTop: '20px', background: 'var(--dim-button-bg-on-dark)', color: 'var(--dim-button-text-on-dark)', border: '1px solid var(--dim-button-text-on-dark)' }}
            onClick={onCancelAndReturn}
          >
            取消並返回準備階段
          </button>
        )}
      </div>
    </div>
  );
});

const TestCycleOverlay = memo(({
    overlayState,
    cycleIndex,
    lightFlashDurations,
    currentLiveDiameter,
    detectionWarning,
    baselineDotRadius
}) => {
    const darkOverlayColor = 'rgb(0,0,0)';
    const lightOverlayColor = '#FFFFFF';

    if (overlayState.type !== 'baseline' && overlayState.type !== 'flash') return null;
    
    const baseClass = overlayState.type === 'flash' ? 'full-flash-overlay' : 'full-black-overlay';
    const bgColor = overlayState.color || (overlayState.type === 'flash' ? lightOverlayColor : darkOverlayColor);

    return (
      <div className={baseClass} style={{ backgroundColor: bgColor }}>
        {overlayState.type === 'baseline' && (
          <>
            <div className="overlay-text">
              第 {cycleIndex + 1} 次循環，共 {lightFlashDurations.length} 次：請注視圓點
            </div>
            <div className="ring-indicator"><div className="pupil-dot" style={{ width: baselineDotRadius, height: baselineDotRadius, background: darkOverlayColor }}/></div>
            {currentLiveDiameter && (<div className="live-feedback">{currentLiveDiameter}px</div>)}
            {detectionWarning && (<div className="error-message overlay-error">{detectionWarning}</div>)}
          </>
        )}
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
  const [calibrationSignalQuality, setCalibrationSignalQuality] = useState('正在初始化...'); // Translated
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

  const darkOverlayColor = 'rgb(0,0,0)';
  const lightOverlayColor = '#FFFFFF';

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
      setCurrentLiveDiameter(prev => prev === null ? null : null); // Shows '無資料' if null
      if (currentStep === 'testing' && !noDetectionTimerRef.current) {
        noDetectionTimerRef.current = setTimeout(() => {
          setDetectionWarning('未偵測到臉部。請正對相機。');
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
      setMeasurementError('相機權限未授予。');
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
      setMeasurementError(`初始化相機失敗：${error.message}。請確保權限並重試。`);
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
        setCalibrationSignalQuality('正在初始化相機...');
        setCalibrationProceedEnabled(false);
        goodQualityTimestampRef.current = null;
        return;
      }
      
      if (calibrationReadings.length < 5 && validReadings.length < 3) {
          setCalibrationSignalQuality('正在初始化偵測...');
          setCalibrationProceedEnabled(false);
          goodQualityTimestampRef.current = null;
          return;
      }

      if (validReadings.length < calibrationReadings.length * 0.6 || validReadings.length < 8) {
        setCalibrationSignalQuality(`差：偵測不穩定 (${validReadings.length}/${calibrationReadings.length} 個有效讀數)。請調整位置。`);
        setCalibrationProceedEnabled(false);
        goodQualityTimestampRef.current = null;
      } else {
        const std = calculateStdDev(validReadings);
        if (std < 1.2 && validReadings.length >= requiredSamples) {
          if (!calibrationSignalQuality.startsWith('佳')) {
            setCalibrationSignalQuality(`佳 (穩定度: ${std.toFixed(1)}px)`);
            goodQualityTimestampRef.current = Date.now();
          }
          setCalibrationProceedEnabled(true);
        } else if (std < 2.5 && validReadings.length >=10) {
          setCalibrationSignalQuality(`一般 (穩定度: ${std.toFixed(1)}px)。請保持靜止。`);
          setCalibrationProceedEnabled(false);
          goodQualityTimestampRef.current = null;
        } else {
          setCalibrationSignalQuality(`差 (穩定度: ${std.toFixed(1)}px)。讀數非常不穩定。`);
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
                notes = `第 ${currentIndex + 1} 次循環：未偵測到收縮（或瞳孔擴張）。`;
                console.warn(`[PupilTest] Warning Cycle ${currentIndex + 1}: Baseline (${measuredBaseline.toFixed(1)}) <= Constricted (${measuredConstricted.toFixed(1)}).`);
            }
        } else {
             delta = '—'; percent = '—';
             notes = `第 ${currentIndex + 1} 次循環：基線數據無效。`;
             console.warn(`[PupilTest] Warning Cycle ${currentIndex + 1}: Invalid or too small baseline (${measuredBaseline?.toFixed(1)}).`);
        }
    } else {
      delta = '—'; percent = '—';
      notes = `第 ${currentIndex + 1} 次循環：缺少測量數據。`;
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
              setMeasurementError('開始測試前相機出現問題。請重新嘗試自動校準。');
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
                setMeasurementError("為測試初始化相機失敗。請從準備階段重試。");
                setOverlayState({ type: null, isTransitioning: false });
                setStep('preparation');
            }
        }
    } catch (error) {
        console.error("[PupilTest] CRITICAL ERROR in startActualTest:", error);
        setMeasurementError("發生嚴重錯誤。請重試。");
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
              setMeasurementError("啟動相機進行偵測檢查失敗。");
            }
          });
        } else if (!hasCameraPermission && !isCameraInitializing) {
          setMeasurementError("偵測檢查前相機權限遺失或未授予。");
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
            setMeasurementError(prev => prev ? `${prev} 循環中發生嚴重錯誤。` : `循環中發生嚴重錯誤。`);
            setIsCycleRunning(false);
          });
      } else if (!isCameraReady && !isCameraInitializing && !isCycleRunning) {
        console.warn("[PupilTest] useEffect: In testing step but camera not ready. Attempting re-init.");
        setIsCycleRunning(true);
        initializeCameraAndFaceMesh(false).then(success => {
          if (!success) {
            setMeasurementError("為測試循環初始化相機失敗。");
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
    setCalibrationSignalQuality('正在初始化...'); // Translated
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
    setCalibrationSignalQuality('正在初始化...'); // Translated
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

  const avgDelta = validCyclePercentages.length // Comment out original calculation
     ? (validCyclePercentages.reduce((a, b) => a + b, 0) / validCyclePercentages.length).toFixed(1)
     : null;
  
  const pupilConstrictionScaleParams = {
    min: 0,
    max: 50,
    segments: [
      { limit: 5, color: 'var(--response-minimal)', label: '極小/無收縮' },
      { limit: 15, color: 'var(--response-reduced)', label: '反應減弱' },
      { limit: 25, color: 'var(--response-moderate)', label: '中等反應' },
      { limit: Infinity, color: 'var(--response-strong)', label: '強烈反應' }
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
            <h2>瞳孔反應測試</h2>
            <div className="memory-number">{memoryNumberRef.current}</div>
            <p>請記住這個數字。此測試需要仔細設定以獲得準確結果。</p>
            <button className="primary-button" onClick={handleIntroContinue} disabled={isCheckingPermission || !hasCameraPermission}>
              {isCheckingPermission ? '正在檢查權限...' : '繼續'}
            </button>
            {showPermissionError && !isCheckingPermission && (
              <div className="error-message">需要相機權限。請在瀏覽器設定中授權並重新整理頁面。</div>
            )}
          </div>
        )}
        {step === 'preparation' && (
          <div className="preparation-step">
            <h3>測試準備 - 極為重要</h3>
            <ul className="instructions">
              <li><strong>暗室與預先適應：</strong> 請使用<strong>非常暗的房間</strong>。在開始偵測檢查前，請在這些黑暗環境中<strong>至少停留5-7分鐘</strong>，讓眼睛充分適應。任何漏光（門縫、其他裝置）都會影響結果。</li>
              <li><strong>螢幕亮度（極為重要！）：</strong>
                  <ul>
                      <li>螢幕發出的白光是光源。它<strong>必須盡可能亮</strong>。</li>
                      <li><strong>操作：</strong>開始此測試前，請找到您電腦的主要顯示設定（Windows、Mac等），並將顯示器/螢幕亮度設為100%（最大）。同時，檢查您的實體顯示器是否有自己的亮度按鈕，並將其調高。</li>
                      <li>測試的「暗畫面」部分將使用黑色螢幕。如果在<em>將系統亮度調至最大後</em>，此黑色螢幕仍然顯得太亮，或者對焦圓點難以看清，您可能需要稍微降低系統亮度。然而，<strong>明亮的閃光比完美的黑色暗畫面更重要</strong>。昏暗的閃光會導致結果不佳或負面。</li>
                  </ul>
              </li>
              <li><strong>距離與位置：</strong> 請距離相機50-60公分（20-24英吋），臉部居中且清晰可見。</li>
              <li><strong>靜止與專注：</strong> 保持頭部靜止。在測量期間（暗畫面與白畫面），請注視中央圓點。採樣期間盡量減少眨眼。</li>
            </ul>
            {measurementError && (<div className="error-message">{measurementError}</div>)}
            <button className="primary-button start-button" onClick={handleStartAutoCalibrationCheck} disabled={isCameraInitializing}>
              {isCameraInitializing ? "正在初始化相機..." : "開始偵測檢查"}
            </button>
          </div>
        )}
        {step === 'initializing' && (
          <div className="preparation-step" style={{minHeight: '200px'}}>
            <h3>正在準備測試環境...</h3>
            <p>請稍候。請繼續面向相機。</p>
            {measurementError && (<div className="error-message">{measurementError}</div>)}
          </div>
        )}
        {step === 'testing' && overlayState.type !== 'baseline' && overlayState.type !== 'flash' && (
             <div className="testing-step" style={{minHeight: '200px'}}>
             </div>
        )}
        {step === 'recall' && (
          <div className="recall-step">
            <h3>記憶回想</h3>
            <p>請輸入您在測試開始時看到的數字。</p>
            <div className="recall-task">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={recallInput}
                onChange={e => setRecallInput(e.target.value)}
                placeholder="輸入數字"
              />
              <button className="primary-button" onClick={handleRecallSubmit}>提交</button>
            </div>
          </div>
        )}
        {step === 'results' && (
          <div className="results-step">
            <h3>測試結果</h3>
            
            <div className="summary-card results-summary-card">
              <PerformanceScale
                title="平均瞳孔收縮率"
                value={avgDelta}
                unit="%"
                scaleParams={pupilConstrictionScaleParams}
                pointerPos={calculatePointerPosition(avgDelta, pupilConstrictionScaleParams.min, pupilConstrictionScaleParams.max)}
                analysisComment={getConstrictionCategory(avgDelta).advice}
              />
              <div className="interpretation" style={{marginTop: '0px'}}>
                <p><strong>參考範圍：</strong>在良好設定下，典型的瞳孔光反射通常對強光刺激顯示15%—50%的收縮。此數值因年齡、環境光線、刺激強度和測量精度而異。</p>
                {avgDelta !== null && parseFloat(avgDelta) < 15 && (
                   <p><strong>注意：</strong>如果您的反應低於預期，若要重試，請仔細重新檢查所有設定說明（尤其是將螢幕亮度調至最大並確保房間非常暗）。</p>
                )}
                <p>如果在最佳設定下結果持續偏低，或者您有疑慮，請諮詢醫療專業人員。</p>
                {testMetrics.some(m => m.notes && (m.notes.includes('缺少測量數據') || m.notes.includes('基線數據無效'))) && ( // Ensure notes check is also translated if they are translated when set
                  <p><strong>注意：</strong>部分循環的數據遺失或存在測量問題，這可能會影響計算出的平均值。</p>
                )}
                <p><em>免責聲明：此測試僅供參考，並非醫療診斷。</em></p>
              </div>
            </div>

            {measurementError && !testMetrics.some(m => m.notes && m.notes.includes(measurementError)) && (
                <div className="error-message results-error">{measurementError}</div>
            )}

            <div className="metrics-grid">
              {testMetrics.map((m, i) => (
                <div key={i} className="metric-card">
                  <h4>第 {m.cycle} 次循環</h4>
                  <div className="metric-row"><span>基線值：</span><span>{m.baseline}px (原始值: {m.rawBaseline?.toFixed(1) || '無資料'})</span></div>
                  <div className="metric-row"><span>收縮值：</span><span>{m.constricted}px (原始值: {m.rawConstricted?.toFixed(1) || '無資料'})</span></div>
                  <div className="metric-row highlight">
                    <span>變化量：</span>
                    <span>{m.delta}px ({m.percent !== '—' ? `${m.percent}%` : '—'})</span>
                  </div>
                  {m.notes && (
                    <div className="metric-row" style={{ fontStyle: 'italic', fontSize: '0.85em' }}>
                      <span style={{ flexBasis: '100%', textAlign: 'center' }}>註記: {m.notes}</span>
                    </div>
                  )}
                </div>
              ))}
              {testMetrics.length === 0 && !measurementError && avgDelta === null &&
                <p>沒有完成任何測試循環，或無可用數據以計算平均值。</p>
              }
            </div>
            
            <div className="recall-task"><h4>記憶回想結果</h4>{isRecallCorrect !== null && (<div className={`feedback ${isRecallCorrect ? 'correct' : 'incorrect'}`}>{isRecallCorrect ? '正確！' : `不正確 (正確答案是 ${memoryNumberRef.current})`}</div>)}</div>
            <button className="primary-button" onClick={() => setCurrentTest('home')}>完成測試</button>
          </div>
        )}
      </div>
    </>
  );
}