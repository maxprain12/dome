import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { Button, buttonVariants } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import ManyAvatar from "@/components/many/ManyAvatar";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Download04Icon,
  LinkSquare01Icon,
  ArrowUpRight01Icon,
  Folder01Icon,
  BookOpen01Icon,
} from "@hugeicons/core-free-icons";
import Artboard from "./Scenes";
import {
  choices,
  readSettings,
  sceneSize,
  sceneParams,
  sceneFilename,
} from "./settings";
import type { Settings } from "./settings";
import "@/globals.css";
import "./studio.css";

const initial = readSettings(new URLSearchParams(location.search));
const capture = new URLSearchParams(location.search).get("capture") === "1";

function applyTheme(settings: Settings) {
  document.documentElement.classList.toggle("dark", settings.theme === "dark");
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.lang = settings.language;
  document.documentElement.classList.toggle("vs-capture", capture);
}
applyTheme(initial);

function OptionGroup({
  name,
  settings,
  onChange,
}: {
  name: keyof Settings;
  settings: Settings;
  onChange: (name: keyof Settings, value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="vs-option">
      <legend>
        {t(`visualStudio.${name === "theme" ? "appearance" : name}`)}
      </legend>
      <ToggleGroup
        value={[settings[name]]}
        onValueChange={(values) => {
          if (values[0]) onChange(name, String(values[0]));
        }}
        variant="outline"
        size="sm"
        className="flex-wrap"
      >
        {choices[name].map((value) => (
          <ToggleGroupItem
            key={value}
            value={value}
            aria-label={
              name === "language"
                ? value.toUpperCase()
                : t(`visualStudio.${value}`)
            }
          >
            {name === "language"
              ? value.toUpperCase()
              : t(`visualStudio.${value}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </fieldset>
  );
}

function Preview({ settings }: { settings: Settings }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.65);
  const { width, height } = sceneSize(settings);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(Math.min(1, entry.contentRect.width / width)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div className="vs-preview-host" ref={host}>
      <div
        className="vs-preview-size"
        style={{ height: height * scale, width: width * scale }}
      >
        <div
          className="vs-preview-scale"
          style={{ transform: `scale(${scale})` }}
        >
          <Artboard settings={settings} />
        </div>
      </div>
    </div>
  );
}

function Studio() {
  const [settings, setSettings] = useState(initial);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("");
  const { t } = useTranslation();
  const copy = (key: string) => t(`visualStudio.${key}`);
  useEffect(() => {
    applyTheme(settings);
    void i18n.changeLanguage(settings.language);
    const params = sceneParams(settings);
    if (capture) params.set("capture", "1");
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, [settings]);
  const update = (name: keyof Settings, value: string) => {
    setSettings((current) =>
      readSettings(new URLSearchParams({ ...current, [name]: value })),
    );
    setStatus("");
  };
  const exportImage = async () => {
    setExporting(true);
    setStatus("");
    try {
      const response = await fetch(
        `/__visual-studio/export?${sceneParams(settings)}`,
        { method: "POST" },
      );
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("image/png")
      )
        throw new Error("Export unavailable");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = sceneFilename(settings);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("exported");
    } catch {
      setStatus("exportError");
    } finally {
      setExporting(false);
    }
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setStatus("copied");
    } catch {
      setStatus("copyError");
    }
  };
  if (capture) return <Artboard settings={settings} />;
  const size = sceneSize(settings);
  return (
    <div className="vs-workbench">
      <aside className="vs-controls">
        <a href="/visual-studio.html" className="vs-brand">
          <ManyAvatar size="lg" />
          <span>
            <strong>Dome</strong>
            <small>Visual Studio</small>
          </span>
        </a>
        <p className="vs-section-label">{copy("scenes")}</p>
        <nav aria-label={copy("scenes")} className="vs-scene-nav">
          {choices.scene.map((scene, index) => (
            <Button
              key={scene}
              variant={settings.scene === scene ? "secondary" : "ghost"}
              className="justify-start"
              aria-current={settings.scene === scene ? "page" : undefined}
              onClick={() => update("scene", scene)}
            >
              <span className="vs-scene-number">0{index + 1}</span>
              {scene === "many" ? (
                <ManyAvatar size="sm" />
              ) : (
                <HugeiconsIcon
                  icon={scene === "library" ? Folder01Icon : BookOpen01Icon}
                />
              )}
              <span>{copy(scene)}</span>
            </Button>
          ))}
        </nav>
        <div className="vs-options">
          {(["format", "theme", "language", "state"] as const).map((name) => (
            <OptionGroup
              key={name}
              name={name}
              settings={settings}
              onChange={update}
            />
          ))}
          {settings.format === "composition" && (
            <OptionGroup name="ratio" settings={settings} onChange={update} />
          )}
        </div>
        <div className="vs-controls-footer">
          <p>{copy("mockNote")}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSettings({ ...initial, scene: settings.scene });
              setStatus("");
            }}
          >
            {copy("reset")}
          </Button>
        </div>
      </aside>
      <main className="vs-workspace">
        <header className="vs-workspace-header">
          <div>
            <span className="vs-section-label">{copy("gallery")}</span>
            <h1>{copy("intro")}</h1>
            <p>{copy("description")}</p>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label={copy("copyLink")}
            title={copy("copyLink")}
            onClick={copyLink}
          >
            <HugeiconsIcon icon={LinkSquare01Icon} />
          </Button>
        </header>
        <div className="vs-canvas-toolbar">
          <div>
            <strong>{copy(settings.scene)}</strong>
            <span>
              {copy(settings.format)} · {size.width} × {size.height}
            </span>
          </div>
          <a
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            href={`/visual-studio.html?${sceneParams(settings)}&capture=1`}
            target="_blank"
            rel="noreferrer"
          >
            {copy("open")}
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
          </a>
        </div>
        <Preview settings={settings} />
        <footer className="vs-export-bar">
          <div>
            <p>{copy("exportNote")}</p>
            <p
              role="status"
              className={status.endsWith("Error") ? "vs-error" : "vs-status"}
            >
              {status
                ? copy(status)
                : `${size.width * 2} × ${size.height * 2} px`}
            </p>
          </div>
          <Button onClick={exportImage} disabled={exporting}>
            <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />
            {copy(exporting ? "exporting" : "export")}
          </Button>
        </footer>
      </main>
    </div>
  );
}

void i18n.changeLanguage(initial.language).then(() => {
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <TooltipProvider>
        <Studio />
      </TooltipProvider>
    </React.StrictMode>,
  );
});
