# Routes API

Liste de toutes les routes du backend, avec les conditions d'accès et ce que fait chaque route. Le détail des corps, des règles et des erreurs est dans [`docs/api.md`](api.md). Rédigé avec l'aide d'une IA (Claude), à relire et valider par l'équipe.

Toutes les routes sont préfixées par `/api`. La colonne Conditions dit qui peut appeler la route.

| Condition | Signification |
|---|---|
| Public | Sans connexion |
| Privé | Connecté (cookie de session) |
| USER / ADMIN | Rôle global du compte requis (sinon 403) |
| FLOOR / OWNER | Rôle requis dans le casino de l'URL. OWNER inclut FLOOR, ADMIN passe partout. Non-membre : 404, rôle trop faible : 403 |

## Routes

34 routes, relevées dans les contrôleurs NestJS de `backend/src`.

| Méthode | Route | Conditions | Ce qu'elle fait |
|---|---|---|---|
| GET | `/api` | Privé | Route de démo hello |
| GET | `/api/health` | Public, sans limite | État de la base |
| POST | `/api/health` | Public, sans limite | Route de test santé |
| GET | `/api/metrics` | Public, sans limite | Métriques pour Prometheus |
| POST | `/api/auth/register` | Public, 3/min | Crée un compte joueur |
| POST | `/api/auth/login` | Public, 5/min | Connexion, pose le cookie |
| POST | `/api/auth/logout` | Public | Déconnexion, efface le cookie |
| GET | `/api/auth/42` | Public, 5/min | Redirige vers OAuth 42 |
| GET | `/api/auth/42/callback` | Public, 5/min | Retour OAuth, redirige front |
| POST | `/api/auth/42/complete` | Public, 5/min, cookie `pending_token` | Finalise inscription via 42 |
| GET | `/api/users/me` | Privé | Profil complet connecté |
| GET | `/api/users/:id` | Public | Pseudo d'un utilisateur |
| POST | `/api/casinos` | ADMIN | Crée un casino |
| GET | `/api/casinos` | Privé | Liste casinos actifs paginée |
| GET | `/api/casinos/:casinoId` | Privé | Détail d'un casino |
| PATCH | `/api/casinos/:casinoId` | OWNER | Modifie les infos casino |
| GET | `/api/casinos/:casinoId/members` | FLOOR | Liste membres du casino |
| POST | `/api/casinos/:casinoId/members` | OWNER | Ajoute un membre |
| PATCH | `/api/casinos/:casinoId/members/:pseudo` | ADMIN | Change rôle d'un membre |
| DELETE | `/api/casinos/:casinoId/members/:pseudo` | OWNER | Retire un membre |
| GET | `/api/casinos/:casinoId/tables` | Privé | Liste tables et places |
| GET | `/api/casinos/:casinoId/tables/:id` | Privé | Détail d'une table |
| POST | `/api/casinos/:casinoId/tables` | OWNER | Crée table et places |
| PUT | `/api/casinos/:casinoId/tables/:id` | OWNER | Remplace config de table |
| DELETE | `/api/casinos/:casinoId/tables/:id` | OWNER, 409 si réservation à venir | Supprime la table (logique) |
| PATCH | `/api/casinos/:casinoId/tables/:id/state` | FLOOR | Statut et argent table |
| PATCH | `/api/casinos/:casinoId/tables/:id/seats/:seatNumber` | FLOOR | Walk-in : place libre/occupée |
| GET | `/api/casinos/:casinoId/reservations?day=` | FLOOR | Réservations actives du jour |
| POST | `/api/casinos/:casinoId/reservations/:id/seat` | FLOOR, réservation CONFIRMED du jour | Check-in du joueur |
| POST | `/api/casinos/:casinoId/reservations/:id/leave` | FLOOR, réservation SEATED | Départ, libère la place |
| POST | `/api/casinos/:casinoId/reservations/:id/no-show` | FLOOR, CONFIRMED et arrivée passée | Marque joueur absent |
| POST | `/api/reservations` | USER | Réserve une place |
| GET | `/api/reservations` | USER | Mes réservations (historique) |
| DELETE | `/api/reservations/:id` | USER, CONFIRMED avant l'arrivée | Annule ma réservation |

Sans route : trois tâches planifiées tournent dans le backend (paiement expiré et no-show chaque minute, fermeture du casino à 5 h, heure de Paris).
