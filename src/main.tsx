import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { AnimateUIProvider } from '@animate-ui/react/provider';
import App from './App';
import { AccountProvider } from './components/AccountProvider';
import { SharedPage } from './components/SharedPage';
import { SharedComponentPage } from './components/custom/SharedComponentPage';
import './styles.css';
import './studio-ui.css';
import './studio-layout.css';

const sharedMatch = window.location.pathname.match(/^\/p\/([^/]+)\/?$/);
const sharedComponentMatch = window.location.pathname.match(/^\/c\/([^/]+)\/?$/);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><MotionConfig reducedMotion="user"><AnimateUIProvider reducedMotion="user">{sharedMatch ? <SharedPage token={sharedMatch[1]}/> : <AccountProvider>{sharedComponentMatch ? <SharedComponentPage token={sharedComponentMatch[1]}/> : <App />}</AccountProvider>}</AnimateUIProvider></MotionConfig></React.StrictMode>,
);
