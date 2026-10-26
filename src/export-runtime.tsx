import { PageAssets } from './components/PageAssets';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { AnimateUIProvider } from '@animate-ui/react/provider';
import { SitePreview } from './components/SitePreview';
import { InteractivePreview } from './components/InteractivePreview';
import { isSiteDocument } from '../shared/site-document.mjs';
import type { StudioDocument } from './model';
import './export-runtime.css';

export function mount(element: HTMLElement, document: StudioDocument, assets: Record<string,string> = {}) {
  const root = createRoot(element);
  root.render(<MotionConfig reducedMotion="user"><AnimateUIProvider reducedMotion="user"><PageAssets.Provider value={assets}>{isSiteDocument(document) ? <SitePreview document={document} mode="export" persistenceScope="published"/> : <InteractivePreview document={document} persistenceScope="published"/>}</PageAssets.Provider></AnimateUIProvider></MotionConfig>);
  return () => root.unmount();
}
