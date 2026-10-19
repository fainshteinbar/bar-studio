// Live A4 preview inside an isolated frame (document.css never meets the app's CSS), scaled to fit.
import { renderDocument } from './document.js';

const A4 = { w: 794, h: 1123 }; // CSS px at 96 dpi

export function mountPreview(container) {
  container.classList.add('preview');
  container.innerHTML = '<div class="preview-scale"><iframe title="תצוגה מקדימה של המסמך" tabindex="-1"></iframe></div>';
  const scaleBox = container.firstElementChild;
  const frame = scaleBox.firstElementChild;
  frame.srcdoc = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
    <link rel="stylesheet" href="https://use.typekit.net/gce3kmw.css">
    <link rel="stylesheet" href="css/document.css">
    <style>html,body{margin:0;background:#fff;overflow:hidden}</style></head>
    <body><div id="sheet"></div></body></html>`;
  let pending = null;
  let ready = false;
  frame.addEventListener('load', () => { ready = true; if (pending) paint(pending); });

  function fit() {
    const scale = Math.min(1, container.clientWidth / A4.w);
    scaleBox.style.setProperty('--s', String(scale));
    container.style.blockSize = `${Math.ceil(frameHeight() * scale)}px`;
  }
  function frameHeight() {
    const sheet = ready && frame.contentDocument?.querySelector('.doc');
    return Math.max(A4.h, sheet ? sheet.scrollHeight : A4.h);
  }
  function paint(doc) {
    frame.contentDocument.getElementById('sheet').innerHTML = renderDocument(doc, { assets: 'assets/' });
    frame.style.blockSize = `${frameHeight()}px`;
    fit();
  }
  const ro = new ResizeObserver(fit);
  ro.observe(container);
  fit();

  return {
    update(doc) { pending = doc; if (ready) paint(doc); },
    destroy() { ro.disconnect(); },
  };
}
