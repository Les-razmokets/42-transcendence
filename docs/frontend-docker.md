# Conteneurisation du frontend

Ce document couvre `frontend/Dockerfile` et le service `frontend` de `docker-compose.yml`. Rédigé avec l'aide d'une IA (Claude), relu et validé par le responsable DevOps. Même logique que `docs/backend-docker.md`, pour le frontend.

## Utilisation

Prérequis : Docker + Docker Compose. Pas besoin d'installer Node, nvm ou les dépendances sur la machine.

```bash
make all
```

Puis ouvrir `http://localhost:5173` dans le navigateur. Le serveur de dev Vite tourne avec le hot-reload : modifier un fichier dans `frontend/src` met à jour la page sans recharger.

Commandes utiles : voir `docs/backend-docker.md` (`make down`, `make ps`, `make logs`, `docker compose logs frontend`, `make fclean`, `make re`).

## Décisions et pourquoi

**Même image de base que le backend : `node:24.21.0-alpine3.24`**
Vite 8 demande Node `^20.19.0` ou `>=22.12.0` ; `24` convient. Surtout, `frontend/.nvmrc` fixe déjà `24` pour l'équipe : l'image Docker reprend une version déjà actée, elle ne l'invente pas.

**Serveur de dev Vite, pas un build de production**
Le `CMD` lance `npm run dev` (hot-reload), pas `npm run build` + un serveur de fichiers statiques. Choix volontaire : l'équipe travaille encore activement sur l'interface, et le hot-reload est plus pratique au quotidien que de reconstruire l'image à chaque changement. À reconsidérer quand `nginx` (prochain ticket) sera en place : le mode build sera probablement plus adapté à ce moment-là.

**`CMD ["npm", "run", "dev", "--", "--host"]`**
- `--host` fait écouter Vite sur toutes les interfaces (`0.0.0.0`), pas seulement sur `localhost` du conteneur. Sans lui, le serveur tourne mais reste injoignable depuis l'extérieur du conteneur, même avec un `ports:` dans le compose.
- Le `--` avant `--host` est nécessaire : un script `npm run` ne transmet pas ses arguments à la commande sous-jacente par défaut. Tout ce qui suit `--` est passé à Vite, pas interprété par `npm`.

**Un seul `COPY` pour les fichiers de config**
```
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY . .
```
Plus simple que le backend : pas de génération de client (pas de Prisma côté frontend), donc pas besoin d'étapes intermédiaires entre `npm ci` et la copie du reste du code.

**`.dockerignore` : `node_modules`, `.env`**
Même raison que le backend : ne jamais laisser une copie du disque de l'hôte écraser ce que `npm ci` vient d'installer dans l'image, et ne jamais embarquer de secret.

**Pas de `depends_on` sur `db` ni `backend`**
Le conteneur `frontend` sert des fichiers avec Vite ; il n'a besoin ni de la base ni de l'API pour démarrer lui-même. C'est le **navigateur** de l'utilisateur qui appellera l'API plus tard, pas le conteneur. D'où l'absence de `depends_on` ici, à la différence de `backend` qui attend `db`.

**`healthcheck` sur `/` avec `wget`**
Rien ne dépend encore du frontend aujourd'hui, mais sans `healthcheck`, `--wait` (dans `make up`/`make all`) considère le service prêt dès que le conteneur démarre — même piège que celui rencontré sur le backend (TSK-22). Comme il n'y a pas de route `/api/health` côté frontend, le test interroge simplement la racine (`http://127.0.0.1:5173/`), juste pour confirmer que Vite répond.

**Port `5173` (défaut de Vite), non piloté par `.env`**
Pas de variable `FRONTEND_PORT` : le port par défaut de Vite suffit pour l'instant. À revoir si un jour il faut le rendre configurable.

## Limites connues / à faire plus tard

- Pas de mode production (`vite build` + serveur statique) : seul le mode dev (hot-reload) est conteneurisé pour l'instant. À revoir avec le ticket `nginx`.
- Le port `5173` est publié directement sur `127.0.0.1`, comme le `3000` du backend. Une fois `nginx` en place comme unique point d'entrée, ce `ports:` pourra être retiré.
- Pas encore de variable `VITE_*` pour donner au frontend l'URL de l'API backend : à ajouter quand le frontend appellera réellement le backend.
- Pas de multi-stage build, pas d'utilisateur non-root dans le conteneur (mêmes limites que le backend, voir `docs/backend-docker.md`).
