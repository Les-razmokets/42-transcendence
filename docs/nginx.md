# Reverse proxy nginx + HTTPS

Ce document couvre le service `nginx`, le service `genere-certif`, et `infra/nginx/default.conf`. Rédigé avec l'aide d'une IA (Claude), relu et validé par le responsable DevOps. Même logique que `docs/backend-docker.md` et `docs/frontend-docker.md`.

## Utilisation

Prérequis : Docker + Docker Compose. Toujours aucune dépendance côté hôte — pas même `openssl`, il tourne dans un conteneur dédié.

```bash
make all
```

Puis ouvrir `https://localhost` dans le navigateur (pas `http`, et `localhost` plutôt que `127.0.0.1` pour matcher le certificat). Le certificat étant auto-signé, le navigateur affiche un avertissement ("connexion non privée" / "pas sécurisée") — c'est attendu tant qu'il n'y a pas de nom de domaine public ; cliquer sur "Avancé" / "Continuer" pour passer outre.

`backend` et `frontend` ne sont plus joignables directement depuis l'hôte (plus de `127.0.0.1:3000` ni `:5173`) : `nginx` est désormais le seul point d'entrée, sur `443`. `/` route vers `frontend`, `/api` route vers `backend`.

Commandes utiles : voir `docs/backend-docker.md` (`make down`, `make ps`, `make logs`, `make re`, `make fclean`).

## Décisions et pourquoi

**Certificat généré depuis Docker, jamais depuis l'hôte**
Choix strict pour rester cohérent avec la règle du projet "un conteneur doit être autosuffisant" : personne dans l'équipe n'a besoin d'installer `openssl` sur sa machine. Le service `genere-certif` (image `alpine:3.24` nue) installe `openssl` via `apk` (le gestionnaire de paquets d'Alpine, pas `npm` : ce conteneur ne tourne pas Node), génère le certificat, puis s'arrête — il n'a pas de `restart:` (volontairement, à la différence des autres services) : lui en remettre un ferait boucler indéfiniment une régénération inutile à chaque fois qu'il "termine avec succès".

**`alpine` nue plutôt que `nginx:alpine` pour générer le certificat**
Vérifié en live : ni `nginx:alpine` ni `alpine` n'embarquent `openssl` par défaut (`sh: openssl: not found`). Puisqu'il faut l'installer de toute façon, autant utiliser l'image la plus simple possible, dédiée à cette seule tâche, séparée de l'image qui sert réellement le trafic.

**Versions pinnées : `alpine:3.24` et `nginx:stable-alpine3.24`**
Même logique que `node:24.21.0-alpine3.24` et `postgres:18.6-alpine3.24` : jamais `latest`, toujours une version précise. `alpine3.24` est repris à l'identique sur les trois images du projet, par cohérence (pas une obligation technique). `stable` (branche conservatrice de nginx) plutôt que `mainline`, et la variante de base sans modules en plus (pas de `-otel`, `-perl`...) — minimal, comme les autres images.

