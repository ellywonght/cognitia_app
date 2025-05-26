// /src/components/HandTest/HandReaction.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import * as tf from '@tensorflow/tfjs';
import * as handpose from '@tensorflow-models/hand-pose-detection';
import HandResults from './HandResults';
import './HandReaction.css';
// Import constants, including the new ones for score calculation
import {
  REACTION_TIME_THRESHOLDS,
  STD_DEV_THRESHOLDS,
  SCORE_THRESHOLDS,
  PERFECT_REACTION_TIME,
  MAX_REACTION_TIME_FOR_ZERO_SCORE
} from './constants';

const INDEX_FINGER_TIP_KP = 8;
const MIDDLE_FINGER_TIP_KP = 12;
const HITTABLE_KEYPOINT_INDICES = [4, 8, 12, 16, 20, 5, 9, 13, 17];
const TARGET_SIZE_PX = 50;
const DETECTION_THRESHOLD = 15; // If no hand detected for this many frames, mark as not detected
const MIN_FRAME_INTERVAL = 33; // Minimum interval between frames for detection loop (~30 FPS)
const HIT_FLASH_DURATION = 200; // Duration of the green flash on hit (ms)
const HIT_MESSAGE_DURATION = 1000; // Duration the "Hit!" message is shown (ms)
const POST_HIT_PAUSE = 100; // Short pause after a hit before detecting again (ms)
const TARGET_ARMING_DURATION_MS = 150; // Time until the target becomes "hittable" (ms)
const AVOID_EDGE_MARGIN_HORIZONTAL_PX = 40; // Horizontal margin to avoid placing target too close to edges
const AVOID_EDGE_MARGIN_TOP_PX = 40; // Top margin
const AVOID_EDGE_MARGIN_BOTTOM_PX = 100; // Bottom margin (larger to avoid controls/messages)

// Revised calculateScore function
const calculateScore = (avgTime) => {
  // Correctly destructure the thresholds
  const { VERY_FAST, GOOD, NORMAL } = REACTION_TIME_THRESHOLDS;
  // Use a different name for the SCORE_THRESHOLDS.GOOD to avoid conflict if needed, though direct use is fine.
  const { EXCELLENT, GOOD: SCORE_GOOD_TARGET, FAIR } = SCORE_THRESHOLDS;

  let score;

  if (avgTime <= PERFECT_REACTION_TIME) {
    score = 100;
  } else if (avgTime <= VERY_FAST) { // Between PERFECT_REACTION_TIME and VERY_FAST
    const timeSegmentRange = VERY_FAST - PERFECT_REACTION_TIME;
    const scoreSegmentRange = 100 - EXCELLENT; // Score drops from 100 to EXCELLENT
    if (timeSegmentRange <= 0) { // Safety check for invalid constant configuration
        // If VERY_FAST is not greater than PERFECT_REACTION_TIME, default to EXCELLENT or 100
        score = (PERFECT_REACTION_TIME < VERY_FAST) ? EXCELLENT : 100;
    } else {
        score = 100 - ((avgTime - PERFECT_REACTION_TIME) / timeSegmentRange) * scoreSegmentRange;
    }
  } else if (avgTime <= GOOD) { // Between VERY_FAST and GOOD
    const timeSegmentRange = GOOD - VERY_FAST;
    const scoreSegmentRange = EXCELLENT - SCORE_GOOD_TARGET; // Score drops from EXCELLENT to SCORE_GOOD_TARGET
    if (timeSegmentRange <= 0) {
        score = SCORE_GOOD_TARGET;
    } else {
        score = EXCELLENT - ((avgTime - VERY_FAST) / timeSegmentRange) * scoreSegmentRange;
    }
  } else if (avgTime <= NORMAL) { // Between GOOD and NORMAL
    const timeSegmentRange = NORMAL - GOOD;
    const scoreSegmentRange = SCORE_GOOD_TARGET - FAIR; // Score drops from SCORE_GOOD_TARGET to FAIR
    if (timeSegmentRange <= 0) {
        score = FAIR;
    } else {
        score = SCORE_GOOD_TARGET - ((avgTime - GOOD) / timeSegmentRange) * scoreSegmentRange;
    }
  } else if (avgTime < MAX_REACTION_TIME_FOR_ZERO_SCORE) { // Between NORMAL and MAX_REACTION_TIME_FOR_ZERO_SCORE
    const timeSegmentRange = MAX_REACTION_TIME_FOR_ZERO_SCORE - NORMAL;
    const scoreSegmentRange = FAIR - 0; // Score drops from FAIR to 0
    if (timeSegmentRange <= 0) {
        score = 0; // Or FAIR if MAX_REACTION_TIME_FOR_ZERO_SCORE is not greater than NORMAL
    } else {
        score = FAIR - ((avgTime - NORMAL) / timeSegmentRange) * scoreSegmentRange;
    }
  } else { // avgTime >= MAX_REACTION_TIME_FOR_ZERO_SCORE
    score = 0;
  }

  // Ensure score is within 0-100 and rounded
  return Math.round(Math.max(0, Math.min(100, score)));
};

