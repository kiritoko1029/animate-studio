import { PageAssets } from './components/PageAssets';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { AnimateUIProvider } from '@animate-ui/react/provider';
import { InteractivePreview } from './components/InteractivePreview';
import type { PageDocument } from './model';
import './export-runtime.css';

export function mount(element: HTMLElement, document: PageDocument, assets: Record<string,string> = {}) {
  const root = createRoot(element);
  root.render(<MotionConfig reducedMotion="user"><AnimateUIProvider reducedMotion="user"><PageAssets.Provider value={assets}><InteractivePreview document={document} persistenceScope="published"/></PageAssets.Provider></AnimateUIProvider></MotionConfig>);
  return () => root.unmount();
}
