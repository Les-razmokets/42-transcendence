# Conteneurisation du backend

Ce document couvre `backend/Dockerfile`, le service `backend` de `docker-compose.yml`, et les cibles du `Makefile` qui s'y rapportent. Rédigé avec l'aide d'une IA (Claude), relu et validé par le responsable DevOps.

## Utilisation

Prérequis : Docker + Docker Compose. Rien d'autre à installer sur la machine (pas de Node, pas de npm).

1. Copier `.env.example` en `.env` à la racine du repo, et remplir les valeurs (au minimum `POSTGRES_*`, `DATABASE_URL`, `PORT`, `FRONTEND_URL`).
2. Lancer tout le projet :
   ```bash
   make all
   ```
   Équivalent direct : `docker compose up -d --build --wait`.
3. Vérifier que le backend répond, via `nginx` (seul point d'entrée depuis le ticket `nginx`, voir `docs/nginx.md`) :
   ```bash
   curl -ik https://localhost/api/health
   ```
   (`-k` ignore l'avertissement de certificat auto-signé.) Réponse attendue : `200 OK` avec `{"status":"Database connection ok"}`. Un `503` veut dire que la base n'est pas joignable.

Autres commandes utiles :

| Commande | Effet |
|---|---|
| `make down` | Arrête les conteneurs (garde les données) |
| `make ps` | État des conteneurs |
| `make logs` | Suit les logs de tous les services |
| `docker compose logs backend` | Logs du backend seul |
| `make fclean` | ⚠️ Arrête les conteneurs **et supprime le volume de la base** |
| `make re` | `fclean` puis `all` (repart de zéro) |

## Décisions et pourquoi

**Image de base : `node:24.21.0-alpine3.24`**
Version exacte (pas `latest`, pas juste `24-alpine`), pour que le build soit reproductible. `24` est la version minimale exigée par Prisma 7 (`^20.19.0`, `^22.12.0` ou `^24.0.0`). `alpine3.24` est choisi pour être la même version d'Alpine que `postgres:18.6-alpine3.24` dans `docker-compose.yml`.

**Un seul stage (pas de multi-stage) pour l'instant**
L'image finale contient encore les `devDependencies` (nécessaires à `nest build`). Choix volontaire pour avancer plus vite ; à revoir une fois le projet plus stable, pour alléger l'image finale.

**Contexte de build : la racine du repo, pas `backend/`**
Depuis TSK-45, le repo est un monorepo npm workspaces (`backend`, `frontend`, `shared`) avec **un seul** `package-lock.json`, à la racine (voir `docs/shared.md`). Le backend dépend du package `@transcendence/shared`. L'image a donc besoin de fichiers situés hors de `backend/` : le lockfile racine et le dossier `shared/`. Or Docker ne peut pas copier de fichiers en dehors du contexte de build. D'où, dans `docker-compose.yml` :
```yaml
build:
  context: .
  dockerfile: backend/Dockerfile
```
Conséquence : dans le Dockerfile, tous les chemins des `COPY` partent de la racine du repo (`backend/src`, `shared/src`…), pas de `backend/`.

**Ordre des `COPY`/`RUN` dans le Dockerfile**
Chaque étape lente est placée juste après les fichiers dont elle dépend réellement, et pas avant, pour que Docker mette en cache les étapes inchangées :
```
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY shared/package.json shared/
RUN npm ci -w backend -w @transcendence/shared

COPY shared/tsconfig.json shared/
COPY shared/src shared/src
RUN npm run build:shared

WORKDIR /app/backend
COPY backend/nest-cli.json backend/tsconfig.build.json backend/tsconfig.json ./
COPY backend/prisma ./prisma
COPY backend/prisma7.config.ts ./
RUN npx prisma generate

COPY backend/src ./src
RUN npm run build
```
Résultat : modifier un fichier dans `backend/src/` ne refait ni `npm ci` ni le build de `shared`.

Quelques points sur ce découpage :
- **Les trois `package.json` sont copiés, même celui du frontend.** `npm ci` vérifie que le lockfile correspond à **tous** les workspaces déclarés à la racine. S'il en manque un, il refuse d'installer.
- **`npm ci -w backend -w @transcendence/shared`** n'installe que les dépendances de ces deux workspaces : rien de React, Vite ou Storybook dans l'image backend.
- **`npm run build:shared` avant le build du backend** : le backend importe `@transcendence/shared` via son `dist/` compilé. Sans ce build, `nest build` ne trouve pas le package.
- **`WORKDIR /app/backend` ensuite** : les commandes suivantes (`prisma generate`, `npm run build`, le `CMD`) se lancent depuis le dossier du backend, comme en local.

**Pourquoi `tsconfig.json` est copié avant `prisma generate`**
Point non intuitif, documenté ici pour ne pas le reperdre : Prisma lit `tsconfig.json` au moment de `prisma generate` pour décider si le client généré doit être en CommonJS ou en ESM. Si `tsconfig.json` n'est pas encore présent à ce moment-là, Prisma part sur ESM par défaut, ce qui casse au démarrage (`ReferenceError: exports is not defined in ES module scope`) puisque le reste du projet NestJS est en CommonJS. D'où la nécessité de copier `backend/tsconfig.json` **avant** `RUN npx prisma generate`, même si le reste du code source n'est copié que plus tard. Ce piège est revenu pendant le passage au monorepo (TSK-45), quand l'ordre des `COPY` a été réécrit.

**`.dockerignore` : un seul, à la racine**
Le contexte de build étant la racine, c'est `.dockerignore` **à la racine** qui s'applique (les anciens `backend/.dockerignore` et `frontend/.dockerignore` n'existent plus). Il exclut :
- `**/node_modules`, `**/dist`, `*.tsbuildinfo` et `backend/src/generated` : ne jamais laisser une copie du disque de l'hôte écraser ce que le conteneur vient d'installer ou de générer lui-même (dépendances, build, client Prisma) ;
- `**/.env` : ne jamais embarquer de secret dans l'image ;
- `.git`, `perso/`, `infra/` : inutiles au build, et ils alourdiraient le contexte envoyé à Docker.

**`CMD` : migration puis démarrage, en une ligne**
```
CMD ["sh", "-c", "npm run db:migrate && npm run start:prod"]
```
Le `&&` garantit que le serveur ne démarre pas si la migration échoue. Un `entrypoint.sh` séparé a été envisagé puis écarté pour l'instant : le `&&` donne déjà la garantie voulue, pour une séquence à deux étapes. À reconsidérer si le démarrage se complexifie (plus d'étapes, retries, logs spécifiques).

**`start:prod` plutôt que `start`**
`npm start` (`nest start`) recompile le code à chaque démarrage et a besoin des `devDependencies` en permanence. `npm run start:prod` (`node dist/main`) utilise le code déjà compilé à la construction de l'image (`RUN npm run build`) : démarrage plus rapide, et compatible avec un futur passage en multi-stage.

**Service `backend` dans `docker-compose.yml`**
- `build:` avec `context: .` et `dockerfile: backend/Dockerfile` (et non `image:`) : l'image est construite localement, pas téléchargée, depuis la racine du repo (voir « Contexte de build » plus haut).
- `depends_on: db: condition: service_healthy` : attend que Postgres soit prêt (pas juste démarré) avant de lancer le backend, pour éviter que les migrations échouent au premier essai.
- `healthcheck` : interroge `127.0.0.1:$PORT/api/health` avec `wget --spider` (déjà présent dans l'image, pas besoin d'installer `curl`). Sans ce `healthcheck`, Docker considère le service prêt dès que le conteneur démarre, pas quand les migrations et Nest ont vraiment fini — `--wait` dans `make up`/`make all` ne peut attendre que ce qu'il sait vérifier.
- Piège rencontré en écrivant ce `healthcheck` : utiliser `localhost` au lieu de `127.0.0.1` échoue avec `Connection refused`. Dans le conteneur, `localhost` résout en `::1` (IPv6, voir `/etc/hosts`), mais le serveur n'écoute qu'en IPv4 (`app.listen(port, '0.0.0.0')`). Rien n'écoute sur `::1`, donc la connexion est refusée. D'où `127.0.0.1` explicitement dans le test.
- `environment: DATABASE_URL=...@db:5432/...` : surcharge la valeur du `.env`. Le `.env` contient volontairement `127.0.0.1` pour pouvoir aussi lancer le backend hors Docker (`npm run start:dev`) ; dans le conteneur, l'hôte de la base doit être `db` (le nom du service), pas `127.0.0.1` (qui désignerait le conteneur backend lui-même).
- Plus de `ports:` sur ce service depuis le ticket `nginx` (voir `docs/nginx.md`) : le backend n'est plus joignable directement depuis l'hôte, seul `nginx` publie un port désormais.

**Makefile : `all` ne dépend plus de l'hôte**
```
all: up
up:
	$(COMPOSE) up -d --build --wait
```
Avant, `all` installait les dépendances et générait le client Prisma sur la machine hôte (nécessitant Node), en plus de lancer Docker. Désormais, tout se passe dans le conteneur : une machine avec seulement Docker installé suffit, conformément à l'exigence du sujet 42 ("lancement en une commande, via un outil de conteneurisation").

## Limites connues / à faire plus tard

- `FRONTEND_URL` dans `.env` est une valeur provisoire (le frontend n'existe pas encore). À mettre à jour quand son port sera fixé.
- Les cibles `check-node`, `generate`, `deploy` et `$(BACKDIR)/node_modules` existent encore dans le Makefile mais ne sont plus appelées par `all`. Elles peuvent rester comme utilitaires pour qui veut travailler avec Node en local, ou être nettoyées si elles ne servent à personne.
- Le texte de `make help` pour `all` n'a pas encore été mis à jour (il décrit encore l'ancien comportement).
- Pas de multi-stage build : l'image finale est plus grande que nécessaire.
- Pas d'utilisateur non-root dans le conteneur.
- ~~Le port `3000` du backend est publié sur `127.0.0.1`~~ : fait, `nginx` est désormais l'unique point d'entrée (voir `docs/nginx.md`), ce `ports:` a été retiré.
