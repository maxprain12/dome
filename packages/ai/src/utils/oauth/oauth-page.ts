/** Official product site (not dome.so). */
const DOME_SITE_URL = "https://dome.dowi.es";

/** Deep link back into the Dome desktop app (AI settings). */
const DOME_APP_BACKLINK = "dome://settings/ai";

/**
 * Many brand mark — exact asset from assets/many.svg (not invented).
 */
const MANY_SVG = `<svg width="72" height="72" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img">
<rect width="500" height="500" rx="250" fill="white"/>
<path d="M328.634 306.098V235.894C328.634 182.087 286.288 138.468 234.051 138.468C181.814 138.468 139.467 182.087 139.467 235.894V306.098C139.467 318.605 152.245 326.74 163.106 321.146C171.884 316.625 182.34 317.296 190.506 322.903C199.692 329.212 211.659 329.212 220.846 322.903L224.181 320.613C230.158 316.509 237.944 316.509 243.92 320.613L247.256 322.903C256.442 329.212 268.409 329.212 277.596 322.903C285.761 317.296 296.218 316.625 304.996 321.146C315.856 326.74 328.634 318.605 328.634 306.098Z" fill="#E0EAB4"/>
<path d="M288.333 235.312C288.333 243.148 284.099 249.5 278.875 249.5C273.651 249.5 269.417 243.148 269.417 235.312C269.417 227.477 273.651 221.125 278.875 221.125C284.099 221.125 288.333 227.477 288.333 235.312Z" fill="#596037"/>
<ellipse cx="222.125" cy="235.312" rx="9.45833" ry="14.1875" fill="#596037"/>
<path d="M345.083 322.547V252.343C345.083 198.536 302.737 154.917 250.5 154.917C198.263 154.917 155.917 198.536 155.917 252.343V322.547C155.917 335.054 168.695 343.189 179.555 337.595C188.333 333.075 198.789 333.745 206.955 339.353C216.141 345.661 228.109 345.661 237.295 339.353L240.63 337.062C246.607 332.958 254.393 332.958 260.37 337.062L263.705 339.353C272.891 345.661 284.859 345.661 294.045 339.353C302.211 333.745 312.667 333.075 321.445 337.595C332.305 343.189 345.083 335.054 345.083 322.547Z" stroke="#596037" stroke-width="7.59957"/>
</svg>`;

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function renderPage(options: {
	title: string;
	heading: string;
	message: string;
	details?: string;
	/** Offer deep-link back to the Dome app (success pages). */
	backToApp?: boolean;
}): string {
	const title = escapeHtml(options.title);
	const heading = escapeHtml(options.heading);
	const message = escapeHtml(options.message);
	const details = options.details ? escapeHtml(options.details) : undefined;
	const appLink = escapeHtml(DOME_APP_BACKLINK);
	const siteUrl = escapeHtml(DOME_SITE_URL);

	const backToAppBlock = options.backToApp
		? `
    <p class="cta-wrap">
      <a class="cta" href="${appLink}">Back to Dome</a>
    </p>
    <p class="hint">This opens the Dome desktop app (Settings → AI).</p>
    <p class="site"><a href="${siteUrl}">${siteUrl.replace(/^https:\/\//, "")}</a></p>
    <script>
      (function () {
        var appUrl = ${JSON.stringify(DOME_APP_BACKLINK)};
        setTimeout(function () {
          try { window.location.href = appUrl; } catch (e) {}
        }, 800);
      })();
    </script>`
		: "";

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      --ink: #1A1A1A;
      --muted: #8C8C8C;
      --bg: #F2F2F2;
      --card: #FFFFFF;
      --primary: #4A5D3F;
      --primary-hover: #5E7153;
      --mint: #EEF5E0;
      --lime: #DDE9B2;
      --border: #D9D9D9;
      --font: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; }
    html { color-scheme: light; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background:
        radial-gradient(ellipse 90% 60% at 50% -10%, #DDE9B2 0%, transparent 55%),
        var(--bg);
      color: var(--ink);
      font-family: var(--font);
      text-align: center;
    }
    main {
      width: 100%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 36px 28px 28px;
      border-radius: 24px;
      background: var(--card);
      border: 1px solid var(--border);
      box-shadow: 0 12px 40px rgba(26, 26, 26, 0.06);
    }
    .logo {
      width: 72px;
      height: 72px;
      margin-bottom: 16px;
      border-radius: 50%;
      overflow: hidden;
      box-shadow: 0 0 0 1px var(--border);
    }
    .logo svg { display: block; width: 72px; height: 72px; }
    .brand {
      margin: 0 0 16px;
      font-size: 12px;
      font-weight: 650;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--primary);
    }
    h1 {
      margin: 0 0 10px;
      font-size: 26px;
      line-height: 1.2;
      font-weight: 700;
      color: var(--ink);
    }
    p {
      margin: 0;
      line-height: 1.6;
      color: var(--muted);
      font-size: 15px;
    }
    .details {
      margin-top: 14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      color: var(--muted);
      white-space: pre-wrap;
      word-break: break-word;
      text-align: left;
      width: 100%;
    }
    .cta-wrap { margin-top: 24px; width: 100%; }
    a.cta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 44px;
      padding: 0 20px;
      border-radius: 999px;
      background: var(--primary);
      color: #fff;
      font-weight: 600;
      font-size: 15px;
      text-decoration: none;
    }
    a.cta:hover { background: var(--primary-hover); }
    .hint {
      margin-top: 12px;
      font-size: 13px;
      color: var(--muted);
    }
    .site {
      margin-top: 18px;
      font-size: 13px;
    }
    .site a {
      color: var(--primary);
      font-weight: 600;
      text-decoration: none;
    }
    .site a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <main>
    <div class="logo">${MANY_SVG}</div>
    <p class="brand">Dome</p>
    <h1>${heading}</h1>
    <p>${message}</p>
    ${details ? `<div class="details">${details}</div>` : ""}
    ${backToAppBlock}
  </main>
</body>
</html>`;
}

export function oauthSuccessHtml(message: string): string {
	return renderPage({
		title: "Dome — Authentication successful",
		heading: "You're connected",
		message,
		backToApp: true,
	});
}

export function oauthErrorHtml(message: string, details?: string): string {
	return renderPage({
		title: "Dome — Authentication failed",
		heading: "Authentication failed",
		message,
		details,
		backToApp: false,
	});
}
