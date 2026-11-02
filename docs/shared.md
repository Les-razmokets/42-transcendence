# Le dossier `shared/` : le livre des règles posé au milieu de la table

Ce document explique le package `@transcendence/shared` : à quoi il sert, comment il fonctionne et comment y ajouter quelque chose. Rédigé avec l'aide d'une IA (Claude), relu et validé par l'équipe.

## L'histoire en une image

Imaginez une table de poker avec deux joueurs : le **backend** d'un côté, le **frontend** de l'autre.

Avant `shared/`, chacun avait **son propre exemplaire des règles**, recopié à la main :

```
   BACKEND                                  FRONTEND
 ┌──────────────────┐                    ┌──────────────────┐
 │ 📕 Mes règles    │                    │ 📗 Mes règles    │
 │ SeatStatus =     │                    │ SeatStatus =     │
 │  FREE            │                    │  FREE            │
 │  OCCUPIED        │                    │  OCCUPIED        │
 │  RESERVED  ◄──── nouveau !            │  (pas au courant)│
 └──────────────────┘                    └──────────────────┘
          "Cette place est RESERVED"  ──►  🤨 "C'est quoi RESERVED ?"
```

Le jour où le back ajoute une règle, le front ne le sait pas. Personne ne s'en rend compte avant que l'écran affiche n'importe quoi en pleine démo.

Avec `shared/`, il n'y a **plus qu'un seul livre des règles, posé au milieu de la table**. Les deux joueurs lisent le même :

```
   BACKEND              📖 shared/              FRONTEND
 ┌──────────┐      ┌──────────────────┐      ┌──────────┐
 │          │ ───► │ SeatStatus       │ ◄─── │          │
 │  NestJS  │ lit  │ TableStatus      │ lit  │  React   │
 │          │      │ tableSchema (zod)│      │          │
 └──────────┘      └──────────────────┘      └──────────┘
```

Si une règle change, elle change **pour tout le monde en même temps**. Si un joueur l'utilise mal, **TypeScript siffle la faute** avant même qu'on lance l'application.

## Qu'est-ce qu'on range dedans ?

Seulement ce que **les deux côtés doivent comprendre de la même façon** : le vocabulaire et la forme des messages qu'ils s'échangent.

| ✅ Ça va dans `shared/` | ❌ Ça n'y va pas |
|---|---|
| Les enums métier (`SeatStatus`, `TableStatus`, `PokerVariant`…) | La logique métier (calculs, règles de réservation…) |
| Les schémas zod des **réponses** de l'API (`tableSchema`) | Le code NestJS (services, guards, Prisma…) |
| Les types qui en découlent (`type Table`) | Les composants React, les hooks |
| | Les secrets, la config, les variables d'env |

Une bonne question à se poser : *« si le back et le front ne sont pas d'accord là-dessus, est-ce que ça casse quelque chose ? »* Si oui, ça va dans `shared/`.

## Ce qu'il y a dedans aujourd'hui

```
shared/
├── package.json        # nom : @transcendence/shared
├── tsconfig.json
└── src/
    ├── index.ts        # le sommaire : réexporte tout le reste
    ├── enums.ts        # ⚠️ GÉNÉRÉ, ne pas modifier à la main
    └── tables.ts       # tableSchema, seatSchema, type Table
```

On l'importe partout de la même manière, comme une vraie librairie :

```ts
import { tableSchema, type Table, SeatStatus } from '@transcendence/shared';
```

## D'où viennent les enums ? La chaîne de montage

Les enums ne sont pas écrits à la main : ils **descendent** de `schema.prisma`, qui reste la seule source de vérité.

```
 backend/prisma/schema.prisma          ← 1. on modifie ici, et nulle part ailleurs
            │
            │   npm run generate -w backend
            ▼
 backend/src/generated/prisma/enums.ts ← 2. Prisma génère le client
            │
            │   (copie automatique, même commande)
            ▼
 shared/src/enums.ts                   ← 3. le livre des règles est mis à jour
            │
     ┌──────┴──────┐
     ▼             ▼
  backend       frontend               ← 4. les deux joueurs voient la nouvelle règle
```

La commande `generate` fait les étapes 2 et 3 d'un coup :

```bash
npm run generate -w backend
```

👉 Après avoir modifié `schema.prisma`, **commitez aussi `shared/src/enums.ts`**. Sinon, l'arbitre (la CI) vous rappelle à l'ordre (voir plus bas).

## Le contrat de réponse : `tableSchema`

Un schéma zod décrit **exactement** ce que l'API renvoie. Côté back, le controller s'en sert comme d'un **tamis** : tout ce qui n'est pas dans le schéma est retiré de la réponse avant de partir sur le réseau.

```ts
// backend/src/tables/tables.controller.ts
@SerializeOptions({ schema: tableSchema })   // 🧺 le tamis
...
findOne(...): Promise<Table> { ... }         // 🏷️ le type vient du même schéma
```

