import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Home01Icon,
  Folder01Icon,
  Calendar03Icon,
  LinkSquare01Icon,
  Settings01Icon,
  BookOpen01Icon,
  Search01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import ResourceIcon from "@/components/shared/ResourceIcon";
import ManyAvatar from "@/components/many/ManyAvatar";
import ManyComposerSurface from "@/components/many/composer/ManyComposerSurface";
import ManyConversationSurface from "@/components/many/conversation/ManyConversationSurface";
import LearnDeckCard from "@/components/learn/library/LearnDeckCard";
import type { Scene, Settings } from "./settings";
import { sceneSize } from "./settings";

const noAction = () => undefined;
const resources = [
  { key: "file1", type: "pdf", meta: "PDF · 24 pp." },
  { key: "file2", type: "note", meta: "8 min" },
  { key: "file3", type: "note", meta: "Markdown" },
  { key: "file4", type: "note", meta: "6 min" },
];
function useCopy() {
  const { t } = useTranslation();
  return (key: string) => t(`visualStudio.${key}`);
}

export function SourceList({ compact = false }: { compact?: boolean }) {
  const t = useCopy();
  return (
    <div className={`vs-sources ${compact ? "vs-sources-compact" : ""}`}>
      {resources.slice(0, compact ? 3 : 4).map((item, i) => (
        <div className="vs-source" key={item.key}>
          <span className={`vs-file-icon vs-tone-${i % 3}`}>
            <ResourceIcon type={item.type} size={22} />
          </span>
          <div>
            <strong>{t(item.key)}</strong>
            <small>{item.meta}</small>
          </div>
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
        </div>
      ))}
    </div>
  );
}

function Document() {
  const t = useCopy();
  return (
    <article className="vs-document">
      <div className="vs-document-cover">
        <span>ATLAS</span>
        <p>{t("docSubtitle")}</p>
        <h2>{t("docTitle")}</h2>
        <div className="vs-book-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="vs-document-body">
        <small>{t("chapter")}</small>
        <h3>{t("docHeading")}</h3>
        <p>{t("docBody")}</p>
        <blockquote>{t("docQuote")}</blockquote>
      </div>
    </article>
  );
}

function Library({ alternate }: { alternate: boolean }) {
  const t = useCopy();
  if (alternate)
    return (
      <div className="vs-document-view">
        <div className="vs-panel-heading">
          <ResourceIcon type="pdf" />
          <strong>{t("file1")}</strong>
          <Badge variant="mint">{t("read")}</Badge>
        </div>
        <Document />
      </div>
    );
  return (
    <div className="vs-library">
      <div className="vs-panel-heading">
        <span>{t("projects")}</span>
        <span>/</span>
        <strong>Atlas</strong>
        <HugeiconsIcon icon={Search01Icon} size={18} />
      </div>
      <div className="vs-project-cover">
        <span>ATLAS</span>
        <div className="vs-project-lines" aria-hidden="true" />
      </div>
      <div className="vs-library-body">
        <Badge variant="lime">{t("sources")}</Badge>
        <h2>{t("collection")}</h2>
        <p>{t("collectionDescription")}</p>
        <div className="vs-file-heading">
          <strong>{t("all")}</strong>
          <span>{t("updated")}</span>
        </div>
        <SourceList />
      </div>
    </div>
  );
}

function Composer({ alternate = false }: { alternate?: boolean }) {
  const t = useCopy();
  return (
    <ManyComposerSurface
      value={t(alternate ? "followup" : "prompt")}
      onValueChange={noAction}
      onSend={noAction}
      onStop={noAction}
      onFiles={noAction}
      onRemoveImage={noAction}
      onRemovePin={noAction}
      images={[]}
      pins={[{ id: "atlas", title: "Atlas", type: "project" }]}
      placeholder={t("ask")}
      sendLabel={t("send")}
      stopLabel={t("stop")}
      attachLabel={t("attach")}
      removeLabel={t("remove")}
      isLoading={false}
      controls={<Badge variant="outline">Dome</Badge>}
    />
  );
}

