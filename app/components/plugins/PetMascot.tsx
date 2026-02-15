'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMartinStore } from '@/lib/store/useMartinStore';
import type { DomePluginInfo } from '@/types/plugin';

interface PetMascotProps {
  plugin: DomePluginInfo & { sprites?: Record<string, string | string[]> };
}

const SPRITE_SIZE = 48;
const MOVE_INTERVAL_MS = 3000;
const WALK_FRAME_MS = 200;

export default function PetMascot({ plugin }: PetMascotProps) {
  const { toggleOpen, setPetPromptOverride, status } = useMartinStore();
  const [spriteUrls, setSpriteUrls] = useState<{
    idle?: string;
    walk?: string[];
    wave?: string;
    think?: string;
  }>({});
  const [prompt, setPrompt] = useState<string>('');
  const [loaded, setLoaded] = useState(false);
  const [position, setPosition] = useState({ x: 100, y: 150 });
  const [currentSprite, setCurrentSprite] = useState<'idle' | 'walk' | 'wave' | 'think'>('idle');
  const [walkFrame, setWalkFrame] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load assets from plugin
  useEffect(() => {
    const loadAssets = async () => {
      const readAsset = window.electron?.plugins?.readAsset;
      if (!readAsset) return;

      const sprites = plugin.sprites;
      if (!sprites) {
        setLoaded(true);
        return;
      }

      try {
        const results: typeof spriteUrls = {};
        const walkPaths = Array.isArray(sprites.walk) ? sprites.walk : sprites.walk ? [sprites.walk] : [];
        const toLoad = [
          ['idle', typeof sprites.idle === 'string' ? sprites.idle : null],
          ['wave', typeof sprites.wave === 'string' ? sprites.wave : null],
          ['think', typeof sprites.think === 'string' ? sprites.think : null],
          ...walkPaths.map((p, i) => [`walk-${i}`, p] as const),
        ].filter(([, p]) => p);

        for (const [key, path] of toLoad) {
          if (key == null || path == null) continue;
          const r = await readAsset(plugin.id, path);
          if (r?.success && r.dataUrl) {
            if (key.startsWith('walk-')) {
              const idx = parseInt(key.split('-')[1] ?? '0', 10);
              results.walk = results.walk || [];
              results.walk[idx] = r.dataUrl;
            } else {
              (results as Record<string, string>)[key] = r.dataUrl;
            }
          }
        }

        setSpriteUrls(results);

        const promptRes = await readAsset(plugin.id, 'prompt.txt');
        if (promptRes?.success && promptRes.text) {
          setPrompt(promptRes.text);
        }
      } catch (e) {
        console.warn('[PetMascot] Failed to load assets:', e);
      } finally {
        setLoaded(true);
      }
    };

    loadAssets();
  }, [plugin.id, plugin.sprites]);

  // Navigation: move randomly within the main content area
  useEffect(() => {
    if (!loaded || !containerRef.current) return;

    const moveToRandomPosition = () => {
      const main = document.querySelector('main');
      if (!main) return;

      const rect = main.getBoundingClientRect();
      const padding = 60;
      const maxX = Math.max(rect.width - SPRITE_SIZE - padding, padding);
      const maxY = Math.max(rect.height - SPRITE_SIZE - padding, padding);
      const minX = padding;
      const minY = padding;

      setPosition({
        x: minX + Math.random() * (maxX - minX),
        y: minY + Math.random() * (maxY - minY),
      });
      setCurrentSprite('walk');
      setWalkFrame(0);

      walkTimerRef.current = setTimeout(() => {
        setCurrentSprite('idle');
      }, 800);
    };

    moveTimerRef.current = setInterval(moveToRandomPosition, MOVE_INTERVAL_MS);
    moveToRandomPosition();

    return () => {
      if (moveTimerRef.current) clearInterval(moveTimerRef.current);
      if (walkTimerRef.current) clearTimeout(walkTimerRef.current);
    };
  }, [loaded]);

  // Walk animation frames
  useEffect(() => {
    if (currentSprite !== 'walk' || !spriteUrls.walk?.length) return;

    walkTimerRef.current = setInterval(() => {
      setWalkFrame((f) => (f + 1) % spriteUrls.walk!.length);
    }, WALK_FRAME_MS);

    return () => {
      if (walkTimerRef.current) clearInterval(walkTimerRef.current);
    };
  }, [currentSprite, spriteUrls.walk]);

  const getDisplaySprite = useCallback((): string | undefined => {
    if (status === 'thinking' || status === 'speaking') {
      return spriteUrls.think || spriteUrls.idle;
    }
    if (isHovered) {
      return spriteUrls.wave || spriteUrls.idle;
    }
    if (currentSprite === 'walk' && spriteUrls.walk?.length) {
      return spriteUrls.walk[walkFrame % spriteUrls.walk.length];
    }
    return spriteUrls.idle;
  }, [status, isHovered, currentSprite, walkFrame, spriteUrls]);

  const handleClick = useCallback(() => {
    if (prompt) {
      setPetPromptOverride(prompt);
    }
    toggleOpen();
  }, [prompt, setPetPromptOverride, toggleOpen]);

  const displaySrc = getDisplaySprite();

  if (!loaded) return null;

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      aria-label={`Open chat with ${plugin.name}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: SPRITE_SIZE,
        height: SPRITE_SIZE,
        cursor: 'pointer',
        zIndex: 9997,
        transition: 'left 0.8s ease-out, top 0.8s ease-out',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: '2px solid transparent',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.boxShadow = '0 0 12px var(--accent)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = 'transparent';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {displaySrc ? (
        <img
          src={displaySrc}
          alt=""
          width={SPRITE_SIZE}
          height={SPRITE_SIZE}
          style={{ pointerEvents: 'none', imageRendering: 'pixelated' }}
        />
      ) : (
        <span
          style={{
            fontSize: 28,
            lineHeight: 1,
          }}
          aria-hidden
        >
          🪴
        </span>
      )}
    </div>
  );
}
