import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { AnimateUIProvider } from '@animate-ui/react/provider';
import App from './App';
import './styles.css';
import './studio-ui.css';
import './studio-layout.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><MotionConfig reducedMotion="user"><AnimateUIProvider reducedMotion="user"><App /></AnimateUIProvider></MotionConfig></React.StrictMode>,
);