function Answer({ alternate }: { alternate: boolean }) {
  const t = useCopy();
  return (
    <div className="vs-answer">
      <p>{t("answerIntro")}</p>
      <ol>
        {[1, 2, 3].map((n) => (
          <li key={n}>
            <span>{t(`idea${n}`)}</span>
            <Badge variant="outline">{n}</Badge>
          </li>
        ))}
      </ol>
      <div className="vs-citations">
        <ResourceIcon type="pdf" />
        <span>{t("file1")}</span>
        <Badge variant="mint">{t("sources")}</Badge>
      </div>
      {alternate && (
        <div className="vs-answer-result">
          <p>{t("result")}</p>
          <DeckCard />
        </div>
      )}
    </div>
  );
}

function Many({ alternate }: { alternate: boolean }) {
  const t = useCopy();
  return (
    <section className="vs-many">
      <div className="vs-panel-heading">
        <ManyAvatar size="md" />
        <div>
          <strong>Many</strong>
          <small>{t("project")}</small>
        </div>
        <Badge variant="mint">{t("sources")}</Badge>
      </div>
      <ManyConversationSurface
        threadId={`atlas-${alternate}`}
        messages={[
          { id: "question", role: "user", text: t("prompt") },
          { id: "answer", role: "assistant", text: t("answerIntro") },
        ]}
        ariaLabel={t("many")}
        emptyState={null}
        reasoningLabel={t("reasoning")}
        toolsLabel={t("actions")}
        imageLabel={t("image")}
        renderAssistant={() => <Answer alternate={alternate} />}
      />
      <Composer alternate={alternate} />
    </section>
  );
}

function DeckCard() {
  const t = useCopy();
  return (
    <LearnDeckCard
      item={{
        id: "atlas-learning",
        kind: "flashcard_deck",
        title: t("deckTitle"),
        type: "flashcards",
        count: 12,
        mastery: 68,
        dueCount: 4,
        createdAt: 1789516800000,
        updatedAt: 1789516800000,
        glyph: "Atlas",
      }}
      onOpen={noAction}
    />
  );
}

