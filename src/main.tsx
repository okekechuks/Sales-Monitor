import React from 'react';
import ReactDOM from 'react-dom/client';
// Import the actual React component file (Main.tsx). The previous import without extension
// matched the legacy stub file named 'Main', yielding an empty render.
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
