import React from 'react';

function Home({ setCurrentTest }) {
  return (
    <div className="home-container">
      <h2>選擇測試類型</h2>
      <div className="test-options">
        <div className="test-card" onClick={() => setCurrentTest('language')}>
          <h3>語言理解測試</h3>
          <p>評估語言理解和處理能力</p>
        </div>
        
        <div className="test-card" onClick={() => setCurrentTest('hand')}>
          <h3>反應速度測試</h3>
          <p>評估手部動作協調和反應時間</p>
        </div>

        <div className="test-card" onClick={() => setCurrentTest('realEye')}>
          <h3>眼球追蹤測試</h3>
          <p>跟隨螢幕上的移動目標，評估視覺追蹤能力</p>
        </div>

        <div className="test-card" onClick={() => setCurrentTest('pupil')}>
          <h3>瞳孔光反應測試</h3>
          <p>測量瞳孔的擴張與收縮</p>
        </div>

      </div>
    </div>
  );
}

export default Home;