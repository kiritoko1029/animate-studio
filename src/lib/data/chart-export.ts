export type ChartExportFormat = 'svg' | 'png';

function fileName(title: string, extension: string) {
  const name = title.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `${name || '数据图表'}.${extension}`;
}

export function chartSvgSource(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const sourceNodes = [svg, ...svg.querySelectorAll('*')];
  const cloneNodes = [clone, ...clone.querySelectorAll('*')];
  const properties = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'color', 'font-family', 'font-size', 'font-weight', 'text-anchor'];
  sourceNodes.forEach((node, index) => {
    const computed = getComputedStyle(node as Element), target = cloneNodes[index] as SVGElement;
    target.removeAttribute('class');
    target.removeAttribute('fill'); target.removeAttribute('stroke');
    for (const property of properties) target.style.setProperty(property, computed.getPropertyValue(property));
  });
  const box = svg.viewBox.baseVal;
  const width = box?.width || svg.clientWidth || 800, height = box?.height || svg.clientHeight || 400;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
  clone.setAttribute('role', 'img');
  const background = svg.closest('.chart-widget');
  const backgroundColor = background ? getComputedStyle(background).backgroundColor : '';
  if (backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(backgroundColor)) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100%'); rect.setAttribute('height', '100%'); rect.setAttribute('fill', backgroundColor);
    clone.insertBefore(rect, clone.firstChild);
  }
  return { source: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`, width, height };
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.style.display = 'none';
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function rasterize(blob: Blob, width: number, height: number) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('图表图像暂时无法读取，请重试。')); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * 2)); canvas.height = Math.max(1, Math.round(height * 2));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法生成 PNG，请改用 SVG 导出。');
    context.scale(2, 2); context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG 生成失败，请改用 SVG 导出。')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export async function downloadChart(svg: SVGSVGElement, format: ChartExportFormat, title = '数据图表') {
  const { source, width, height } = chartSvgSource(svg);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'svg') { download(blob, fileName(title, 'svg')); return; }
  download(await rasterize(blob, width, height), fileName(title, 'png'));
}
