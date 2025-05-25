import React, { useState, useEffect, useRef, useCallback } from 'react';
import './RealEyeTracking.css'; // We will provide the updated CSS below

const globalWebgazerRef = { current: null };

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
  const [mode,            setMode]           = useState(null); 
  const [status,          setStatus]         = useState('Initializing system...'); 
  const [statusType,      setStatusType]     = useState('info'); 
  const [webgazerReady,   setWebgazerReady]  = useState(false); 
  const [isCameraActuallyActive, setIsCameraActuallyActive] = useState(false);
  const [cameraError,     setCameraError]    = useState(false); 
  const [calibrationState,setCalibrationState] = useState({
    isCalibrating: false, currentPointIndex: 0, clicksMade: 0, completedPoints: 0
  });
  const [gazePosition,    setGazePosition]   = useState({ x:null, y:null });
  const [canClick,        setCanClick]       = useState(true);
  const [timeLeft,        setTimeLeft]       = useState(TEST_DURATION_MS/1000);
  const [targetPosition,  setTargetPosition] = useState({ x:10, y:10 });
  const [testResults,     setTestResults]    = useState(null);
  
  const isMountedRef     = useRef(true);
  const xFilter          = useRef(new KalmanFilter());
  const yFilter          = useRef(new KalmanFilter());
  const lastUpdateTime   = useRef(0);
  const webgazerInstance = useRef(null); 
  const trackingAreaRef  = useRef(null);
  const targetInterval   = useRef(null);
  const countdownInterval= useRef(null);
  const accuracyInterval = useRef(null);
  const gazeDisplayRef   = useRef({ x:null, y:null });
  const targetDisplayRef = useRef(targetPosition);
  const startTimeRef     = useRef(null);
  const accuracyRef      = useRef([]);
  const gazeProcessingLogicRef = useRef(null);
  
  const mountCycleRef    = useRef(0); 
  const initDelayTimeoutRef = useRef(null);
  const scriptTagId = 'webgazer-script-instance'; 

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => { gazeDisplayRef.current = gazePosition; }, [gazePosition]);
  useEffect(() => { targetDisplayRef.current = targetPosition; }, [targetPosition]);

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
    console.log("[DEBUG] stopAllIntervals called.");
    if (targetInterval.current) { 
        console.log(`[DEBUG] Clearing targetInterval ID: ${targetInterval.current}`);
        clearInterval(targetInterval.current); 
        targetInterval.current = null; 
        console.log("[DEBUG] Target interval cleared.");
    } else {
        console.log("[DEBUG] No targetInterval to clear.");
    }
    if (countdownInterval.current) {
        console.log(`[DEBUG] Clearing countdownInterval ID: ${countdownInterval.current}`);
        clearInterval(countdownInterval.current); 
        countdownInterval.current = null; 
        console.log("[DEBUG] Countdown interval cleared.");
    } else {
        console.log("[DEBUG] No countdownInterval to clear.");
    }
    if (accuracyInterval.current) {
        console.log(`[DEBUG] Clearing accuracyInterval ID: ${accuracyInterval.current}`);
        clearInterval(accuracyInterval.current); 
        accuracyInterval.current = null; 
        console.log("[DEBUG] Accuracy interval cleared.");
    } else {
        console.log("[DEBUG] No accuracyInterval to clear.");
    }
  }, []);

  const stopWebGazerAndCleanup = useCallback(async (caller) => {
    console.log(`[DEBUG] stopWebGazerAndCleanup called by: ${caller}.`);
    stopAllIntervals(); 

    const wg = webgazerInstance.current || globalWebgazerRef.current; 

    if (wg) {
        console.log(`[DEBUG] (${caller}) WebGazer instance found. Attempting shutdown.`);
        if (isMountedRef.current) setStatus('Shutting down eye tracking system...');
        
        try {
            if (typeof wg.removeGazeListener === 'function') {
                wg.removeGazeListener(stableGazeCallback); 
                console.log(`[DEBUG] (${caller}) Gaze listener removed.`);
            }

            if (typeof wg.pause === 'function') {
                let isCurrentlyReady = typeof wg.isReady === 'function' ? wg.isReady() : true; 
                if (isCurrentlyReady) {
                    await wg.pause();
                    console.log(`[DEBUG] (${caller}) WebGazer paused.`);
                } else {
                    console.log(`[DEBUG] (${caller}) WebGazer not ready or already paused, skipping pause call.`);
                }
            }
            
            console.log(`[DEBUG] (${caller}) Clearing WebGazer's DOM elements...`);
            document.querySelectorAll('video[id^="webgazer"], canvas[id^="webgazer"], #webgazerFaceOverlay, #webgazerFaceFeedbackBox, #webgazerVideoFeed, .webgazerVideoContainer')
                .forEach(el => {
                    if (el.tagName === 'VIDEO' && el.srcObject && typeof el.srcObject.getTracks === 'function') {
                        el.srcObject.getTracks().forEach(track => track.stop());
                        el.srcObject = null;
                    }
                    el.remove();
                    console.log(`[DEBUG] (${caller}) Removed element: ${el.id || el.className || el.tagName}`);
                });

            if (typeof wg.end === 'function') {
                console.log(`[DEBUG] (${caller}) Calling wg.end()...`);
                await wg.end();
                console.log(`[DEBUG] (${caller}) wg.end() completed.`);
            } else {
                 console.warn(`[DEBUG] (${caller}) wg.end() is not a function on this WebGazer instance.`);
            }

        } catch (error) {
            console.error(`[DEBUG] (${caller}) Error during WebGazer stop/end operations:`, error.message, error.stack ? error.stack : '');
        } finally {
            if (window.webgazer) {
                 window.webgazer = null; 
                 console.log(`[DEBUG] (${caller}) window.webgazer has been nulled.`);
            }
            webgazerInstance.current = null;
            globalWebgazerRef.current = null;
            
            if (isMountedRef.current) {
                setWebgazerReady(false);
                setIsCameraActuallyActive(false);
                setStatus('Eye tracking system shut down.');
            }
            console.log(`[DEBUG] (${caller}) WebGazer refs and component states reset.`);
        }
    } else {
        console.log(`[DEBUG] (${caller}) No WebGazer instance found to stop.`);
        if (isMountedRef.current) { 
            setWebgazerReady(false);
            setIsCameraActuallyActive(false);
        }
    }

    if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const activeVideo = devices.some(device => device.kind === 'videoinput' && device.label !== '');
            if (activeVideo) {
                console.warn(`[DEBUG] (${caller}) Verification: Camera may still be active after shutdown attempts.`);
            } else {
                console.log(`[DEBUG] (${caller}) Verification: Camera appears to be off.`);
            }
            if(isMountedRef.current) setIsCameraActuallyActive(activeVideo);
        } catch (err) {
            console.error(`[DEBUG] (${caller}) Error during camera verification:`, err.message);
        }
    }
  }, [stopAllIntervals, stableGazeCallback]); 

  const actuallyInitializeAndStartWebgazer = useCallback(async (mountAttemptIdentifier) => {
    console.log(`[DEBUG] actuallyInitializeAndStartWebgazer called for mount: ${mountAttemptIdentifier}`);

    if (!isMountedRef.current) {
        console.log(`[DEBUG] (${mountAttemptIdentifier}) Aborting init: Component not mounted.`);
        return;
    }
    if (webgazerReady) {
        console.log(`[DEBUG] (${mountAttemptIdentifier}) Aborting init: WebGazer already ready.`);
        return;
    }
    if (!window.webgazer) { 
        console.error(`[DEBUG] (${mountAttemptIdentifier}) Aborting init: window.webgazer not found. Script load failed or pending.`);
        if (isMountedRef.current) {
            setStatus('Error: Eye tracking script not loaded.');
            setCameraError(true);
        }
        return;
    }

    try {
        if (isMountedRef.current) {
            setStatus('Configuring eye tracker...');
            setCameraError(false);
        }
        
        if (webgazerInstance.current && webgazerInstance.current !== window.webgazer) {
            console.warn(`[DEBUG] (${mountAttemptIdentifier}) Stale webgazerInstance.current detected. Will use fresh window.webgazer.`);
            try {
                if(webgazerInstance.current.end) await webgazerInstance.current.end();
            } catch(e) { /* ignore error ending stale instance */ }
        }
        
        webgazerInstance.current = window.webgazer;
        globalWebgazerRef.current = window.webgazer;
        const wg = webgazerInstance.current;

        if (!wg || typeof wg.begin !== 'function') {
            throw new Error("WebGazer object is invalid or missing 'begin' method.");
        }

        console.log(`[DEBUG] (${mountAttemptIdentifier}) Configuring WebGazer parameters.`);
        if (!wg.params) throw new Error("WebGazer instance is missing 'params' object.");
        
        wg.params.showVideoPreview = true;  // changed to true to activate tracking 
        wg.params.showFaceOverlay = false;
        wg.params.showPredictionPoints = true;  // changed to true to show red prediction dot 
        wg.params.showVideo = false; 
        wg.params.smoothing = true;
        
        if (typeof wg.setGazeListener !== 'function') throw new Error("WebGazer instance is missing setGazeListener method.");
        wg.setGazeListener(stableGazeCallback);
        
        console.log(`[DEBUG] (${mountAttemptIdentifier}) Calling wg.begin() to start camera and predictions.`);
        if (isMountedRef.current) setStatus('Starting camera and eye tracking model...');
        await wg.begin();

        if (!isMountedRef.current) { 
            console.warn(`[DEBUG] (${mountAttemptIdentifier}) Component unmounted during wg.begin(). Attempting cleanup.`);
            if (wg && typeof wg.end === 'function') await wg.end().catch(e => console.warn(`Error ending wg during unmount in begin:`, e));
            return;
        }
        
        if (wg && typeof wg.showPredictionPoints === 'function') {
            wg.showPredictionPoints(false);
            console.log(`[DEBUG] (${mountAttemptIdentifier}) Explicitly turned off prediction points after begin.`);
        }
        if (wg && typeof wg.showVideo === 'function') { 
            wg.showVideo(false); 
            wg.showFaceOverlay(false);
            console.log(`[DEBUG] (${mountAttemptIdentifier}) Explicitly turned off video and face overlay after begin.`);
        }

        console.log(`[DEBUG] (${mountAttemptIdentifier}) wg.begin() successful.`);
        if (isMountedRef.current) {
            setWebgazerReady(true); 
            setIsCameraActuallyActive(true); 
            setStatus('System ready. Choose a mode.');
            setStatusType('success');
        }

    } catch (error) {
        console.error(`[DEBUG] (${mountAttemptIdentifier}) Error during actuallyInitializeAndStartWebgazer:`, error.message, error.stack);
        if (isMountedRef.current) {
            setStatus(`Error: ${error.message}`); setStatusType('error');
            setCameraError(true); setWebgazerReady(false); setIsCameraActuallyActive(false);
        }
    }
  }, [stableGazeCallback, webgazerReady]);

  useEffect(() => {
    isMountedRef.current = true;
    mountCycleRef.current++;
    const currentCycle = mountCycleRef.current;
    const mountId = `mount-${Date.now()}`;
    let scriptElementCreatedInThisEffect = null; 
    let localScriptLoadingInProgress = false; 

    console.log(`[DEBUG] useEffect[Mount]: Effect run ${currentCycle} (ID: ${mountId}). webgazerReady: ${webgazerReady}`);

    const handleScriptLoad = () => {
        console.log(`[DEBUG] Script (ID: ${scriptTagId}) LOADED for effect run ${currentCycle} (ID: ${mountId}).`);
        localScriptLoadingInProgress = false; 
        if (isMountedRef.current && !webgazerReady) {
            const isStrictModeSecondPass = currentCycle >= 2;
            const isNonStrictMode = typeof React.StrictMode === 'undefined'; 

            if (isStrictModeSecondPass || isNonStrictMode) { 
                console.log(`[DEBUG] (${mountId}, Cycle ${currentCycle}) Script loaded. Proceeding with initialization.`);
                actuallyInitializeAndStartWebgazer(`${mountId}-cycle${currentCycle}`);
            } else { 
                 console.log(`[DEBUG] (${mountId}, Cycle ${currentCycle}) Script loaded (StrictMode 1st pass). Initialization deferred.`);
            }
        } else if (webgazerReady) {
             console.log(`[DEBUG] (${mountId}, Cycle ${currentCycle}) Script loaded, but WebGazer already ready.`);
        } else if (!isMountedRef.current) {
            console.log(`[DEBUG] (${mountId}, Cycle ${currentCycle}) Script loaded, but component unmounted.`);
        }
    };

    const handleScriptError = (errorEvent) => {
        console.error(`[DEBUG] Script (ID: ${scriptTagId}) FAILED to load for effect run ${currentCycle} (ID: ${mountId}). Error:`, errorEvent);
        localScriptLoadingInProgress = false;
        if (isMountedRef.current) {
            setStatus('Critical Error: Failed to load eye tracking script.');
            setStatusType('error'); setCameraError(true); setWebgazerReady(false);
        }
    };

    if (!webgazerReady) {
        if (currentCycle === 1) { 
            console.log(`[DEBUG] (${mountId}, Cycle ${currentCycle}) First effect run. Preparing to load script.`);
            if (isMountedRef.current) setStatus('Initializing eye tracking module...');
            
            const existingScript = document.getElementById(scriptTagId);
            if (existingScript) {
                console.warn(`[DEBUG] (${mountId}, Cycle ${currentCycle}) Found existing script tag ("${scriptTagId}"). Removing it first.`);
                existingScript.remove();
            }
            if (window.webgazer){ 
                console.warn(`[DEBUG] (${mountId}, Cycle ${currentCycle}) window.webgazer exists unexpectedly. Nulling it before script load.`);
                window.webgazer = null; 
            }

            console.log(`[DEBUG] (${mountId}, Cycle ${currentCycle}) Appending script: ${scriptTagId}`);
            const script = document.createElement('script');
            script.id = scriptTagId;
            script.src = 'https://webgazer.cs.brown.edu/webgazer.js';
            script.async = true;
            script.onload = handleScriptLoad;
            script.onerror = handleScriptError;
            document.head.appendChild(script);
            scriptElementCreatedInThisEffect = script; 
            localScriptLoadingInProgress = true;

        } else if (currentCycle >= 2) { 
            console.log(`[DEBUG] (${mountId}, Cycle ${currentCycle}) StrictMode re-run. Delaying initialization attempt.`);
            if (initDelayTimeoutRef.current) clearTimeout(initDelayTimeoutRef.current);
            initDelayTimeoutRef.current = setTimeout(() => {
                initDelayTimeoutRef.current = null;
                if (isMountedRef.current && !webgazerReady) {
                    console.log(`[DEBUG] (${mountId}, Cycle ${currentCycle}) Delayed init: Checking for window.webgazer.`);
                    if (window.webgazer) { 
                        console.log(`[DEBUG] (${mountId}, Cycle ${currentCycle}) Delayed init: window.webgazer found. Initializing.`);
                        actuallyInitializeAndStartWebgazer(`${mountId}-cycle${currentCycle}-delayed`);
                    } else {
                        console.warn(`[DEBUG] (${mountId}, Cycle ${currentCycle}) Delayed init: window.webgazer NOT found. Script from 1st pass might have failed or been removed.`);
                         if (isMountedRef.current) {
                            setStatus('Error: Script load issue in delayed init.'); setCameraError(true);
                         }
                    }
                } else {
                    console.log(`[DEBUG] (${mountId}, Cycle ${currentCycle}) Delayed init skipped (unmounted or already ready).`);
                }
            }, 350); 
        }
    } else {
        console.log(`[DEBUG] (${mountId}, Cycle ${currentCycle}) WebGazer already ready. No action needed in mount effect.`);
    }

    return () => {
      const unmountId = `unmount-${Date.now()}`;
      console.log(`[DEBUG] useEffect[Unmount]: Cleanup for effect run ${currentCycle} (Mount ID: ${mountId}). Unmount event (ID: ${unmountId}).`);
      isMountedRef.current = false; 
      
      if (initDelayTimeoutRef.current) {
          clearTimeout(initDelayTimeoutRef.current);
          initDelayTimeoutRef.current = null;
          console.log(`[DEBUG] (${unmountId}) Cleared pending init timeout.`);
      }

      if (scriptElementCreatedInThisEffect) { 
          console.log(`[DEBUG] (${unmountId}) This effect instance (Cycle ${currentCycle}) added script ("${scriptTagId}"). Removing its handlers and node.`);
          scriptElementCreatedInThisEffect.onload = null;
          scriptElementCreatedInThisEffect.onerror = null;
          scriptElementCreatedInThisEffect.remove();
          scriptElementCreatedInThisEffect = null; 
      }
      
      stopWebGazerAndCleanup(`unmount_effect_cycle_${currentCycle}_mountID_${mountId}`);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const endTest = useCallback(async (early = false) => {
    console.log(`[DEBUG] endTest called. Early: ${early}, Current mode state via ref: ${modeRef.current}`);

    stopAllIntervals(); 

    if (modeRef.current !== 'test' && !early) {
        console.warn(`[DEBUG] endTest: Mode is already '${modeRef.current}'. Bailing normal test end if not forced early.`);
        if (!early) return; 
    }
    
    try {
        const validSamples = accuracyRef.current.filter(s => typeof s === 'number' && !isNaN(s));
        const avgAccuracy = validSamples.length ? validSamples.reduce((a, b) => a + b, 0) / validSamples.length : 0;
        const duration = (early && startTimeRef.current) 
                         ? ((Date.now() - startTimeRef.current) / 1000).toFixed(1) 
                         : (TEST_DURATION_MS / 1000).toFixed(1);
        
        if(isMountedRef.current) {
            console.log("[DEBUG] endTest: Setting test results.");
            setTestResults({
              accuracy: avgAccuracy.toFixed(1),
              consistency: calculateConsistency(validSamples), 
              duration: duration,
              samples: validSamples.length
            });
            
            console.log("[DEBUG] endTest: Setting mode to results and updating status.");
            setTimeLeft(0); 
            setMode('results'); 
            setStatus(early ? 'Test ended early. View results.' : 'Test complete. View your results.');
            setStatusType('success');
        } else {
            console.log("[DEBUG] endTest: Component unmounted during results processing.");
        }
    } catch (error) {
        console.error("[DEBUG] Error within endTest during result processing or state setting:", error);
        if (isMountedRef.current) {
            setMode('results'); 
            setStatus('Error processing test results. Displaying available data.');
            setStatusType('error');
        }
    }
  }, [calculateConsistency, stopAllIntervals]); 

  const endTestRef = useRef(endTest);
  useEffect(() => {
    endTestRef.current = endTest;
  }, [endTest]);

  const startCalibrationMode = useCallback(async () => {
    if (!webgazerReady) {
      setStatus('System not ready. Please wait.'); setStatusType('error'); 
      console.log("[DEBUG] startCalibrationMode failed: webgazerReady is false.");
      return;
    }
    setMode('calibration');
    setCalibrationState({ isCalibrating: true, currentPointIndex: 0, clicksMade: 0, completedPoints: 0 });
    setStatus(`Point 1/${CALIBRATION_POINTS.length} - Click ${CLICKS_PER_POINT} times`);
    setStatusType('info');
    console.log("[DEBUG] startCalibrationMode: Switched to calibration mode.");
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
      console.log("[DEBUG] startTestMode failed: webgazerReady is false.");
      return;
    }
    
    console.log("[DEBUG] startTestMode: Initiating test.");
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
    console.log("[DEBUG] Setting up new countdownInterval.");
    countdownInterval.current = setInterval(() => {
        setTimeLeft(prevTimeLeft => {
            if (!isMountedRef.current) { 
                if (countdownInterval.current) clearInterval(countdownInterval.current);
                countdownInterval.current = null;
                return prevTimeLeft; 
            }

            if (prevTimeLeft <= 1) { 
                console.log("[DEBUG] Countdown timer reached end. Clearing self and calling endTest.");
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

    console.log("[DEBUG] startTestMode: Switched to test mode, intervals started.");
  }, [webgazerReady, moveTargetAroundEdge, calculateAccuracy]);

  const handleBackToMenu = useCallback(async () => { 
    setMode(null); setTestResults(null);
    setTimeLeft(TEST_DURATION_MS / 1000);
    setGazePosition({ x: null, y: null }); 
    setStatus('System ready. Choose a mode.'); setStatusType('info');
  }, []);

  const handleReturnHome = useCallback(() => {
    console.log("[DEBUG] handleReturnHome: Calling setCurrentTest('home'). Unmount effect will handle cleanup.");
    mountCycleRef.current = 0; 
    setCurrentTest('home');
  }, [setCurrentTest]);

  const retrySystemSetup = useCallback(async () => {
    if (isMountedRef.current) {
      console.log("[DEBUG] retrySystemSetup called.");
      setStatus('Retrying system setup...'); setStatusType('info');
      setCameraError(false);
      setWebgazerReady(false); 
      setIsCameraActuallyActive(false);
      
      await stopWebGazerAndCleanup("retry_setup_pre_cleanup");
      
      mountCycleRef.current = 0; 
      
      console.log("[DEBUG] retrySystemSetup: Main useEffect should re-trigger initialization.");
      setMode(prevMode => prevMode === null ? 'retrying_dummy_state' : null); 
    }
  }, [stopWebGazerAndCleanup]);

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
        {/* The "Return to Home" button in the header is assumed to be part of your parent component's header */}
        {/* If it's specific to this component, it would be here: */}
        {/* <button onClick={handleReturnHome} className="home-button-header">Return to Home</button> */}
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
                <div className="target-dot" style={{ left: `${targetPosition.x}%`, top: `${targetPosition.y}%` }}/>
                {isCameraActuallyActive && webgazerReady && typeof gazePosition.x === 'number' && 
                  <div className="gaze-indicator" style={{ left: `${gazePosition.x}px`, top: `${gazePosition.y}px` }}/>}
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
      {/* Footer section entirely removed */}
    </div>
  );
}