import catalogCss from '../../catalog-blocks.css?raw';
import pageCss from '../../page.css?raw';
import libraryCss from '../../library-blocks.css?raw';
import portableCss from './portable.css?raw';
import landscape from '../../../public/landscape.svg?raw';
import type { StudioDocument } from '../../model';
import type { Format } from './generate';
import { generateNativeCode } from './native';

export const exportResources = { pageCss, libraryCss, portableCss, catalogCss, assets: { '/landscape.svg': `data:image/svg+xml;charset=utf-8,${encodeURIComponent(landscape)}` } };

export async function downloadCode(document: StudioDocument, format: Format, assets: Record<string, string> = {}) {
  const { default: bundle } = await import('virtual:animate-studio-native-export');
  const output = generateNativeCode(document, format, bundle, { ...exportResources.assets, ...assets });
  const url = URL.createObjectURL(new Blob([output.content], { type: output.mime }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = output.filename;
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Keep the blob alive until browsers have started reading the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
