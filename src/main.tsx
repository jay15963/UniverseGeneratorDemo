import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { useGameEngine } from './stores/useGameEngine';

// Dev-only handle for debugging / automated UI checks
if (import.meta.env.DEV) (window as any).__engine = useGameEngine;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
