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
3. Vérifier que le backend répond :
   ```bash
   curl -i http://127.0.0.1:3000/api/health
   ```
   Réponse attendue : `200 OK` avec `{"status":"Database connection ok"}`. Un `503` veut dire que la base n'est pas joignable.

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

**Ordre des `COPY`/`RUN` dans le Dockerfile**
Chaque étape lente est placée juste après les fichiers dont elle dépend réellement, et pas avant, pour que Docker mette en cache les étapes inchangées :
```
COPY package.json tsconfig.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY nest-cli.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
```
Résultat : modifier un fichier dans `src/` ne refait pas `npm ci` (~10s au lieu d'être instantané sinon).

**Pourquoi `tsconfig.json` est copié dès la première étape**
Point non intuitif, documenté ici pour ne pas le reperdre : Prisma lit `tsconfig.json` au moment de `prisma generate` pour décider si le client généré doit être en CommonJS ou en ESM. Si `tsconfig.json` n'est pas encore présent à ce moment-là, Prisma part sur ESM par défaut, ce qui casse au démarrage (`ReferenceError: exports is not defined in ES module scope`) puisque le reste du projet NestJS est en CommonJS. D'où la nécessité de copier `tsconfig.json` **avant** `RUN npx prisma generate`, même si le reste du code source n'est copié que plus tard.

**`.dockerignore`**
Exclut `node_modules`, `.env`, `src/generated/prisma` et `/dist`. Le but : ne jamais laisser une `COPY . .` écraser ce que le conteneur vient de générer lui-même (client Prisma, dépendances) avec une version qui traîne sur le disque de l'hôte.

**`CMD` : migration puis démarrage, en une ligne**
```
CMD ["sh", "-c", "npm run db:migrate && npm run start:prod"]
```
Le `&&` garantit que le serveur ne démarre pas si la migration échoue. Un `entrypoint.sh` séparé a été envisagé puis écarté pour l'instant : le `&&` donne déjà la garantie voulue, pour une séquence à deux étapes. À reconsidérer si le démarrage se complexifie (plus d'étapes, retries, logs spécifiques).

**`start:prod` plutôt que `start`**
`npm start` (`nest start`) recompile le code à chaque démarrage et a besoin des `devDependencies` en permanence. `npm run start:prod` (`node dist/main`) utilise le code déjà compilé à la construction de l'image (`RUN npm run build`) : démarrage plus rapide, et compatible avec un futur passage en multi-stage.

**Service `backend` dans `docker-compose.yml`**
- `build: ./backend` (et non `image:`) : l'image est construite localement, pas téléchargée.
- `depends_on: db: condition: service_healthy` : attend que Postgres soit prêt (pas juste démarré) avant de lancer le backend, pour éviter que les migrations échouent au premier essai.
- `environment: DATABASE_URL=...@db:5432/...` : surcharge la valeur du `.env`. Le `.env` contient volontairement `127.0.0.1` pour pouvoir aussi lancer le backend hors Docker (`npm run start:dev`) ; dans le conteneur, l'hôte de la base doit être `db` (le nom du service), pas `127.0.0.1` (qui désignerait le conteneur backend lui-même).
- `ports: 127.0.0.1:3000:3000` : le port n'est exposé que sur la machine locale, pas sur le réseau.

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
- Pas d'utilisateur non-root dans le conteneur, pas de `HEALTHCHECK` Docker sur le service `backend` (seul `/api/health` applicatif existe pour l'instant).
- Le port `3000` du backend est publié sur `127.0.0.1` pour pouvoir le tester directement. Une fois `nginx` en place comme unique point d'entrée (ticket à venir), ce `ports:` pourra être retiré : seul `nginx` aura besoin d'un port publié, et il parlera au backend via le réseau Docker interne.
