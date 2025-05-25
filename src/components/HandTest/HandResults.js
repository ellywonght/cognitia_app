import React from 'react';
// CSS is in HandReaction.css (make sure the .scale-pointer CSS is updated for rotation)

const calculatePointerPosition = (actualValue, minValOnScale, maxValOnScale) => {
  if (actualValue <= minValOnScale) return 0;
  if (actualValue >= maxValOnScale) return 100;
  if (maxValOnScale <= minValOnScale) return 0;
  return ((actualValue - minValOnScale) / (maxValOnScale - minValOnScale)) * 100;
};

function PerformanceScale({ title, value, unit, scaleParams, pointerPos, analysisComment }) {
  return (
    <div className="performance-scale-container">
      <h4>{title}: {value}{unit}</h4>
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
                title={segment.label}
              ></div>
            ) : null;
          })}
        </div>
        <div 
          className="scale-pointer" 
          style={{ left: `${pointerPos}%` }}
        >▼</div> {/* This character will be rotated by CSS to point upwards */}
        <div className="scale-thresholds">
          <span className="scale-threshold-label" style={{ left: `0%` }}>{scaleParams.min}</span>
          {scaleParams.thresholds.map(thr => {
            const pos = calculatePointerPosition(thr, scaleParams.min, scaleParams.max);
            if (pos > 5 && pos < 95) { 
              return <span key={thr} className="scale-threshold-label" style={{ left: `${pos}%` }}>{thr}</span>;
            }
            return null;
          })}
          <span className="scale-threshold-label" style={{ right: `0%`, transform: 'translateX(50%)' }}>{scaleParams.max}</span>
        </div>
      </div>
      {analysisComment && (
        <p className="scale-analysis-comment">{analysisComment}</p>
      )}
    </div>
  );
}

function HandResults({ results, onReset }) {
  const times = results.times || [];
  const maxBarHeight = 130;
  const minBarHeight = 10;
  const maxTimeForChart = times.length > 0 ? Math.max(...times, 1) : 1000;

  const averageTime = results.averageTime;
  const stdDev = results.stdDev;
  const analysisTexts = results.analysisTexts || {}; 

  const avgTimeScaleParams = {
    min: 150, max: 850, 
    segments: [
      { limit: 350, color: '#5cb85c', label: '非常迅速' }, { limit: 550, color: '#f0ad4e', label: '良好' },
      { limit: 750, color: '#d9534f', label: '正常範圍' }, { limit: Infinity, color: '#c9302c', label: '相對偏慢' }
    ],
    thresholds: [350, 550, 750]
  };
  const avgTimePointerPos = calculatePointerPosition(averageTime, avgTimeScaleParams.min, avgTimeScaleParams.max);

  const stdDevScaleParams = {
    min: 0, max: 250, 
    segments: [
      { limit: 100, color: '#5cb85c', label: '相對一致' }, { limit: 180, color: '#f0ad4e', label: '略有波動' },
      { limit: Infinity, color: '#d9534f', label: '波動較大' }
    ],
    thresholds: [100, 180]
  };
  const stdDevPointerPos = calculatePointerPosition(stdDev, stdDevScaleParams.min, stdDevScaleParams.max);

  return (
    <div className="results-container">
      <h2>反應速度測量結果</h2>
      <div className="score-summary">
        <div className="score-circle"><span>{results.score}%</span></div>
        <p>綜合表現評分</p>
        {/* NEW: Display the score comment */}
        {analysisTexts.scoreComment && (
          <p className="score-overall-comment">{analysisTexts.scoreComment}</p>
        )}
      </div>

      {/* Metrics grid removed */}

      <div className="visual-scales-section">
        <PerformanceScale 
          title="平均反應時間" value={averageTime} unit="ms" 
          scaleParams={avgTimeScaleParams} pointerPos={avgTimePointerPos}
          analysisComment={analysisTexts.avgTimeComment} 
        />
        <PerformanceScale 
          title="反應時間變異 (標準差)" value={stdDev} unit="ms" 
          scaleParams={stdDevScaleParams} pointerPos={stdDevPointerPos}
          analysisComment={analysisTexts.variabilityComment} 
        />
      </div>

      <div className="reaction-times-container">
        <h3>反應時間記錄 (5次測試)</h3>
        <div className="reaction-times-chart" style={{ height: `${maxBarHeight + 30}px` }}>
          {times.map((time, index) => {
            const barHeight = Math.max(minBarHeight, maxTimeForChart > 0 ? (time / maxTimeForChart) * maxBarHeight : minBarHeight);
            return (
              <div key={index} className="chart-column">
                <div className="reaction-time-bar" title={`${time}ms`} style={{ width: '100%', height: `${barHeight}px`, backgroundColor: time < 350 ? '#5cb85c' : time < 550 ? '#f0ad4e' : time < 750 ? '#d9534f' : '#c9302c' }}>
                  <span className="reaction-time-label">{time}ms</span>
                </div>
                <div className="test-label-bottom">測試 {index + 1}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="analysis-box">
        <h3>專業背景與重要提示</h3>
        <p style={{ whiteSpace: 'pre-line', textAlign: 'left', lineHeight: '1.6' }}>
          {analysisTexts.generalContext}
        </p>
      </div>

      <button className="submit-button" onClick={onReset}>再試一次</button>
    </div>
  );
}

export default HandResults;