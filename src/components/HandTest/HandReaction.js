import React, { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as handpose from '@tensorflow-models/hand-pose-detection';
import HandResults from './HandResults';
import './HandReaction.css';

const INDEX_FINGER_TIP_KP = 8;
const MIDDLE_FINGER_TIP_KP = 12;
const HITTABLE_KEYPOINT_INDICES = [4, 8, 12, 16, 20, 5, 9, 13, 17];
const TARGET_SIZE_PX = 50;
const DETECTION_THRESHOLD = 15;
const MIN_FRAME_INTERVAL = 33; // ~30 FPS
const HIT_FLASH_DURATION = 200;
const HIT_MESSAGE_DURATION = 1000;
const POST_HIT_PAUSE = 100;
const TARGET_ARMING_DURATION_MS = 150;
const AVOID_EDGE_MARGIN_HORIZONTAL_PX = 40;
const AVOID_EDGE_MARGIN_TOP_PX = 40;
const AVOID_EDGE_MARGIN_BOTTOM_PX = 100;

const calculateScore = (avgTime) => {
  const perfectTime = 200;
  const scoreFactor = 6;
  if (avgTime <= perfectTime) return 100;
  if (avgTime >= (perfectTime + 100 * scoreFactor)) return 0;
  const score = 100 - ((avgTime - perfectTime) / scoreFactor);
  return Math.round(Math.max(0, Math.min(100, score)));
};

const generateAnalysisText = (averageTime, stdDevValue, score) => {
  let avgTimeComment = "";
  if (averageTime < 350) { avgTimeComment = "您的平均反應時間非常迅速。"; }
  else if (averageTime < 550) { avgTimeComment = "您的平均反應時間良好。"; }
  else if (averageTime < 750) { avgTimeComment = "您的平均反應時間在正常範圍內。"; }
  else { avgTimeComment = "您的平均反應時間相對偏慢。"; }

  let variabilityComment = "";
  if (typeof stdDevValue === 'number' && !isNaN(stdDevValue)) {
    if (stdDevValue < 100) { variabilityComment = "您的反應時間表現相對一致。"; }
    else if (stdDevValue < 180) { variabilityComment = "您的反應時間表現略有波動。"; }
    else { variabilityComment = "您的反應時間表現波動較大。"; }
  } else { variabilityComment = "反應時間變異性數據不足。"; }

  let scoreComment = "";
  if (score >= 80) { scoreComment = "綜合評分顯示您的整體反應表現優異。"; }
  else if (score >= 60) { scoreComment = "綜合評分顯示您的整體反應表現良好。"; }
  else if (score >= 40) { scoreComment = "綜合評分顯示您的整體反應表現尚可。"; }
  else { scoreComment = "綜合評分顯示您的整體反應表現有進步空間。請記得，多種因素均可能影響反應時間。"; }

  const generalContext =
`科學研究表明，反應時間（RT）是衡量大腦處理資訊和執行動作速度的一項重要指標。在認知健康領域，反應時間的變化，包括平均反應速度減慢和反應時間變異性（每次反應的差異程度）增加，有時被視為早期認知功能改變的潛在跡象。例如，在輕度認知障礙（MCI）或早期阿茲海默症的研究中，觀察到這些反應時間指標的變化。

然而，務必理解影響反應時間的因素非常多樣，包括年齡、專注程度、疲勞狀態、情緒、整體健康狀況以及特定藥物影響等。因此，單純的反應時間測量結果不能獨立作為任何健康狀況的判斷依據。

重要提示：此測量提供關於您視覺運動反應速度的初步參考資訊，並非醫療診斷。它不能替代專業醫療評估。若您對自己的反應時間、反應一致性或整體認知健康有任何疑慮，請務必諮詢醫師或相關醫療專業人士進行全面的評估與指導。`;

  return {
    scoreComment,
    avgTimeComment,
    variabilityComment,
    generalContext
  };
};

class AppLogger {
  constructor(visualAidModeEnabled) {
    this.visualAidEnabled = visualAidModeEnabled;
    this.lastSkipReason = "";
    this.lastSkipContextString = "";
    this.skipCounter = 0;
    this.skipThreshold = 20;
  }
  getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  }
  setVisualAidMode(enabled) { this.visualAidEnabled = enabled; }
  log(message, data = {}, isCritical = false) {
    if (!this.visualAidEnabled && !isCritical && !message.includes("Loop:") && !message.includes("Target:")) return;
    const timestamp = this.getTimestamp();
    const consoleDataString = Object.keys(data).length > 0 ? `Data: ${JSON.stringify(data)}` : '';
    console.log(`[${timestamp}] [HandReaction] ${message} ${consoleDataString}`);
    if (!message.startsWith('DETECT_HANDS_SKIP')) {
      if (this.skipCounter > 0) {
        console.log(`[${this.getTimestamp()}] [HandReaction] DETECT_HANDS_SKIP_SUMMARY: (Flushed) Previously skipped ${this.skipCounter} frames. Reason: '${this.lastSkipReason}'. Context: ${this.lastSkipContextString}`);
      }
      this.skipCounter = 0; this.lastSkipReason = ""; this.lastSkipContextString = "";
    }
  }
  logSkip(reason, contextData = {}) {
    if (!this.visualAidEnabled) return;
    const contextString = JSON.stringify(contextData);
    if (this.lastSkipReason === reason && this.lastSkipContextString === contextString) {
      this.skipCounter++;
      if (this.skipCounter === this.skipThreshold) {
        console.log(`[${this.getTimestamp()}] [HandReaction] DETECT_HANDS_SKIP_SUMMARY: Skipped ${this.skipCounter} frames. Reason: '${reason}'. Context: ${contextString}`);
      }
    } else {
      if (this.skipCounter > 0 && this.skipCounter >= this.skipThreshold) {
        console.log(`[${this.getTimestamp()}] [HandReaction] DETECT_HANDS_SKIP_SUMMARY: (End of block) Previously skipped ${this.skipCounter} frames. Reason: '${this.lastSkipReason}'. Context: ${this.lastSkipContextString}`);
      }
      this.skipCounter = 1; this.lastSkipReason = reason; this.lastSkipContextString = contextString;
      if (this.skipCounter === 1) console.log(`[${this.getTimestamp()}] [HandReaction] DETECT_HANDS_SKIP: ${reason} Data: ${contextString}`);
    }
  }
}