// Generates analysis text based on performance metrics
// This function remains the same as it interprets the calculated score.
const generateAnalysisText = (averageTime, stdDevValue, score) => {
  let avgTimeComment = "";
  if (averageTime < REACTION_TIME_THRESHOLDS.VERY_FAST) { avgTimeComment = "您的平均反應時間非常迅速。"; }
  else if (averageTime < REACTION_TIME_THRESHOLDS.GOOD) { avgTimeComment = "您的平均反應時間良好。"; }
  else if (averageTime < REACTION_TIME_THRESHOLDS.NORMAL) { avgTimeComment = "您的平均反應時間在正常範圍內。"; }
  else { avgTimeComment = "您的平均反應時間相對偏慢。"; }

  let variabilityComment = "";
  if (typeof stdDevValue === 'number' && !isNaN(stdDevValue)) {
    if (stdDevValue < STD_DEV_THRESHOLDS.CONSISTENT) { variabilityComment = "您的反應時間表現相對一致。"; }
    else if (stdDevValue < STD_DEV_THRESHOLDS.SLIGHT_FLUCTUATION) { variabilityComment = "您的反應時間表現略有波動。"; }
    else { variabilityComment = "您的反應時間表現波動較大。"; }
  } else { variabilityComment = "反應時間變異性數據不足。"; }

  let scoreComment = "";
  if (score >= SCORE_THRESHOLDS.EXCELLENT) { scoreComment = "綜合評分顯示您的整體反應表現優異。"; }
  else if (score >= SCORE_THRESHOLDS.GOOD) { scoreComment = "綜合評分顯示您的整體反應表現良好。"; }
  else if (score >= SCORE_THRESHOLDS.FAIR) { scoreComment = "綜合評分顯示您的整體反應表現尚可。"; }
  else { scoreComment = "綜合評分顯示您的整體反應表現有進步空間。請記得，多種因素均可能影響反應時間。"; }

  const generalContext = // Scientific background and disclaimer
`科學研究表明，反應時間（RT）是衡量大腦處理資訊和執行動作速度的一項重要指標。在認知健康領域，反應時間的變化，包括平均反應速度減慢和反應時間變異性（每次反應的差異程度）增加，有時被視為早期認知功能改變的潛在跡象。例如，在輕度認知障礙（MCI）或早期阿茲海默症的研究中，觀察到這些反應時間指標的變化。

然而，務必理解影響反應時間的因素非常多樣，包括年齡、專注程度、疲勞狀態、情緒、整體健康狀況以及特定藥物影響等。因此，單純的反應時間測量結果不能獨立作為任何健康狀況的判断依據。

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
    this.skipThreshold = 20; // Log summary after this many consecutive skips of the same type
  }
  getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;
  }
  setVisualAidMode(enabled) { this.visualAidEnabled = enabled; }
  log(message, data = {}, isCritical = false) {
    // Log only critical messages, loop/target messages, or if visual aid is on
    if (!this.visualAidEnabled && !isCritical && !message.includes("Loop:") && !message.includes("Target:")) return;
    const timestamp = this.getTimestamp();
    const consoleDataString = Object.keys(data).length > 0 ? `Data: ${JSON.stringify(data)}` : '';
    console.log(`[${timestamp}] [HandReaction] ${message} ${consoleDataString}`);
    // If this log is not a skip, and there were previous skips, log a summary of them
    if (!message.startsWith('DETECT_HANDS_SKIP')) {
      if (this.skipCounter > 0) {
        console.log(`[${this.getTimestamp()}] [HandReaction] DETECT_HANDS_SKIP_SUMMARY: (Flushed) Previously skipped ${this.skipCounter} frames. Reason: '${this.lastSkipReason}'. Context: ${this.lastSkipContextString}`);
      }
      this.skipCounter = 0; this.lastSkipReason = ""; this.lastSkipContextString = "";
    }
  }
  logSkip(reason, contextData = {}) {
    if (!this.visualAidEnabled) return; // Only log skips if visual aid is enabled
    const contextString = JSON.stringify(contextData);
    if (this.lastSkipReason === reason && this.lastSkipContextString === contextString) {
      this.skipCounter++;
      if (this.skipCounter === this.skipThreshold) { // Log summary when threshold is met
        console.log(`[${this.getTimestamp()}] [HandReaction] DETECT_HANDS_SKIP_SUMMARY: Skipped ${this.skipCounter} frames. Reason: '${reason}'. Context: ${contextString}`);
      }
    } else {
      // If reason/context changed, and previous skip block was large enough, log its summary
      if (this.skipCounter > 0 && this.skipCounter >= this.skipThreshold) {
        console.log(`[${this.getTimestamp()}] [HandReaction] DETECT_HANDS_SKIP_SUMMARY: (End of block) Previously skipped ${this.skipCounter} frames. Reason: '${this.lastSkipReason}'. Context: ${this.lastSkipContextString}`);
      }
      this.skipCounter = 1; this.lastSkipReason = reason; this.lastSkipContextString = contextString;
      // Log the first occurrence of a new skip type
      if (this.skipCounter === 1) console.log(`[${this.getTimestamp()}] [HandReaction] DETECT_HANDS_SKIP: ${reason} Data: ${contextString}`);
    }
  }
}

export default function HandReaction() {
  const [handDetected, setHandDetected] = useState(false);
  const [targetVisible, setTargetVisible] = useState(false);
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 });
  const [isTargetArmed, setIsTargetArmed] = useState(false); // Target is visible but not yet hittable
  const [testStarted, setTestStarted] = useState(false);
  const [testCount, setTestCount] = useState(0); // Number of hits registered
  const [rawReactionTimes, setRawReactionTimes] = useState([]);
  const [finalResultsData, setFinalResultsData] = useState(null); // Data for results screen
  const [visualAidMode, setVisualAidMode] = useState(true); // Show hand outline
  const [cameraPermission, setCameraPermission] = useState(true);
  const [envMessage, setEnvMessage] = useState(''); // Messages like "No hand detected"
  const [hitMessage, setHitMessage] = useState(''); // "Hit!" message
  const [isCameraStreamReady, setIsCameraStreamReady] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const webcamRef = useRef(null);
  const canvasRef = useRef(null); // For drawing hand landmarks
  const modelRef = useRef(null); // Handpose model
  const animationFrameIdRef = useRef(null); // For managing requestAnimationFrame
  const nextTargetRef = useRef(null); // Timeout for showing the next target
  const targetArmingTimeoutRef = useRef(null); // Timeout for arming the target
  const startTimeRef = useRef(null); // Timestamp when target becomes armed
  const videoElementRef = useRef(null); // Direct reference to the video element
  const isMountedRef = useRef(true); // Track if component is mounted
  const nonDetectionCountRef = useRef(0); // Counter for consecutive frames with no hand detection
  const lastFrameTimeRef = useRef(0); // Timestamp of the last processed frame
  const lastHitTimeRef = useRef(0); // Timestamp of the last registered hit
  const hasRunRef = useRef(false); // Ensure setupEffect runs only once
  const hitFlashRef = useRef(false); // Controls the green flash effect on hit
  const isProcessingHitRef = useRef(false); // Flag to prevent double processing of a hit
  const loggerRef = useRef(null); // Instance of AppLogger
  const initialPrepareMessageShownRef = useRef(false); // Track if the initial "Prepare" message has been shown

  useEffect(() => {
    // Initialize logger instance
    loggerRef.current = new AppLogger(visualAidMode);
  }, []); // Empty dependency array ensures this runs once on mount

  useEffect(() => {
    // Update logger's visual aid mode when the state changes
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
      stream.getTracks().forEach(track => track.stop()); // Release the stream immediately after checking
      if (loggerRef.current) loggerRef.current.log('Camera permission granted', {}, true);
      setCameraPermission(true);
      return true;
    } catch (err) {
      if (loggerRef.current) loggerRef.current.log(`Camera permission denied: ${err.message}`, { error: err.toString() }, true);
      setCameraPermission(false); setIsCameraStreamReady(false);
      setEnvMessage('Camera access denied. Please grant permission and refresh.'); return false;
    }
  }, [setEnvMessage]); // setEnvMessage is a dependency

  const isValidKeypoint = useCallback((keypoint) => {
    if (!keypoint || keypoint.x === null || keypoint.y === null || typeof keypoint.x !== 'number' || typeof keypoint.y !== 'number') return false;
    return !(isNaN(keypoint.x) || isNaN(keypoint.y));
  }, []);

  const loadModel = useCallback(async () => {
    if (loggerRef.current) loggerRef.current.log('Loading TFJS & MediaPipe Hands model...', {}, true);
    setIsModelLoaded(false);
    try {
      // Attempt to use WebGL backend
      await tf.setBackend('webgl'); await tf.ready();
      // Check if WebGL is actually supported by creating a test canvas
      if (!document.createElement('canvas').getContext('webgl')) throw new Error('WebGL not supported.');
    } catch (error) {
      if (loggerRef.current) loggerRef.current.log(`WebGL failed: ${error.message}. Fallback to CPU.`, { error: error.toString() }, true);
      // Fallback to CPU backend if WebGL fails
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
  }, [setEnvMessage]); // setEnvMessage is a dependency

  const clearAllTimers = useCallback(() => {
    if (nextTargetRef.current) clearTimeout(nextTargetRef.current);
    nextTargetRef.current = null;
    if (targetArmingTimeoutRef.current) clearTimeout(targetArmingTimeoutRef.current);
    targetArmingTimeoutRef.current = null;
  }, []);

  // Effect for initial setup (camera check, model load)
  const setupEffect = useCallback(async () => {
    if (hasRunRef.current) return; // Prevent re-running
    hasRunRef.current = true;
    if (!(await checkCameraPermissions())) { return; } // Abort if camera permission fails
    modelRef.current = await loadModel();
    if (!modelRef.current && loggerRef.current) loggerRef.current.log('Model loading failed in setup.', {}, true);
    else if (modelRef.current && loggerRef.current) loggerRef.current.log('Setup complete. Model loaded.', {}, true);
  }, [checkCameraPermissions, loadModel]); // Dependencies for setup

  useEffect(() => {
    isMountedRef.current = true;
    setupEffect(); // Run setup
    return () => { // Cleanup on unmount
      isMountedRef.current = false;
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
      clearAllTimers();
      if (typeof tf !== 'undefined' && tf.disposeVariables) tf.disposeVariables(); // Dispose TF.js tensors
      if (loggerRef.current) loggerRef.current.log('Component unmounted.', {}, true);
    };
  }, [setupEffect, clearAllTimers]); // Dependencies for mount/unmount effect

  const registerHitFnRef = useRef(); // Ref to hold the registerHit function for use in detectHands

  const showNextTarget = useCallback(() => {
    clearAllTimers();
    const videoContainerElement = webcamRef.current?.video?.parentElement;
    const displayWidth = videoContainerElement?.clientWidth || 640; // Default to 640 if not available
    const displayHeight = videoContainerElement?.clientHeight || 480; // Default to 480
    const videoElement = videoElementRef.current;

    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      if (loggerRef.current) loggerRef.current.log('Target: showNextTarget - Video element not ready.', {}, true);
      return; // Don't show target if video dimensions are unknown
    }
    const currentTargetSize = TARGET_SIZE_PX;
    const marginH = AVOID_EDGE_MARGIN_HORIZONTAL_PX;
    const marginVT = AVOID_EDGE_MARGIN_TOP_PX;
    const marginVB = AVOID_EDGE_MARGIN_BOTTOM_PX;

    // Calculate valid range for target position
    let minX = marginH;
    let maxX = displayWidth - currentTargetSize - marginH;
    let minY = marginVT;
    let maxY = displayHeight - currentTargetSize - marginVB;

    // Generate random position within valid range, or center if range is invalid
    let x = (maxX <= minX || maxY <= minY) ? Math.max(0, (displayWidth - currentTargetSize) / 2) : Math.floor(Math.random() * (maxX - minX + 1)) + minX;
    let y = (maxX <= minX || maxY <= minY) ? Math.max(0, (displayHeight - currentTargetSize) / 2) : Math.floor(Math.random() * (maxY - minY + 1)) + minY;

    // Ensure position is within bounds
    x = Math.max(0, Math.min(x, displayWidth - currentTargetSize));
    y = Math.max(0, Math.min(y, displayHeight - currentTargetSize));

    if (isNaN(x) || isNaN(y)) { // Fallback if calculations result in NaN
        x = (displayWidth - currentTargetSize) / 2;
        y = (displayHeight - currentTargetSize) / 2;
    }

    const newTargetPosition = { x, y };
    setTargetPosition(newTargetPosition);
    setTargetVisible(true);
    setIsTargetArmed(false); // Target is visible but not yet "armed"

    if (loggerRef.current) loggerRef.current.log(`Target: Visible at (${x.toFixed(0)},${y.toFixed(0)}), Arming...`, {}, true);

    targetArmingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setIsTargetArmed(true); // Arm the target
        startTimeRef.current = Date.now(); // Start reaction timer
        if (loggerRef.current) loggerRef.current.log('Target: Armed. Timer started.', { pos: newTargetPosition }, true);
      } else {
        if (loggerRef.current) loggerRef.current.log('Target: Arming timeout, but unmounted.', {}, true);
      }
    }, TARGET_ARMING_DURATION_MS);
  }, [clearAllTimers, setTargetPosition, setTargetVisible, setIsTargetArmed]);

  const registerHit = useCallback(() => {
    if (testCount >= 5) { return; } // Test already completed
    if (isProcessingHitRef.current) { return; } // Prevent double hits
    if (!startTimeRef.current) { return; } // Target wasn't armed or hit already processed

    isProcessingHitRef.current = true;
    lastHitTimeRef.current = performance.now(); // For post-hit pause in detection loop
    clearAllTimers(); // Stop arming/next target timers
    setTargetVisible(false);
    setIsTargetArmed(false);
    hitFlashRef.current = true; setHitMessage('Hit!'); nonDetectionCountRef.current = 0; // Reset non-detection on hit
    setTimeout(() => { if (isMountedRef.current) hitFlashRef.current = false; }, HIT_FLASH_DURATION); // Flash effect
    setTimeout(() => { if (isMountedRef.current) setHitMessage(''); }, HIT_MESSAGE_DURATION); // Clear "Hit!" message

    const reactionTime = Date.now() - startTimeRef.current;
    startTimeRef.current = null; // Reset start time

    setRawReactionTimes(prev => {
      const updatedRawTimes = [...prev, reactionTime];
      const numHits = updatedRawTimes.length;
      setTestCount(numHits); // Update hit count
      if (loggerRef.current) loggerRef.current.log(`Target: Hit ${numHits}. Time: ${reactionTime}ms.`, {}, true);

      if (numHits >= 5) { // Test complete
        const avgTime = Math.round(updatedRawTimes.reduce((a, b) => a + b, 0) / numHits);
        const bestTime = Math.min(...updatedRawTimes);
        const currentScore = calculateScore(avgTime); // Use the revised calculateScore
        let standardDeviation = 0;
        if (updatedRawTimes.length > 0) { // Calculate standard deviation
            const mean = avgTime;
            standardDeviation = Math.sqrt(updatedRawTimes.map(xVal => Math.pow(xVal - mean, 2)).reduce((a, b) => a + b, 0) / updatedRawTimes.length);
            standardDeviation = Math.round(standardDeviation);
        }
        const analysisTextsResult = generateAnalysisText(avgTime, standardDeviation, currentScore);
        if (loggerRef.current) loggerRef.current.log(`Test Complete. Avg: ${avgTime}, Score: ${currentScore}, StdDev: ${standardDeviation}`, {}, true);
        setFinalResultsData({ // Set data for results screen
            times: [...updatedRawTimes], averageTime: avgTime, bestTime: bestTime,
            score: currentScore, stdDev: standardDeviation, analysisTexts: analysisTextsResult
        });
        isProcessingHitRef.current = false;
      } else { // Test not yet complete, schedule next target
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
  }, [testCount, testStarted, showNextTarget, clearAllTimers, setHitMessage, setIsTargetArmed, setTargetVisible, setRawReactionTimes, setTestCount, setFinalResultsData]);

  useEffect(() => { // Keep registerHitFnRef updated
    registerHitFnRef.current = registerHit;
  }, [registerHit]);

  useEffect(() => { // Effect to stop the test when 5 hits are registered
    if (testCount >= 5 && testStarted) {
        if (loggerRef.current) loggerRef.current.log('Loop: Test completed, setting testStarted to false.', {}, true);
        setTestStarted(false); // Stop the test
    }
  }, [testCount, testStarted]);

  const startTest = useCallback(() => {
    if (testStarted) return; // Prevent starting if already started
    if (!isCameraStreamReady || !isModelLoaded) { // Check readiness
        setEnvMessage('Camera or model not fully ready. Please wait.');
        if (loggerRef.current) loggerRef.current.log('StartTest: Not ready.', {}, true);
        return;
    }
    if (loggerRef.current) loggerRef.current.log('StartTest: Initiated.', {}, true);
    clearAllTimers(); // Clear any existing timers
    // Reset test state
    setRawReactionTimes([]); setFinalResultsData(null);
    setTestCount(0); setIsTargetArmed(false); setTargetVisible(false);
    setEnvMessage(!initialPrepareMessageShownRef.current ? 'Prepare: Hand palm facing camera, good light, plain background.' : 'Starting test...');
    if (!initialPrepareMessageShownRef.current) initialPrepareMessageShownRef.current = true;
    isProcessingHitRef.current = false; startTimeRef.current = null;

    setTimeout(() => {
        if (isMountedRef.current) {
            setEnvMessage(''); setTestStarted(true);
            if (loggerRef.current) loggerRef.current.log('Loop: testStarted set to true.', {}, true);
            showNextTarget(); // Show the first target
        }
    }, 3000); // 3-second preparation delay
  }, [ testStarted, showNextTarget, isCameraStreamReady, isModelLoaded, clearAllTimers, setEnvMessage, setRawReactionTimes, setFinalResultsData, setTestCount, setIsTargetArmed, setTargetVisible ]);

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
  }, [ handDetected, targetVisible, testStarted, targetPosition, visualAidMode, isTargetArmed, isValidKeypoint, setHandDetected, setEnvMessage, isCameraStreamReady, isModelLoaded, envMessage ]);

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
  }, [clearAllTimers, setEnvMessage, setFinalResultsData, setRawReactionTimes, setTestCount, setIsTargetArmed, setTargetVisible, setTestStarted]);

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
              onUserMedia={() => {
                videoElementRef.current = webcamRef.current?.video;
                setIsCameraStreamReady(true);
                if (loggerRef.current) loggerRef.current.log('Webcam: Stream Ready.', {}, true);
              }}
              onUserMediaError={(err) => {
                setCameraPermission(false);
                setIsCameraStreamReady(false);
                setEnvMessage('Camera access denied.');
                if (loggerRef.current) loggerRef.current.log(`Webcam Error: ${err.message}`, {}, true);
              }}
            />
            <canvas ref={canvasRef} className={`hand-landmarks-canvas ${visualAidMode ? '' : 'hidden'}`} />
            <div
              className={`target hand-target ${targetVisible ? '' : 'hidden'} ${targetVisible && !isTargetArmed ? 'arming' : ''}`}
              style={{
                left: `${targetPosition.x}px`, top: `${targetPosition.y}px`,
                width: `${TARGET_SIZE_PX}px`, height: `${TARGET_SIZE_PX}px`,
                fontSize: `${TARGET_SIZE_PX * 0.8}px`, lineHeight: `${TARGET_SIZE_PX}px`
              }}
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