**`depends_on` à deux étages, avec deux conditions différentes**
- `nginx` attend `genere-certif` via `condition: service_completed_successfully` (pas `service_healthy` : `genere-certif` n'a pas de process qui tourne en continu à surveiller, juste un exit code 0 à atteindre).
- `nginx` attend aussi `backend` et `frontend` via `condition: service_healthy`, pour éviter de router du trafic vers des services pas encore prêts.

**Volume partagé pour les certificats : `./infra/nginx/certs:/infra/nginx/certs`**
Chemin identique côté hôte et côté conteneur (choix délibéré, pas une obligation) : `genere-certif` écrit dans ce dossier, `nginx` le relit, les deux conteneurs doivent donc le monter au même endroit pour se voir réellement. Mêmes raisons qui ont guidé le `.gitignore` déjà en place (`infra/nginx/certs/`, `*.pem`, `*.key`, `*.crt`) : la clé privée ne doit jamais partir sur Git.

**Extension SAN (`-addext "subjectAltName=DNS:localhost"`) sur le certificat**
Trouvé en testant réellement dans Safari (pas en théorie) : un certificat qui ne porte le nom d'hôte que dans son `CN`, sans extension SAN, est purement et simplement rejeté par Safari/macOS (pas juste un avertissement, un refus total de connexion) — exigence Apple depuis 2019. Chrome/Firefox sont plus permissifs mais SAN reste la bonne pratique actuelle de toute façon.

**`proxy_set_header Host localhost;` sur la route `/`**
Trouvé en testant en live (`docker exec ... wget` directement vers `frontend:5173`, 403 avant même que `nginx` n'intervienne) : Vite 8 rejette les requêtes dont le header `Host` n'est pas dans sa liste de confiance (protection anti DNS-rebinding). Par défaut, `nginx` transmet `Host: frontend:5173` au service interne — pas dans la liste de Vite. Plutôt que de modifier le code du frontend (pas notre rôle), le correctif reste côté `nginx` : on force le `Host` envoyé à `localhost`, une valeur que Vite accepte nativement.

**`proxy_http_version 1.1;` + `proxy_set_header Upgrade $http_upgrade;` + `proxy_set_header Connection "upgrade";` sur `/`**
Trouvé en code review par Fred (PR TSK-40), puis vérifié en direct dans un vrai navigateur : le hot-reload de Vite (HMR) ouvre une connexion WebSocket vers la page qu'il a chargée. Sans ces 3 directives, nginx ne relaie pas la demande d'upgrade HTTP → WebSocket vers `frontend` (il parle HTTP/1.0 par défaut en interne, qui ne supporte pas ce mécanisme) : la connexion WebSocket du HMR échouait silencieusement, et le fallback direct vers `localhost:5173` échouait aussi puisque ce port n'est plus publié. Confirmé réparé en éditant un fichier dans `frontend/src` : la page se met à jour sans rechargement manuel.

**`healthcheck` en HTTPS avec `--no-check-certificate`**
Même raisonnement que pour `backend`/`frontend` (TSK-22) : sans `healthcheck:`, `--wait` croirait `nginx` prêt dès le démarrage du conteneur. Le flag `--no-check-certificate` est nécessaire parce que `wget`, comme un navigateur, refuserait sinon la connexion à cause du certificat auto-signé.

**Second bloc `server { }` dédié pour la redirection HTTP → HTTPS**
`default.conf` contient deux blocs `server { }` séparés : celui en `443`/`ssl` (le vrai trafic), et un second qui écoute sur le port `80` en clair, sans `location`, avec une seule ligne — `return 301 https://$host$request_uri;` — qui redirige tout vers la version HTTPS. Choix volontaire de ne rien mélanger dans le même bloc : ce second `server` n'a qu'un seul travail, rediriger, rien d'autre (pas de `proxy_pass`, pas de certificat). Port `80` publié en plus du `443` dans `docker-compose.yml`.

**Plus aucun `ports:` sur `backend` et `frontend`**
Ils communiquent avec `nginx` uniquement via le réseau interne de Compose (résolution par nom de service : `backend:3000`, `frontend:5173`) — plus besoin d'être joignables depuis l'hôte. `nginx` est le seul service qui publie un port (`127.0.0.1:443:443`), confirmant l'objectif du ticket : un seul point d'entrée.

## Limites connues / à faire plus tard

- ~~Seul le port `443` est publié~~ : fait, le port `80` est publié et redirige en `301` vers `https://$host$request_uri` (second bloc `server { }` dans `default.conf`, dédié, sans `location`).
- Certificat auto-signé, donc avertissement navigateur systématique — acceptable sans nom de domaine public, à revoir si le projet en obtient un.
- Les headers `Upgrade`/`Connection` sont gérés sur `/` (nécessaires au hot-reload Vite, trouvé via la review de Fred). Pas encore sur `/api` (prévu dans `docs/diagram-archi.md` pour le temps réel des réservations) : à ajouter quand le backend aura sa passerelle WebSocket.
- Le frontend continue d'être servi par le serveur de dev Vite (pas un build de production) à travers `nginx` — limite déjà documentée dans `docs/frontend-docker.md`, toujours vraie.
- Certificat valide 1 an, pas de renouvellement automatique — un `make re` complet le régénère de toute façon à chaque fois que le volume est recréé.
