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

/**
 * @param {Record<string, unknown>} spec
 * @returns {Promise<{ success: boolean; buffer?: Buffer; error?: string }>}
 */
async function generatePptFromSpec(spec) {
  let PptxGenJS;
  try {
    PptxGenJS = require('pptxgenjs');
  } catch (e) {
    return { success: false, error: `pptxgenjs: ${e.message || e}` };
  }

  const specObj = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : {};
  const themeColors = resolveThemeColors(specObj);
  const slidesData = Array.isArray(specObj.slides) ? specObj.slides : [];

  try {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.title = typeof specObj.title === 'string' ? specObj.title : 'Presentation';

    if (slidesData.length === 0) {
      const slide = pptx.addSlide();
      applySlideBackground(slide, themeColors.background);
      slide.addText(String(specObj.title || 'Untitled'), {
        x: 0.5,
        y: 2,
        w: 9,
        h: 1.5,
        fontSize: 44,
        bold: true,
        color: hexNoHash(themeColors.title),
      });
      const out = await pptx.write({ outputType: 'nodebuffer' });
      const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out);
      return { success: true, buffer };
    }

    for (const slideSpec of slidesData) {
      if (!slideSpec || typeof slideSpec !== 'object' || Array.isArray(slideSpec)) continue;
      const layoutName = typeof slideSpec.layout === 'string' ? slideSpec.layout : 'content';
      const slide = pptx.addSlide();
      applySlideBackground(slide, themeColors.background);

      if (layoutName === 'title') {
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
      } else if (layoutName === 'content' || layoutName === 'bullet') {
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
        if (bullets.length > 0) {
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
      } else if (layoutName === 'title_only') {
        slide.addText(String(slideSpec.title ?? ''), {
          x: 0.5,
          y: 2,
          w: 9,
          h: 1.2,
          fontSize: 36,
          bold: true,
          color: hexNoHash(themeColors.title),
        });
      } else if (layoutName === 'blank') {
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
    }

    const out = await pptx.write({ outputType: 'nodebuffer' });
    const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out);
    return { success: true, buffer };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

module.exports = {
  generatePptFromSpec,
  THEMES,
};
