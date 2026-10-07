transcendence/
├── Makefile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .editorconfig
├── README.md
├── docs/
│   ├── transcendence.en.subject.pdf
│   └── db-schema.png        
├── backend/                 # NestJS
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── prisma/          # PrismaModule + PrismaService (issue #2)
│   │   ├── health/          # /health, /health/db
│   │   ├── auth/
│   │   ├── users/
│   │   ├── casinos/         # Casino + Membership
│   │   ├── tables/          # PokerTable + Seat
│   │   └── reservations/    # transaction + gateway WebSocket
│   └── test/
├── frontend/                # React + Vite + CSS Modules
│   ├── Dockerfile
│   ├── .nvmrc               # Node 24
│   ├── package.json
│   ├── .storybook/          # config Storybook
│   ├── public/
│   │   ├── images/
│   │   ├── models/          # fichiers .glb (3D)
│   │   └── locales/{en,fr,..}/   # i18n prêt dès le jour 1
│   └── src/
│       ├── design-system/   # tokens, primitives, composites
│       ├── features/        # écrans par domaine (auth, booking, lobby…)
│       ├── lib/             # outils partagés (i18n, API…)
│       └── three/           # scène 3D de la table
└── infra/
    ├── nginx/               # reverse proxy HTTPS
    ├── vault/
    ├── prometheus/
    └── grafana/