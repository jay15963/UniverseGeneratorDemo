import React from 'react';

interface MainMenuProps {
  onStart: () => void;
  onSolarSystemStart: () => void;
  onGalaxyStart: () => void;
  onUniverseStart: () => void;
  onPlay: () => void;
}

export function MainMenu({ onStart, onSolarSystemStart, onGalaxyStart, onUniverseStart, onPlay }: MainMenuProps) {
  return (
    <div 
      className="min-h-screen w-full font-sans text-white relative flex flex-col justify-center"
      style={{
        backgroundImage: 'url(/background.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Overlays / Gradients for better text readability */}
      <div className="absolute inset-0 bg-black/40 bg-gradient-to-r from-black/80 via-black/40 to-transparent"></div>
      
      <div className="relative z-10 px-6 sm:px-12 md:px-24 max-w-2xl">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black mb-10 md:mb-16 tracking-widest text-white drop-shadow-xl" style={{ textShadow: '0 0 20px rgba(255,255,255,0.4)' }}>
          SPACE ENGINE
        </h1>
        
        <div className="flex flex-col gap-4 md:gap-6 w-full max-w-[20rem]">
          <MenuButton label="Jogar" onClick={onPlay} />
          <MenuButton label="Gerador de Planeta" onClick={onStart} />
          <MenuButton label="Gerador de Sistema Solar" onClick={onSolarSystemStart} />
          <MenuButton label="Gerador de Galáxia" onClick={onGalaxyStart} />
          <MenuButton label="Gerador de Universo" onClick={onUniverseStart} />
          <MenuButton label="Opções" disabled />
        </div>
      </div>

      <div className="absolute bottom-6 left-6 sm:left-12 text-[10px] sm:text-sm text-white/50 tracking-widest">
        0 | 9 | 9 | 0 BETA
      </div>
      
      <div className="absolute bottom-6 right-6 sm:right-12 text-[10px] sm:text-sm text-white/80 font-bold tracking-widest cursor-pointer hover:text-white transition-colors">
        DONATE
      </div>
    </div>
  );
}

interface MenuButtonProps {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

function MenuButton({ label, onClick, disabled }: MenuButtonProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        group relative text-left py-2 px-6 rounded-l-full overflow-hidden transition-all duration-300
        ${disabled 
          ? 'cursor-not-allowed opacity-50' 
          : 'cursor-pointer hover:pl-8'
        }
      `}
    >
      {/* Glow background on hover */}
      {!disabled && (
        <div className="absolute inset-0 rounded-l-full bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 border-l-2 border-transparent group-hover:border-white/50"></div>
      )}
      
      <span className={`
        relative z-10 font-bold text-lg md:text-xl tracking-wider
        ${disabled ? 'text-gray-400' : 'text-white'}
      `}>
        {label}
      </span>
    </button>
  );
}
