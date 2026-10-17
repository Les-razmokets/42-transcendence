# Architecture de déploiement

## État actuel

État réel du `docker-compose.yml` actuel : 3 services, pas encore de `nginx`. Le navigateur parle directement au port du frontend et à celui du backend.

```mermaid
flowchart TB
    Client["Navigateur (hôte)"]

    subgraph Compose["docker compose — réseau par défaut du projet"]
        direction LR
        Frontend["frontend<br/>Vite dev server · :5173<br/>healthcheck: wget /"]
        Backend["backend<br/>NestJS · :3000/api<br/>healthcheck: wget /api/health"]
        DB["db<br/>PostgreSQL 18 · :5432<br/>healthcheck: pg_isready"]

        Backend -- "DATABASE_URL<br/>(db:5432)" --> DB
    end

    Client -- "HTTP :5173" --> Frontend
    Client -- "HTTP :3000/api" --> Backend
```

**Notes qui ne tiennent pas dans le dessin :**
- `backend` a un `depends_on: db: condition: service_healthy` — il attend que `db` soit vraiment prêt (pas juste démarré) avant de se lancer.
- Les trois ports (`5432`, `3000`, `5173`) ne sont publiés que sur `127.0.0.1` de la machine hôte, pas sur le réseau.
- Pas de `depends_on` sur `frontend` : il ne dépend ni de `backend` ni de `db` pour démarrer, c'est le navigateur qui appelle l'API, pas le conteneur.
- Aucun reverse proxy pour l'instant : deux ports différents exposés (`5173`, `3000`), au lieu d'une seule porte d'entrée. C'est précisément ce que le futur ticket `nginx` doit remplacer.

## Architecture cible

Ce que le `docker-compose.yml` doit devenir une fois tous les modules du périmètre DevOps faits. Les services viennent de l'arborescence `infra/` de `docs/architecture.md` ; les flux entre eux sont déduits et restent à valider par l'équipe (pas encore implémenté — `nginx`, `vault`, `prometheus`, `grafana` n'existent pas encore dans le repo).

```mermaid
flowchart TB
    Client["Navigateur"]
    Stripe["Stripe<br/>(service externe)"]

    Client -- "HTTPS" --> Nginx
    Stripe -- "webhooks HTTPS" --> Nginx

    subgraph Compose["docker compose"]
        Nginx["nginx<br/>reverse proxy · HTTPS<br/>seul point d'entrée<br/>sert le build du frontend"]
        Backend["backend<br/>NestJS<br/>REST + WebSocket"]
        DB["db<br/>PostgreSQL"]
        Vault["vault<br/>secrets"]
        Prometheus["prometheus<br/>métriques"]
        Grafana["grafana<br/>dashboards"]

        Nginx -- "/api" --> Backend
        Nginx -- "WebSocket (Upgrade)" --> Backend
        Backend -- "Prisma" --> DB
        Vault -. "secrets" .-> Backend
        Prometheus -. "scrape /metrics" .-> Backend
        Grafana -- "requêtes" --> Prometheus
    end

    Backend -- "API paiement" --> Stripe
```

Différences principales avec l'état actuel :
- Un seul point d'entrée (`nginx`, HTTPS) au lieu de deux ports publiés directement.
- Le frontend passe du serveur de dev Vite à un vrai build statique (`vite build`). Choix à valider : `nginx` sert lui-même les fichiers du build (copiés dans son image), il n'y a donc plus de conteneur `frontend` en production.
- Le backend gagne une passerelle WebSocket (temps réel) en plus du REST : `nginx` doit transmettre les en-têtes `Upgrade` / `Connection` sur cette route.
- Stripe appelle aussi le backend (webhooks de paiement), en passant par `nginx` comme le navigateur.
- Trois nouveaux services : `vault` (secrets), `prometheus` + `grafana` (observabilité) — correspondent aux modules 5 et 6 du périmètre DevOps, pas encore commencés. `prometheus` vient lire les métriques du backend (pull), et `grafana` interroge `prometheus`.