Ça donne deux garanties pour le prix d'une :
- **Pas de fuite** : un champ interne (`deletedAt`, `createdAt`…) ne passe pas le tamis, même si Prisma le renvoie.
- **Pas de surprise** : le front connaît la forme exacte de la réponse, puisqu'il lit le même schéma.

Le tamis est branché pour toute l'application dans `backend/src/app.config.ts` (`StandardSchemaSerializerInterceptor`). Et il est strict : **une route sans `@SerializeOptions` répond 500**. Pas de schéma, pas de réponse : c'est voulu, pour que personne n'oublie de déclarer son contrat.

## Comment chacun lit le livre

Le livre est le même pour tout le monde, mais chacun le lit avec ses propres lunettes :

| Qui | Ce qu'il lit | Pourquoi |
|---|---|---|
| Backend (`nest build`, `nest start`) | `shared/dist/` (version compilée) | C'est le chemin « normal » d'un package npm. Il faut lancer `npm run build:shared` avant. |
| Tests backend (jest) | `shared/src/` directement | Le `dist` est en ESM et ts-jest ne sait pas le charger. `jest.config.cjs` redirige donc l'import vers les sources. |
| Frontend (Vite) | `shared/src/` directement | Un alias dans `vite.config.ts` pointe sur les sources : pas besoin de compiler `shared` pour le front. |

En pratique, retenez une seule chose : **si le backend ne trouve pas `@transcendence/shared`, lancez `npm run build:shared`.**

## Le monorepo : une seule boîte à outils

Pour que `@transcendence/shared` s'importe comme une vraie librairie, le repo est devenu un **monorepo npm workspaces**. Au lieu de trois établis avec chacun leurs outils, on a **un seul atelier** :

```
transcendence/
├── package.json        # déclare les 3 workspaces : backend, frontend, shared
├── package-lock.json   # ⭐ LE seul lockfile du repo
├── backend/
├── frontend/
└── shared/
```

Ce qui change au quotidien :

```bash
# ✅ maintenant : on installe une fois, depuis la racine
npm ci

# ✅ et on vise un workspace avec -w
npm run lint -w backend
npm test -w backend
npm run build -w frontend

# ❌ plus de npm install dans backend/ ou frontend/ :
#    ça recréerait un lockfile local qui n'a rien à faire là
```

## L'arbitre : ce que vérifie la CI

La CI joue le rôle de l'arbitre. À chaque PR, elle :

1. régénère les enums depuis `schema.prisma` ;
2. lance `git diff --exit-code -- shared/`. Si le fichier régénéré diffère de celui commité, **carton rouge** 🟥 : quelqu'un a modifié le schéma Prisma sans committer les enums partagés ;
3. compile `shared`, puis lint et build le back et le front. Si un joueur utilise une règle qui n'existe plus, ça casse ici, pas en démo.

## Recettes

### « J'ajoute une valeur à un enum »

1. Modifiez l'enum dans `backend/prisma/schema.prisma` (et créez la migration).
2. `npm run generate -w backend`
3. Commitez `schema.prisma`, la migration **et** `shared/src/enums.ts`.
4. Le front et le back voient la nouvelle valeur. TypeScript vous montre les endroits à adapter (un `switch` qui ne gère pas le nouveau cas, par exemple).

### « J'ajoute le contrat d'une nouvelle route »

1. Créez un fichier dans `shared/src/`, par exemple `reservations.ts`, avec le schéma zod de la réponse et son type :
   ```ts
   export const reservationSchema = z.object({ ... });
   export type Reservation = z.infer<typeof reservationSchema>;
   ```
2. Ajoutez-le au sommaire, `shared/src/index.ts` :
   ```ts
   export * from './reservations.js';   // le .js est voulu (ESM)
   ```
3. `npm run build:shared`
4. Côté back : `@SerializeOptions({ schema: reservationSchema })` sur le controller.
5. Côté front : `import type { Reservation } from '@transcendence/shared'`.

## Les pièges classiques 🪤

| Symptôme | Cause probable | Remède |
|---|---|---|
| `Cannot find module '@transcendence/shared'` côté back | `shared/dist` n'existe pas encore | `npm run build:shared` |
| La CI échoue sur `git diff --exit-code -- shared/` | `schema.prisma` modifié sans committer les enums | `npm run generate -w backend`, puis commiter `shared/src/enums.ts` |
| Mes modifs dans `enums.ts` ont disparu | Le fichier est régénéré à chaque `generate` | Modifier `schema.prisma`, jamais `enums.ts` |
| Un `package-lock.json` apparaît dans `backend/` ou `frontend/` | `npm install` lancé dans le sous-dossier | Le supprimer, et lancer `npm ci` à la racine |
| Le backend plante au démarrage avec `exports is not defined` | Client Prisma généré sans `backend/tsconfig.json` | Voir `docs/backend-docker.md` |
