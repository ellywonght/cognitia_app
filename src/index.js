import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import * as tf from '@tensorflow/tfjs';                   // core
import '@tensorflow/tfjs-backend-cpu';                    // CPU kernels
import '@tensorflow/tfjs-backend-webgl'; 

import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
