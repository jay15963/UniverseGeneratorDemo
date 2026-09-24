import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Rocket, Globe2, Sun, Sparkles, Orbit, Settings, Dna, Clapperboard, Film, Download } from 'lucide-react';
import { MenuScene } from './MenuScene';
import { LOCAL_SOUNDTRACK } from './Trailer/Trailer';

interface MainMenuProps {
  onStart: () => void;
  onSolarSystemStart: () => void;
  onGalaxyStart: () => void;
  onUniverseStart: () => void;
  onPlay: () => void;
  onCreatureStart: () => void;
  onDemo: () => void;
  onTrailer: () => void;
  /** record the trailer into a video file, with this soundtrack URL */
  onTrailerDownload: (soundtrack: string) => void;
}

export function MainMenu({ onStart, onSolarSystemStart, onGalaxyStart, onUniverseStart, onPlay, onCreatureStart, onDemo, onTrailer, onTrailerDownload }: MainMenuProps) {
  // the recording needs the music as a file: the one served with the site, or one the viewer picks
  const [localTrack, setLocalTrack] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch(LOCAL_SOUNDTRACK, { method: 'HEAD' })
      .then(r => setLocalTrack(r.ok && (r.headers.get('content-type') ?? '').startsWith('audio')))
      .catch(() => setLocalTrack(false));
  }, []);
  const download = () => { if (localTrack) onTrailerDownload(LOCAL_SOUNDTRACK); else fileRef.current?.click(); };
  // A different showcase world every time the menu opens
  const sceneSeed = useMemo(() => 'menu-' + Math.random().toString(36).slice(2, 8), []);

  return (
    <div className="fixed inset-0 w-full font-sans text-white overflow-hidden bg-black">
      <MenuScene seed={sceneSeed} />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none" />

      <div className="relative z-10 h-full flex flex-col justify-center px-6 sm:px-12 md:px-20 max-w-xl">
        <div className="mb-8 md:mb-12">
          <div className="text-[10px] sm:text-xs font-mono tracking-[0.5em] text-cyan-300/70 mb-3">PROCEDURAL UNIVERSE</div>
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-[0.12em] leading-[0.9] bg-gradient-to-br from-white via-indigo-100 to-fuchsia-300 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(180,160,255,0.35)]">
            SPACE<br />ENGINE
          </h1>
          <p className="mt-4 text-sm text-neutral-400 max-w-xs leading-relaxed">
            Bilhões de galáxias, estrelas e mundos — todos gerados a partir de uma única semente.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 w-full max-w-[22rem]">
          <MenuButton label="Jogar" hint="Explore um universo inteiro" icon={<Rocket className="w-5 h-5" />} onClick={onPlay} primary />
          <div className="flex items-stretch gap-1.5">
            <div className="flex-1 min-w-0"><MenuButton label="Assistir trailer" icon={<Film className="w-4 h-4" />} onClick={onTrailer} badge="NOVO" /></div>
            <button onClick={download}
              title={localTrack ? 'Baixar o trailer em vídeo (grava enquanto ele passa, ~2:30)' : 'Baixar o trailer em vídeo: escolha o arquivo da música "Leaf" (Infraction); ele é gravado enquanto passa (~2:30)'}
              className="group flex items-center gap-1.5 px-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.1] hover:border-white/25 text-cyan-200/80 hover:text-cyan-100 transition-all">
              <Download className="w-4 h-4 group-hover:translate-y-0.5 transition-transform" />
              <span className="text-xs font-bold tracking-wide whitespace-nowrap">Baixar</span>
            </button>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onTrailerDownload(URL.createObjectURL(f)); }} />
          </div>
          <MenuButton label="Assistir demo" icon={<Clapperboard className="w-4 h-4" />} onClick={onDemo} />
          <MenuButton label="Gerador de Criaturas" icon={<Dna className="w-4 h-4" />} onClick={onCreatureStart} />
          <MenuButton label="Gerador de Planeta" icon={<Globe2 className="w-4 h-4" />} onClick={onStart} />
          <MenuButton label="Gerador de Sistema Solar" icon={<Sun className="w-4 h-4" />} onClick={onSolarSystemStart} />
          <MenuButton label="Gerador de Galáxia" icon={<Orbit className="w-4 h-4" />} onClick={onGalaxyStart} />
          <MenuButton label="Gerador de Universo" icon={<Sparkles className="w-4 h-4" />} onClick={onUniverseStart} />
          <MenuButton label="Opções" icon={<Settings className="w-4 h-4" />} disabled />
        </div>
      </div>

      <div className="absolute bottom-5 left-6 sm:left-12 md:left-20 text-[10px] sm:text-xs text-white/40 tracking-[0.3em] font-mono z-10">
        v{__APP_VERSION__} ALPHA · {__APP_COMMIT__} · {__APP_BUILD__} UTC
      </div>
      <div className="absolute bottom-5 right-6 sm:right-12 text-[10px] sm:text-xs text-white/60 font-bold tracking-[0.3em] cursor-pointer hover:text-white transition-colors z-10">
        DONATE
      </div>
    </div>
  );
}

interface MenuButtonProps {
  label: string;
  hint?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  badge?: string;
}

function MenuButton({ label, hint, icon, onClick, disabled, primary, badge }: MenuButtonProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`group relative flex items-center gap-4 text-left rounded-xl overflow-hidden transition-all duration-300 border
        ${primary ? 'py-4 px-5 mb-3 bg-gradient-to-r from-fuchsia-600/80 to-indigo-600/70 border-white/20 shadow-[0_0_40px_rgba(192,38,211,0.35)] hover:shadow-[0_0_60px_rgba(192,38,211,0.55)] hover:translate-x-1'
          : disabled ? 'py-2.5 px-5 border-transparent cursor-not-allowed opacity-40'
          : 'py-2.5 px-5 border-transparent hover:border-white/10 hover:bg-white/[0.06] hover:translate-x-1'}`}
    >
      <span className={`${primary ? 'text-white' : 'text-cyan-200/70 group-hover:text-cyan-200'} transition-colors`}>{icon}</span>
      <span className="flex flex-col">
        <span className={`font-bold tracking-wide whitespace-nowrap ${primary ? 'text-lg' : 'text-sm sm:text-base text-neutral-200 group-hover:text-white'}`}>{label}</span>
        {hint && <span className="text-[11px] text-white/70 font-medium">{hint}</span>}
      </span>
      {badge && <span className="ml-auto text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded bg-fuchsia-500/80 text-white">{badge}</span>}
      {primary && <span className="ml-auto text-white/80 group-hover:translate-x-1 transition-transform">→</span>}
    </button>
  );
}
