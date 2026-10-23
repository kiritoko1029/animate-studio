import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { AnimateUIProvider } from '@animate-ui/react/provider';
import App from './App';
import { AccountProvider } from './components/AccountProvider';
import { SharedPage } from './components/SharedPage';
import './styles.css';
import './studio-ui.css';
import './studio-layout.css';

const sharedMatch = window.location.pathname.match(/^\/p\/([^/]+)\/?$/);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><MotionConfig reducedMotion="user"><AnimateUIProvider reducedMotion="user">{sharedMatch ? <SharedPage token={sharedMatch[1]}/> : <AccountProvider><App /></AccountProvider>}</AnimateUIProvider></MotionConfig></React.StrictMode>,
);
