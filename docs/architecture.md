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
├── frontend/                # React + Vite + Tailwind
│   ├── Dockerfile
│   ├── package.json
│   ├── public/locales/{en,fr,..}/   # i18n prêt dès le jour 1
│   └── src/
└── infra/
    ├── nginx/               # reverse proxy HTTPS
    ├── vault/
    ├── prometheus/
    └── grafana/