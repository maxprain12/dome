export const choices = {
  scene: ["library", "many", "study"],
  format: ["composition", "screen", "detail"],
  theme: ["light", "dark"],
  language: ["es", "en", "fr", "pt"],
  state: ["primary", "alternate"],
  ratio: ["landscape", "portrait"],
} as const;
export type Settings = {
  [K in keyof typeof choices]: (typeof choices)[K][number];
};
export type Scene = Settings["scene"];
export function readSettings(params: URLSearchParams): Settings {
  const result = {} as Settings;
  for (const key of Object.keys(choices) as (keyof Settings)[]) {
    const values: readonly string[] = choices[key];
    Object.assign(result, {
      [key]: values.includes(params.get(key) ?? "")
        ? params.get(key)
        : values[0],
    });
  }
  return result;
}
export function sceneSize(settings: Settings) {
  if (settings.format === "detail") return { width: 960, height: 720 };
  if (settings.format === "screen") return { width: 1440, height: 960 };
  return settings.ratio === "portrait"
    ? { width: 1000, height: 1250 }
    : { width: 1440, height: 1040 };
}
export function sceneParams(settings: Settings) {
  return new URLSearchParams(settings);
}
export function sceneFilename(settings: Settings) {
  return `dome-${settings.scene}-${settings.format}-${settings.theme}-${settings.language}-${settings.state}-${settings.ratio}.png`;
}
