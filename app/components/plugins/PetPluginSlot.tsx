'use client';

import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import PetMascot from './PetMascot';
import type { DomePluginInfo } from '@/types/plugin';

const HOME_ROUTES = ['/', '/home'];

export default function PetPluginSlot() {
  const { pathname } = useLocation();
  const [petPlugin, setPetPlugin] = useState<DomePluginInfo | null>(null);

  useEffect(() => {
    if (!HOME_ROUTES.includes(pathname || '')) {
      setPetPlugin(null);
      return;
    }

    const loadPetPlugin = async () => {
      try {
        const r = await window.electron?.plugins?.list?.();
        if (!r?.success || !r.data) return;

        const pet = r.data.find((p) => (p as DomePluginInfo & { type?: string }).type === 'pet' && p.enabled);
        setPetPlugin(pet as DomePluginInfo | undefined ?? null);
      } catch {
        setPetPlugin(null);
      }
    };

    loadPetPlugin();
  }, [pathname]);

  if (!HOME_ROUTES.includes(pathname || '') || !petPlugin) {
    return null;
  }

  return <PetMascot plugin={petPlugin} />;
}
