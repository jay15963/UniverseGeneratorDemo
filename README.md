<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Zustand-5-443E38?logo=npm&logoColor=white" />
  <img src="https://img.shields.io/badge/Canvas_API-2D-orange" />
</p>

<h1 align="center">🌌 Space Engine — Gerador de Universo Procedural</h1>

<p align="center">
  <strong>Uma engine procedural completa que gera universos inteiros — de galáxias e estrelas até a superfície de cada planeta — tudo deterministicamente a partir de uma única semente.</strong>
</p>

<p align="center">
  <a href="https://jay15963.github.io/UniverseGeneratorDemo/">🚀 Jogar Online (GitHub Pages)</a>
</p>

---

## 🎮 O que é isso?

Space Engine é um simulador/explorador de universo procedural rodando 100% no navegador. A partir de uma **seed única**, o sistema gera bilhões de combinações possíveis, criando universos, galáxias, sistemas solares e planetas com propriedades físicas e visuais únicas.

### Modo Jogar (Explore Mode)
O modo principal do projeto. Crie um universo configurando a **idade cósmica** e a **quantidade de galáxias**, e então explore livremente navegando por diferentes níveis de detalhe (LOD):

```
Universo → Galáxia → Sistema Solar → Planeta
```

Cada transição entre níveis utiliza um efeito de **hiperespaço** com animação de estrelas, enquanto o sistema de **lock-in** garante performance descartando dados do nível anterior.

### Geradores Individuais
Além do modo exploração, cada gerador pode ser usado separadamente pela tela de menu:

| Gerador | Descrição |
|---------|-----------|
| 🌌 **Universo** | Gera milhares de galáxias com propriedades únicas (forma, idade, cor, tamanho) distribuídas em um espaço 2D |
| 🌀 **Galáxia** | Renderiza braços espirais, nebulosas, buracos negros e milhares de estrelas com LOD dinâmico |
| ☀️ **Sistema Solar** | Simula órbitas Keplerianas, zonas habitáveis, cometas, asteroides e luas com física realista |
| 🌍 **Planeta** | Gera superfícies planetárias com biomas, erosão, rios, vulcões e vida alienígena |

---

## 🧬 Geração Procedural Determinística

O coração do projeto é um sistema de **propagação de sementes em cascata**:

```
rootSeed ──▶ Universo
              ├── galaxySeed_1 ──▶ Galáxia 1
              │     ├── starSeed_1 ──▶ Sistema Solar 1
              │     │     ├── planetSeed_1 ──▶ Planeta 1 (superfície, biomas, recursos)
              │     │     └── planetSeed_2 ──▶ Planeta 2
              │     └── starSeed_2 ──▶ Sistema Solar 2
              └── galaxySeed_2 ──▶ Galáxia 2
```

Cada nível deriva sua semente do nível pai, garantindo que:
- **O mesmo universo é sempre igual** dado a mesma seed + idade
- **Cada galáxia é única** mas reprodutível
- **Qualquer jogador com a mesma seed vê o mesmo universo**

---

## 🔬 Características Técnicas

### Renderização
- **Canvas 2D API** para renderização de alta performance
- **Frustum Culling** — apenas objetos visíveis são desenhados
- **Batch Rendering** — galáxias renderizadas via texturas pré-computadas ("puffs")
- **LOD dinâmico** — nebulosas desaparecem ao dar zoom, estrelas individuais aparecem

### Física & Simulação
- **Órbitas Keplerianas** reais com semi-eixo maior, excentricidade e argumento do periapsis
- **Zonas habitáveis** calculadas pela classe espectral da estrela (O, B, A, F, G, K, M)
- **Evolução temporal** — a idade do universo afeta formação de galáxias, estrelas e planetas
- **Tipos planetários**: Earth-like, Alien Life, Gas Giant, Lava World, Ocean World, Glacial, e 10+ outros

### Geração de Superfície Planetária
- **Noise Simplex** multi-octave para terreno, temperatura, umidade e elevação
- **Biomas procedurais** baseados em latitude, altitude, temperatura e umidade
- **Erosão hídrica** simulada com rios que fluem de montanhas ao mar
- **Vegetação, fauna e recursos** distribuídos por bioma com regras ecológicas

### Arquitetura
- **Zustand** para gerenciamento de estado global (game engine store)
- **Sistema de navegação por pilha** (stack) para breadcrumbs e volta entre níveis
- **Transições de hiperespaço** animadas com Canvas para imersão

---

## 🛠️ Stack Tecnológica

| Tecnologia | Uso |
|-----------|-----|
| **React 18** | Interface e componentização |
| **TypeScript** | Type-safety em toda a codebase |
| **Vite 6** | Build tool e HMR |
| **Zustand** | State management (game engine) |
| **Canvas 2D API** | Renderização de universos, galáxias e sistemas solares |
| **Tailwind CSS 4** | Estilização da UI |
| **GitHub Actions** | CI/CD para deploy automático no GitHub Pages |

---

## 🚀 Como rodar localmente

```bash
# Clone o repositório
git clone https://github.com/jay15963/UniverseGeneratorDemo.git
cd UniverseGeneratorDemo

# Instale as dependências
npm install

# Rode o servidor de desenvolvimento
npm run dev
```

O app estará disponível em `http://localhost:5173/`

---

## 📂 Estrutura do Projeto

```
src/
├── components/
│   ├── Game/                    # Modo Jogar (Explore Mode)
│   │   ├── GameApplication.tsx  # Shell principal (setup → exploração)
│   │   ├── UniverseSetup.tsx    # Tela de criação com sliders + timelapse
│   │   ├── ExplorationCanvas.tsx # Controlador de LOD e transições
│   │   └── HyperspaceTransition.tsx # Efeito visual de hiperespaço
│   ├── Universe/                # Visualizador de Universo
│   ├── Galaxy/                  # Visualizador de Galáxia
│   ├── SolarSystem/             # Visualizador de Sistema Solar + Superfície
│   └── MainMenu.tsx             # Menu principal
├── stores/
│   └── useGameEngine.ts         # Estado global Zustand (LOD, navegação, seeds)
├── lib/
│   ├── universe/                # Gerador de universo
│   ├── galaxy/                  # Gerador de galáxia
│   ├── solar-system/            # Gerador de sistema solar
│   └── planet-generator/        # Gerador de superfície planetária
└── hooks/                       # Controllers dos geradores individuais
```

---

## 🗺️ Roadmap

- [x] Gerador de planetas com superfície procedural
- [x] Gerador de sistema solar com órbitas Keplerianas
- [x] Gerador de galáxia com nebulosas e buracos negros
- [x] Gerador de universo com milhares de galáxias
- [x] Modo Exploração com LOD e transições de hiperespaço
- [ ] Jogo Grand Strategy estilo "War" com Supabase multiplayer
- [ ] Terraformação e construção de bases planetárias
- [ ] Nações, cidades e controle territorial por sistema solar

---

## 📝 Licença

Este projeto é open-source. Sinta-se livre para explorar, modificar e contribuir.