export default function HandReaction() {
  const [handDetected, setHandDetected] = useState(false);
  const [targetVisible, setTargetVisible] = useState(false);
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 });
  const [isTargetArmed, setIsTargetArmed] = useState(false);
  const [testStarted, setTestStarted] = useState(false);
  const [testCount, setTestCount] = useState(0);
  const [rawReactionTimes, setRawReactionTimes] = useState([]);
  const [finalResultsData, setFinalResultsData] = useState(null);
  const [visualAidMode, setVisualAidMode] = useState(false);
  const [cameraPermission, setCameraPermission] = useState(true);
  const [envMessage, setEnvMessage] = useState('');
  const [hitMessage, setHitMessage] = useState('');
  const [isCameraStreamReady, setIsCameraStreamReady] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const modelRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const nextTargetRef = useRef(null);
  const targetArmingTimeoutRef = useRef(null);
  const startTimeRef = useRef(null);
  const videoElementRef = useRef(null);
  const isMountedRef = useRef(true);
  const nonDetectionCountRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const lastHitTimeRef = useRef(0);
  const hasRunRef = useRef(false);
  const hitFlashRef = useRef(false);
  const isProcessingHitRef = useRef(false);
  const loggerRef = useRef(null);
  const initialPrepareMessageShownRef = useRef(false);

  useEffect(() => {
    loggerRef.current = new AppLogger(visualAidMode);
  }, []);

  useEffect(() => {
    if (loggerRef.current) {
      loggerRef.current.setVisualAidMode(visualAidMode);
    }
  }, [visualAidMode]);

  const checkCameraPermissions = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (loggerRef.current) loggerRef.current.log('MediaDevices API not supported', {}, true);
      setCameraPermission(false); setIsCameraStreamReady(false); return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      if (loggerRef.current) loggerRef.current.log('Camera permission granted', {}, true);
      setCameraPermission(true);
      return true;
    } catch (err) {
      if (loggerRef.current) loggerRef.current.log(`Camera permission denied: ${err.message}`, { error: err.toString() }, true);
      setCameraPermission(false); setIsCameraStreamReady(false);
      setEnvMessage('Camera access denied. Please grant permission and refresh.'); return false;
    }
  }, [setEnvMessage]);

  const isValidKeypoint = useCallback((keypoint) => {
    if (!keypoint || keypoint.x === null || keypoint.y === null || typeof keypoint.x !== 'number' || typeof keypoint.y !== 'number') return false;
    return !(isNaN(keypoint.x) || isNaN(keypoint.y));
  }, []);

  const loadModel = useCallback(async () => {
    if (loggerRef.current) loggerRef.current.log('Loading TFJS & MediaPipe Hands model...', {}, true);
    setIsModelLoaded(false);
    try {
      await tf.setBackend('webgl'); await tf.ready();
      if (!document.createElement('canvas').getContext('webgl')) throw new Error('WebGL not supported.');
    } catch (error) {
      if (loggerRef.current) loggerRef.current.log(`WebGL failed: ${error.message}. Fallback to CPU.`, { error: error.toString() }, true);
      await tf.setBackend('cpu'); await tf.ready(); setEnvMessage('Using CPU backend (slower).');
    }
    try {
      const detector = await handpose.createDetector(handpose.SupportedModels.MediaPipeHands, { runtime: 'tfjs', modelType: 'lite', maxHands: 1 });
      if (loggerRef.current) loggerRef.current.log('MediaPipe Hands model loaded.', {}, true);
      setIsModelLoaded(true);
      return detector;
    } catch (error) {
      if (loggerRef.current) loggerRef.current.log(`Failed to load model: ${error.message}`, { error: error.toString() }, true);
      setEnvMessage('Failed to load model. Refresh.');
      setIsModelLoaded(false);
      return null;
    }
  }, [setEnvMessage]);

  const clearAllTimers = useCallback(() => {
    if (nextTargetRef.current) clearTimeout(nextTargetRef.current);
    nextTargetRef.current = null;
    if (targetArmingTimeoutRef.current) clearTimeout(targetArmingTimeoutRef.current);
    targetArmingTimeoutRef.current = null;
  }, []);

  const setupEffect = useCallback(async () => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    if (!(await checkCameraPermissions())) { return; }
    modelRef.current = await loadModel();
    if (!modelRef.current && loggerRef.current) loggerRef.current.log('Model loading failed in setup.', {}, true);
    else if (modelRef.current && loggerRef.current) loggerRef.current.log('Setup complete. Model loaded.', {}, true);
  }, [checkCameraPermissions, loadModel]);

  useEffect(() => {
    isMountedRef.current = true;
    setupEffect();
    return () => {
      isMountedRef.current = false;
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
      clearAllTimers();
      if (typeof tf !== 'undefined' && tf.disposeVariables) tf.disposeVariables();
      if (loggerRef.current) loggerRef.current.log('Component unmounted.', {}, true);
    };
  }, [setupEffect, clearAllTimers]);

  const registerHitFnRef = useRef();

  const showNextTarget = useCallback(() => {
    clearAllTimers();
    const videoContainerElement = webcamRef.current?.video?.parentElement;
    const displayWidth = videoContainerElement?.clientWidth || 640;
    const displayHeight = videoContainerElement?.clientHeight || 480;
    const videoElement = videoElementRef.current;

    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      if (loggerRef.current) loggerRef.current.log('Target: showNextTarget - Video element not ready.', {}, true);
      return;
    }
    const currentTargetSize = TARGET_SIZE_PX;
    const marginH = AVOID_EDGE_MARGIN_HORIZONTAL_PX;
    const marginVT = AVOID_EDGE_MARGIN_TOP_PX;
    const marginVB = AVOID_EDGE_MARGIN_BOTTOM_PX;

    let minX = marginH;
    let maxX = displayWidth - currentTargetSize - marginH;
    let minY = marginVT;
    let maxY = displayHeight - currentTargetSize - marginVB;

    let x = (maxX <= minX || maxY <= minY) ? Math.max(0, (displayWidth - currentTargetSize) / 2) : Math.floor(Math.random() * (maxX - minX + 1)) + minX;
    let y = (maxX <= minX || maxY <= minY) ? Math.max(0, (displayHeight - currentTargetSize) / 2) : Math.floor(Math.random() * (maxY - minY + 1)) + minY;

    x = Math.max(0, Math.min(x, displayWidth - currentTargetSize));
    y = Math.max(0, Math.min(y, displayHeight - currentTargetSize));

    if (isNaN(x) || isNaN(y)) { x = (displayWidth - currentTargetSize) / 2; y = (displayHeight - currentTargetSize) / 2; }

    setTargetPosition({ x, y });
    setTargetVisible(true);
    setIsTargetArmed(false);

    if (loggerRef.current) loggerRef.current.log(`Target: Visible at (${x.toFixed(0)},${y.toFixed(0)}), Arming...`, {}, true);

    targetArmingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setIsTargetArmed(true);
        startTimeRef.current = Date.now();
        if (loggerRef.current) loggerRef.current.log('Target: Armed. Timer started.', { pos: targetPosition }, true);
      } else {
        if (loggerRef.current) loggerRef.current.log('Target: Arming timeout, but unmounted.', {}, true);
      }
    }, TARGET_ARMING_DURATION_MS);
  }, [clearAllTimers, targetPosition, setTargetPosition, setTargetVisible, setIsTargetArmed]); // Added missing dependencies

  const registerHit = useCallback(() => {
    if (testCount >= 5) { return; }
    if (isProcessingHitRef.current) { return; }
    if (!startTimeRef.current) { return; }

    isProcessingHitRef.current = true;
    lastHitTimeRef.current = performance.now();
    clearAllTimers();
    setTargetVisible(false);
    setIsTargetArmed(false);
    hitFlashRef.current = true; setHitMessage('Hit!'); nonDetectionCountRef.current = 0;
    setTimeout(() => { if (isMountedRef.current) hitFlashRef.current = false; }, HIT_FLASH_DURATION);
    setTimeout(() => { if (isMountedRef.current) setHitMessage(''); }, HIT_MESSAGE_DURATION);

    const reactionTime = Date.now() - startTimeRef.current;
    startTimeRef.current = null;

    setRawReactionTimes(prev => {
      const updatedRawTimes = [...prev, reactionTime];
      const numHits = updatedRawTimes.length;
      setTestCount(numHits);
      if (loggerRef.current) loggerRef.current.log(`Target: Hit ${numHits}. Time: ${reactionTime}ms.`, {}, true);

      if (numHits >= 5) {
        const avgTime = Math.round(updatedRawTimes.reduce((a, b) => a + b, 0) / numHits);
        const bestTime = Math.min(...updatedRawTimes);
        const currentScore = calculateScore(avgTime);
        let standardDeviation = 0;
        if (updatedRawTimes.length > 0) {
            const mean = avgTime;
            standardDeviation = Math.sqrt(updatedRawTimes.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / updatedRawTimes.length);
            standardDeviation = Math.round(standardDeviation);
        }
        const analysisTextsResult = generateAnalysisText(avgTime, standardDeviation, currentScore);
        if (loggerRef.current) loggerRef.current.log(`Test Complete. Avg: ${avgTime}, Score: ${currentScore}, StdDev: ${standardDeviation}`, {}, true);
        setFinalResultsData({
            times: [...updatedRawTimes], averageTime: avgTime, bestTime: bestTime,
            score: currentScore, stdDev: standardDeviation, analysisTexts: analysisTextsResult
        });
        isProcessingHitRef.current = false;
      } else {
        nextTargetRef.current = setTimeout(() => {
          if (isMountedRef.current && testStarted && testCount < 5) {
             if (loggerRef.current) loggerRef.current.log('Target: Scheduling next target.', {}, true);
             showNextTarget();
          }
          isProcessingHitRef.current = false;
        }, 1000);
      }
      return updatedRawTimes;
    });
  }, [testCount, testStarted, showNextTarget, clearAllTimers, setHitMessage, setIsTargetArmed, setTargetVisible, setRawReactionTimes, setTestCount, setFinalResultsData]); // Added missing dependencies

  useEffect(() => { registerHitFnRef.current = registerHit; }, [registerHit]);

  useEffect(() => {
    if (testCount >= 5 && testStarted) {
        if (loggerRef.current) loggerRef.current.log('Loop: Test completed, setting testStarted to false.', {}, true);
        setTestStarted(false);
    }
  }, [testCount, testStarted, rawReactionTimes]); // Added rawReactionTimes

  const startTest = useCallback(() => {
    if (testStarted) return;
    if (!isCameraStreamReady || !isModelLoaded) {
        setEnvMessage('Camera or model not fully ready. Please wait.');
        if (loggerRef.current) loggerRef.current.log('StartTest: Not ready.', {}, true);
        return;
    }
    if (loggerRef.current) loggerRef.current.log('StartTest: Initiated.', {}, true);
    clearAllTimers();
    setRawReactionTimes([]); setFinalResultsData(null);
    setTestCount(0); setIsTargetArmed(false); setTargetVisible(false);
    setEnvMessage(!initialPrepareMessageShownRef.current ? 'Prepare: Hand palm facing camera, good light, plain background.' : 'Starting test...');
    if (!initialPrepareMessageShownRef.current) initialPrepareMessageShownRef.current = true;
    isProcessingHitRef.current = false; startTimeRef.current = null;
    setTimeout(() => {
        if (isMountedRef.current) {
            setEnvMessage(''); setTestStarted(true);
            if (loggerRef.current) loggerRef.current.log('Loop: testStarted set to true.', {}, true);
            showNextTarget();
        }
    }, 3000);
  }, [ testStarted, showNextTarget, isCameraStreamReady, isModelLoaded, clearAllTimers, setEnvMessage, setRawReactionTimes, setFinalResultsData, setTestCount, setIsTargetArmed, setTargetVisible ]); // Added missing dependencies

  const detectHands = useCallback(async () => {
    const shouldLoopRun = isMountedRef.current && isCameraStreamReady && isModelLoaded && (testStarted || visualAidMode);
    if (!shouldLoopRun) {
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null; return;
    }
    const now = performance.now();
    if (now - lastFrameTimeRef.current < MIN_FRAME_INTERVAL) {
      animationFrameIdRef.current = requestAnimationFrame(detectHands); return;
    }
    lastFrameTimeRef.current = now;
    const isPostHitPauseActive = (now - lastHitTimeRef.current < POST_HIT_PAUSE);
    const video = webcamRef.current?.video;
    const videoContainerElement = video?.parentElement;
    if (!video || video.readyState !== 4 || !videoContainerElement || video.videoWidth === 0 || video.videoHeight === 0) {
        animationFrameIdRef.current = requestAnimationFrame(detectHands); return;
    }
    let intrinsicVideoWidth = video.videoWidth;
    let intrinsicVideoHeight = video.videoHeight;
    let displayWidth = videoContainerElement.clientWidth;
    let displayHeight = videoContainerElement.clientHeight;
    const scaleX = displayWidth / intrinsicVideoWidth;
    const scaleY = displayHeight / intrinsicVideoHeight;
    let handsOutput = [], currentlyDetected = false, handToDraw = null;

    if (!isPostHitPauseActive && modelRef.current) {
      let pixelsTensor;
      try {
        pixelsTensor = tf.browser.fromPixels(video);
        handsOutput = await modelRef.current.estimateHands(pixelsTensor);
      } catch (error) { if (loggerRef.current) loggerRef.current.log(`EstimateHands error: ${error.message}`, {}, true); }
      finally { if (pixelsTensor) pixelsTensor.dispose(); }
      if (handsOutput && handsOutput.length > 0 && handsOutput[0].keypoints?.length > 0) {
        currentlyDetected = true; handToDraw = handsOutput[0];
      }
    }
    if (currentlyDetected) {
      nonDetectionCountRef.current = 0;
      if (!handDetected) setHandDetected(true);
      if (envMessage.startsWith('No hand detected')) setEnvMessage('');
    } else if (!isPostHitPauseActive) {
      nonDetectionCountRef.current++;
      if (nonDetectionCountRef.current >= DETECTION_THRESHOLD && handDetected) {
        setHandDetected(false);
        if (testStarted && !visualAidMode) setEnvMessage('No hand detected. Check position/lighting.');
        else if (visualAidMode && !testStarted) setEnvMessage('No hand detected for outline.');
      }
    }
    if (visualAidMode && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (canvasRef.current.width !== displayWidth || canvasRef.current.height !== displayHeight) {
          if (displayWidth > 0 && displayHeight > 0) {
            canvasRef.current.width = displayWidth; canvasRef.current.height = displayHeight;
          }
      }
      if (displayWidth > 0 && displayHeight > 0) {
        ctx.clearRect(0, 0, displayWidth, displayHeight);
        if (hitFlashRef.current && testStarted) {
          ctx.fillStyle = 'rgba(0, 255, 0, 0.3)'; ctx.fillRect(0, 0, displayWidth, displayHeight);
        }
        if (handToDraw?.keypoints) {
          handToDraw.keypoints.forEach((kp, idx) => {
            if (isValidKeypoint(kp)) {
              const mirroredX = intrinsicVideoWidth - kp.x;
              const dX = mirroredX * scaleX; const dY = kp.y * scaleY;
              ctx.beginPath(); ctx.arc(dX, dY, 5, 0, 2 * Math.PI);
              if (idx === INDEX_FINGER_TIP_KP) ctx.fillStyle = 'red';
              else if (idx === MIDDLE_FINGER_TIP_KP) ctx.fillStyle = 'orange';
              else if (HITTABLE_KEYPOINT_INDICES.includes(idx)) ctx.fillStyle = 'yellow';
              else ctx.fillStyle = 'aqua';
              ctx.fill();
            }
          });
        }
      }
    } else if (!visualAidMode && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (canvasRef.current.width > 0) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    if (testStarted && !isPostHitPauseActive && handToDraw?.keypoints && targetVisible && isTargetArmed && !isProcessingHitRef.current) {
      for (const kpIndex of HITTABLE_KEYPOINT_INDICES) {
        const kpUse = handToDraw.keypoints[kpIndex];
        if (isValidKeypoint(kpUse)) {
            const mirroredX = intrinsicVideoWidth - kpUse.x;
            const kDX = mirroredX * scaleX; const kDY = kpUse.y * scaleY;
            const tL = targetPosition.x, tR = targetPosition.x + TARGET_SIZE_PX;
            const tT = targetPosition.y, tB = targetPosition.y + TARGET_SIZE_PX;
            if (kDX >= tL && kDX <= tR && kDY >= tT && kDY <= tB) {
                if (loggerRef.current) loggerRef.current.log(`Target: Hit by kp ${kpIndex}.`, {}, true);
                if (registerHitFnRef.current) registerHitFnRef.current();
                animationFrameIdRef.current = requestAnimationFrame(detectHands); return;
            }
        }
      }
    }
    animationFrameIdRef.current = requestAnimationFrame(detectHands);
  }, [ handDetected, targetVisible, testStarted, targetPosition, visualAidMode, isTargetArmed, isValidKeypoint, setHandDetected, setEnvMessage, isCameraStreamReady, isModelLoaded, envMessage ]); // Added missing dependencies

  useEffect(() => {
    const shouldRunLoop = isCameraStreamReady && isModelLoaded && (testStarted || visualAidMode);
    let localFrameId = animationFrameIdRef.current;
    if (shouldRunLoop) {
      if (!localFrameId) {
        if (loggerRef.current) loggerRef.current.log(`Loop: Starting detectHands.`, {}, true);
        animationFrameIdRef.current = requestAnimationFrame(detectHands);
      }
    } else {
      if (localFrameId) {
        if (loggerRef.current) loggerRef.current.log(`Loop: Stopping detectHands.`, {}, true);
        cancelAnimationFrame(localFrameId);
        animationFrameIdRef.current = null;
      }
      if (!visualAidMode && !testStarted && canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (canvasRef.current.width > 0) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
        if (loggerRef.current) loggerRef.current.log(`Loop: Cleaned up animation frame.`, {}, true);
      }
    };
  }, [testStarted, visualAidMode, isCameraStreamReady, isModelLoaded, detectHands]);

  const handleResetTest = useCallback(() => {
    if (loggerRef.current) loggerRef.current.log('Loop: Test reset.', {}, true);
    clearAllTimers();
    setFinalResultsData(null); setRawReactionTimes([]); setTestCount(0);
    setTestStarted(false); setTargetVisible(false); setIsTargetArmed(false);
    setEnvMessage(''); startTimeRef.current = null;
  }, [clearAllTimers, setEnvMessage, setFinalResultsData, setRawReactionTimes, setTestCount, setIsTargetArmed, setTargetVisible, setTestStarted]); // Added missing dependencies

  const toggleVisualAid = () => {
    const newMode = !visualAidMode;
    setVisualAidMode(newMode);
    if (loggerRef.current) loggerRef.current.log(`Visual Aid Toggled to: ${newMode}`, {}, true);
    if (envMessage.startsWith('No hand detected for outline') || envMessage === 'Position hand for outline.' || (envMessage === 'No hand detected. Check position/lighting.' && newMode)) {
      setEnvMessage('');
    }
    if (newMode && !testStarted && !handDetected) {
        setEnvMessage('Position hand for outline.');
    }
  };

  if (finalResultsData && !testStarted) {
    return <HandResults results={finalResultsData} onReset={handleResetTest} />;
  }

  return (
    <div className="hand-reaction-container">
      <h2>Hand Reaction Test</h2>
      <div className="mode-toggles">
        <button className="visual-aid-button" onClick={toggleVisualAid} disabled={!isCameraStreamReady || !isModelLoaded || testStarted}>
          {visualAidMode ? 'Hide Hand Outline' : 'Show Hand Outline'}
        </button>
      </div>
      <div className="test-stats-single-row">
        <span className="stat-item">Hand: {handDetected ? <span className="icon-tick">✓</span> : <span className="icon-cross">✗</span>}</span>
        <span className="stat-item">Count: {testCount}/5</span>
      </div>
      <div className="video-container">
        {cameraPermission ? (
          <>
            <Webcam
              ref={webcamRef} className="webcam" audio={false} mirrored={true} width={640} height={480}
              videoConstraints={{ width: 640, height: 480, facingMode: 'user' }}
              onUserMedia={() => { videoElementRef.current = webcamRef.current?.video; setIsCameraStreamReady(true); if (loggerRef.current) loggerRef.current.log('Webcam: Stream Ready.', {}, true); }}
              onUserMediaError={(err) => { setCameraPermission(false); setIsCameraStreamReady(false); setEnvMessage('Camera access denied.'); if (loggerRef.current) loggerRef.current.log(`Webcam Error: ${err.message}`, {}, true); }}
            />
            <canvas ref={canvasRef} className={`hand-landmarks-canvas ${visualAidMode ? '' : 'hidden'}`} />
            <div
              className={`target hand-target ${targetVisible ? '' : 'hidden'} ${targetVisible && !isTargetArmed ? 'arming' : ''}`}
              style={{ left: `${targetPosition.x}px`, top: `${targetPosition.y}px`, width: `${TARGET_SIZE_PX}px`, height: `${TARGET_SIZE_PX}px`, fontSize: `${TARGET_SIZE_PX * 0.8}px`, lineHeight: `${TARGET_SIZE_PX}px` }}
            >🖐️</div>
            <div className={`env-message ${envMessage || hitMessage ? '' : 'hidden'}`}>{hitMessage || envMessage}</div>
          </>
        ) : (
          <div className="camera-permission">Camera access denied. Please grant permission and refresh.</div>
        )}
      </div>
      <div className="controls">
        <button onClick={startTest} disabled={testStarted || !cameraPermission || !isCameraStreamReady || !isModelLoaded }>
          {testStarted ? 'Test In Progress...' : 'Start Test'}
        </button>
      </div>
    </div>
  );
}