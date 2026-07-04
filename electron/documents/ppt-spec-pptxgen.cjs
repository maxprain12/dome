'use strict';

/**
 * JSON spec → PPTX via PptxGenJS (main process).
 * Mirrors legacy JSON spec layouts and theme names (formerly generate_ppt.py).
 */

const THEMES = {
  midnight_executive: {
    background: '#0F1419',
    title: '#FFFFFF',
    body: '#E6EDF3',
    accent: '#58A6FF',
  },
  forest_moss: {
    background: '#1A2F1A',
    title: '#E8F5E9',
    body: '#C8E6C9',
    accent: '#4CAF50',
  },
  ocean_gradient: {
    background: '#0D1B2A',
    title: '#FFFFFF',
    body: '#E0E1DD',
    accent: '#415A77',
  },
  sunset_warm: {
    background: '#2D1B0E',
    title: '#FFF8E7',
    body: '#FFE4C4',
    accent: '#E07C5C',
  },
  slate_minimal: {
    background: '#1E293B',
    title: '#F8FAFC',
    body: '#CBD5E1',
    accent: '#64748B',
  },
  emerald_pro: {
    background: '#022C22',
    title: '#ECFDF5',
    body: '#A7F3D0',
    accent: '#10B981',
  },
};

function hexNoHash(hex) {
  if (!hex || typeof hex !== 'string') return '000000';
  return hex.replace(/^#/, '');
}

function resolveThemeColors(spec) {
  const themeRaw = spec.theme;
  let themeName = '';
  let inlineColors = {};
  if (themeRaw && typeof themeRaw === 'object' && !Array.isArray(themeRaw)) {
    themeName = themeRaw.name || '';
    inlineColors = themeRaw.colors && typeof themeRaw.colors === 'object' ? themeRaw.colors : {};
  } else if (typeof themeRaw === 'string') {
    themeName = themeRaw;
  }
  const base = THEMES[themeName];
  if (base) return { ...base, ...inlineColors };
  if (Object.keys(inlineColors).length > 0) return { ...inlineColors };
  return {
    background: '#FFFFFF',
    title: '#000000',
    body: '#333333',
    accent: '#4472C4',
  };
}

function normalizeBullets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((b) => {
    if (b && typeof b === 'object' && 'text' in b) return String(b.text ?? '');
    return String(b ?? '');
  });
}

function applySlideBackground(slide, bgHex) {
  if (!bgHex) return;
  slide.background = { color: hexNoHash(bgHex) };
}

function renderTitleLayout(slide, slideSpec, themeColors) {
  slide.addText(String(slideSpec.title ?? ''), {
    x: 0.5,
    y: 1.8,
    w: 9,
    h: 1.2,
    fontSize: 44,
    bold: true,
    color: hexNoHash(themeColors.title),
  });
  slide.addText(String(slideSpec.subtitle ?? ''), {
    x: 0.5,
    y: 3.2,
    w: 9,
    h: 0.6,
    fontSize: 16,
    color: hexNoHash(themeColors.body),
  });
}

function renderContentLayout(slide, slideSpec, themeColors) {
  slide.addText(String(slideSpec.title ?? ''), {
    x: 0.35,
    y: 0.18,
    w: 9.3,
    h: 0.65,
    fontSize: 28,
    bold: true,
    color: hexNoHash(themeColors.title),
  });
  const bullets = normalizeBullets(slideSpec.bullets);
  if (bullets.length === 0) return;
  const runs = bullets.map((text, i) => ({
    text,
    options: {
      bullet: true,
      breakLine: i < bullets.length - 1,
    },
  }));
  slide.addText(runs, {
    x: 0.35,
    y: 1.1,
    w: 9.3,
    h: 3.8,
    fontSize: 15,
    color: hexNoHash(themeColors.body),
  });
}

function renderTitleOnlyLayout(slide, slideSpec, themeColors) {
  slide.addText(String(slideSpec.title ?? ''), {
    x: 0.5,
    y: 2,
    w: 9,
    h: 1.2,
    fontSize: 36,
    bold: true,
    color: hexNoHash(themeColors.title),
  });
}

function renderBlankLayout(slide, slideSpec, themeColors) {
  const boxes = Array.isArray(slideSpec.textboxes) ? slideSpec.textboxes : [];
  for (const tb of boxes) {
    if (!tb || typeof tb !== 'object') continue;
    slide.addText(String(tb.text ?? ''), {
      x: Number(tb.left ?? 1),
      y: Number(tb.top ?? 1),
      w: Number(tb.width ?? 8),
      h: Number(tb.height ?? 1),
      fontSize: 14,
      color: hexNoHash(themeColors.body),
    });
  }
}

const LAYOUT_RENDERERS = {
  title: renderTitleLayout,
  content: renderContentLayout,
  bullet: renderContentLayout,
  title_only: renderTitleOnlyLayout,
  blank: renderBlankLayout,
};

function renderSlideByLayout(pptx, slideSpec, themeColors) {
  const layoutName = typeof slideSpec.layout === 'string' ? slideSpec.layout : 'content';
  const slide = pptx.addSlide();
  applySlideBackground(slide, themeColors.background);
  const renderer = LAYOUT_RENDERERS[layoutName] || renderContentLayout;
  renderer(slide, slideSpec, themeColors);
}

async function writePptxBuffer(pptx) {
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}

function loadPptxGenLib() {
  try {
    return require('pptxgenjs');
  } catch (e) {
    return { __loadError: e };
  }
}

function buildCoverSlide(pptx, titleText, themeColors) {
  const slide = pptx.addSlide();
  applySlideBackground(slide, themeColors.background);
  slide.addText(String(titleText || 'Untitled'), {
    x: 0.5,
    y: 2,
    w: 9,
    h: 1.5,
    fontSize: 44,
    bold: true,
    color: hexNoHash(themeColors.title),
  });
  return slide;
}

function isValidSlideSpec(slideSpec) {
  return Boolean(slideSpec) && typeof slideSpec === 'object' && !Array.isArray(slideSpec);
}

function normalizeSpec(spec) {
  const specObj = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : {};
  return {
    specObj,
    themeColors: resolveThemeColors(specObj),
    slidesData: Array.isArray(specObj.slides) ? specObj.slides : [],
  };
}

function createPptxInstance(PptxGenJS, title) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = typeof title === 'string' ? title : 'Presentation';
  return pptx;
}

/**
 * @param {Record<string, unknown>} spec
 * @returns {Promise<{ success: boolean; buffer?: Buffer; error?: string }>}
 */
async function generatePptFromSpec(spec) {
  const PptxGenJS = loadPptxGenLib();
  if (PptxGenJS.__loadError) {
    return { success: false, error: `pptxgenjs: ${PptxGenJS.__loadError.message || PptxGenJS.__loadError}` };
  }

  const { specObj, themeColors, slidesData } = normalizeSpec(spec);

  try {
    const pptx = createPptxInstance(PptxGenJS, specObj.title);

    if (slidesData.length === 0) {
      buildCoverSlide(pptx, specObj.title, themeColors);
      const buffer = await writePptxBuffer(pptx);
      return { success: true, buffer };
    }

    for (const slideSpec of slidesData) {
      if (!isValidSlideSpec(slideSpec)) continue;
      renderSlideByLayout(pptx, slideSpec, themeColors);
    }

    const buffer = await writePptxBuffer(pptx);
    return { success: true, buffer };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

module.exports = {
  generatePptFromSpec,
  THEMES,
};