function Flashcard({ alternate }: { alternate: boolean }) {
  const t = useCopy();
  return (
    <Card className="vs-flashcard" variant={alternate ? "mint" : "default"}>
      <CardHeader>
        <div className="vs-card-meta">
          <Badge variant={alternate ? "mint" : "lavender"}>
            {t(alternate ? "answerLabel" : "questionLabel")}
          </Badge>
          <span>04 / 12</span>
        </div>
        <CardDescription>{t("deckTitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <h3>{t(alternate ? "answer" : "question")}</h3>
      </CardContent>
      <CardFooter>
        <ResourceIcon type="pdf" />
        <span>{t("docTitle")}</span>
      </CardFooter>
    </Card>
  );
}

function Study({ alternate }: { alternate: boolean }) {
  const t = useCopy();
  return (
    <section className="vs-study">
      <div className="vs-panel-heading">
        <HugeiconsIcon icon={BookOpen01Icon} size={20} />
        <strong>{t("study")}</strong>
        <Badge variant="lavender">Atlas</Badge>
      </div>
      <div className="vs-study-content">
        <div>
          <small>{t("ready")}</small>
          <h2>{t("learning")}</h2>
          <p>{t("learningSub")}</p>
        </div>
        <div className="vs-study-grid">
          <div className="vs-deck-column">
            <DeckCard />
            <Card variant="lavender">
              <CardHeader>
                <CardTitle>{t("sources")}</CardTitle>
              </CardHeader>
              <CardContent>
                <SourceList compact />
              </CardContent>
            </Card>
          </div>
          <div className="vs-flash-column">
            <div className="vs-progress">
              <span>04 / 12</span>
              <Progress value={33} aria-label={t("progress")} />
            </div>
            <Flashcard alternate={alternate} />
            <div className="vs-review-actions">
              {alternate ? (
                ["again", "good", "easy"].map((key) => (
                  <Button
                    key={key}
                    variant={key === "good" ? "default" : "outline"}
                  >
                    {t(key)}
                  </Button>
                ))
              ) : (
                <Button>{t("reveal")}</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WindowFrame({
  scene,
  children,
}: {
  scene: Scene;
  children: ReactNode;
}) {
  const t = useCopy();
  const nav = [
    { key: "home", icon: Home01Icon },
    { key: "projects", icon: Folder01Icon },
    { key: "calendar", icon: Calendar03Icon },
    { key: "connections", icon: LinkSquare01Icon },
  ];
  return (
    <div className="vs-window">
      <div className="vs-window-bar">
        <div className="vs-window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span>Dome</span>
        <span>{t("project")}</span>
      </div>
      <div className="vs-window-body">
        <aside className="vs-app-sidebar">
          <div className="vs-sidebar-label">{t("workspace")}</div>
          {nav.map(({ key, icon }) => (
            <div
              className={`vs-nav-row ${key === "projects" && scene === "library" ? "vs-selected" : ""}`}
              key={key}
            >
              <HugeiconsIcon icon={icon} size={18} />
              {t(key)}
            </div>
          ))}
          <div
            className={`vs-nav-row ${scene === "many" ? "vs-selected" : ""}`}
          >
            <ManyAvatar size="sm" />
            Many
          </div>
          <div className="vs-sidebar-label">{t("files")}</div>
          <div className="vs-nav-row">
            <HugeiconsIcon icon={Folder01Icon} size={18} />
            Atlas
          </div>
          {resources.slice(0, 3).map((r) => (
            <div className="vs-nav-row vs-file-nav" key={r.key}>
              <ResourceIcon type={r.type} />
              <span>{t(r.key)}</span>
            </div>
          ))}
          <div className="vs-nav-bottom">
            <div
              className={`vs-nav-row ${scene === "study" ? "vs-selected" : ""}`}
            >
              <HugeiconsIcon icon={BookOpen01Icon} size={18} />
              {t("study")}
            </div>
            <div className="vs-nav-row">
              <HugeiconsIcon icon={Settings01Icon} size={18} />
              {t("settings")}
            </div>
          </div>
        </aside>
        <div className="vs-window-main">{children}</div>
      </div>
    </div>
  );
}

function SceneContent({ settings }: { settings: Settings }) {
  const alternate = settings.state === "alternate";
  if (settings.scene === "library") return <Library alternate={alternate} />;
  if (settings.scene === "many") return <Many alternate={alternate} />;
  return <Study alternate={alternate} />;
}

function FloatingDetail({ settings }: { settings: Settings }) {
  const t = useCopy();
  if (settings.scene === "many")
    return (
      <div className="vs-floating-composer">
        <Composer alternate={settings.state === "alternate"} />
      </div>
    );
  if (settings.scene === "study")
    return <Flashcard alternate={settings.state === "alternate"} />;
  return (
    <Card className="vs-library-detail">
      <CardHeader>
        <CardTitle>{t("context")}</CardTitle>
        <CardDescription>{t("project")}</CardDescription>
      </CardHeader>
      <CardContent>
        <SourceList compact />
      </CardContent>
      <CardFooter>
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} />
        <span>{t("sources")}</span>
      </CardFooter>
    </Card>
  );
}

export default function Artboard({ settings }: { settings: Settings }) {
  const t = useCopy();
  const size = sceneSize(settings);
  return (
    <div
      data-artboard
      data-artboard-ready="true"
      className={`vs-artboard vs-${settings.format} vs-${settings.scene} vs-${settings.ratio}`}
      style={{ width: size.width, height: size.height }}
      ref={(node) => node?.setAttribute("inert", "")}
    >
      {settings.format === "composition" && (
        <header className="vs-scene-copy">
          <span>Dome / {t(settings.scene)}</span>
          <h1>{t(`${settings.scene}Title`)}</h1>
          <p>{t(`${settings.scene}Description`)}</p>
        </header>
      )}
      {settings.format !== "detail" && (
        <div className="vs-scene-window">
          <WindowFrame scene={settings.scene}>
            <SceneContent settings={settings} />
          </WindowFrame>
        </div>
      )}
      {settings.format !== "screen" && (
        <div className="vs-floating">
          <FloatingDetail settings={settings} />
        </div>
      )}
    </div>
  );
}
