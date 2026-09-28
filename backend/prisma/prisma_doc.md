# Prisma & base de données

Guide de l'équipe pour travailler avec Postgres et Prisma sur transcendence.
Il couvre l'installation, l'écriture du schéma, les migrations et les pièges déjà rencontrés.

---

## 1. Vue d'ensemble

```
.env ──► docker-compose.yml ──► conteneur Postgres 18 (127.0.0.1:5432)
  │                                        ▲
  └──► backend/prisma7.config.ts ──────────┘  (DATABASE_URL)
            │
            ├── prisma/schema.prisma    ← ce qu'on VEUT (l'intention)
            ├── prisma/migrations/      ← ce qui est APPLIQUÉ (l'historique SQL)
            └── src/generated/prisma    ← client TypeScript généré (ne pas éditer)
```

| Fichier | Rôle | Versionné ? |
|---|---|---|
| `.env` | Identifiants Postgres + `DATABASE_URL` | ❌ jamais |
| `docker-compose.yml` | Lance Postgres avec un volume `db_data` | ✅ |
| `backend/prisma7.config.ts` | Chemin du schéma, des migrations, et de l'URL de la base | ✅ |
| `backend/prisma/schema.prisma` | Définition des modèles | ✅ |
| `backend/prisma/migrations/` | Une migration SQL par changement de schéma | ✅ toujours |
| `backend/src/generated/prisma` | Client généré | ❌ (se régénère) |

> **Règle d'or :** le schéma décrit une intention. Seules les **migrations** modifient la base.
> Si on modifie le schéma sans créer de migration, la base ne change pas.

---

## 2. Démarrer en local

```bash
cp .env.example .env     # puis remplir les valeurs
make                     # npm ci + docker compose up + migrate deploy
make ps                  # vérifier que le conteneur db est "healthy"
```

La `DATABASE_URL` pointe sur **`127.0.0.1`**, pas sur `localhost` ni sur le nom du service :

```
DATABASE_URL="postgresql://USER:PASSWORD@127.0.0.1:5432/DB?schema=public"
```

- Le backend tourne sur la machine hôte, donc le nom `db` (le service Docker) ne lui dit rien.
- Le port est publié uniquement sur `127.0.0.1` (voir `docker-compose.yml`).
- `prisma7.config.ts` charge `../.env` via `dotenv.config({ path: "../.env" })`, parce que le `.env` est à la racine du repo et non dans `backend/`.

---

## 3. Écrire le schéma

### Syntaxe de base

```prisma
model User {
  id           String   @id @default(uuid())  // clé primaire, UUID généré
  email        String   @unique               // index unique en base
  passwordHash String?                        // ? = optionnel (NULL autorisé)
  role         Role     @default(USER)        // valeur par défaut
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt            // mis à jour automatiquement par Prisma
}

enum Role {
  USER
  ADMIN
}
```

| Élément | Signification |
|---|---|
| `String?` | Colonne nullable. Sans `?`, la colonne est `NOT NULL` |
| `@id` | Clé primaire |
| `@default(uuid())` / `now()` / `USER` | Valeur si on n'en fournit pas |
| `@unique` | Contrainte d'unicité |
| `@updatedAt` | Rempli par Prisma à chaque update (pas par Postgres) |
| `enum` | Type Postgres à valeurs fixes |

**Une seule source de vérité par information.** On avait `isAdmin Boolean` en plus de `role Role`.
Un user avec `isAdmin: true` et `role: USER` n'a aucun sens, donc on a gardé uniquement `role`.

### Relations 1-n (un User possède plusieurs Casino)

```prisma
model User {
  id      String   @id @default(uuid())
  casinos Casino[]                     // champ VIRTUEL : aucune colonne en base
}

model Casino {
  id      String @id @default(uuid())
  ownerId String                       // vraie colonne : la clé étrangère
  owner   User   @relation(fields: [ownerId], references: [id], onDelete: Cascade)
}
```

- **La clé étrangère est toujours du côté « plusieurs »** (`Casino.ownerId`). Une cellule SQL ne peut pas contenir une liste.
- `casinos Casino[]` n'existe que dans Prisma. Il est traduit en `WHERE "ownerId" = ...` au moment de la requête.
- **Le type de `ownerId` doit être celui de `User.id`.** Ici c'est `String`, parce que les id sont des UUID, et pas `Int`.
- **Les deux côtés sont obligatoires.** Sans `casinos Casino[]` dans `User`, on obtient l'erreur P1012 (voir §6).
- `owner String` au lieu de `owner User @relation(...)` crée simplement une colonne texte, sans aucun lien.

### `onDelete` : que faire quand on supprime le parent ?

| Valeur | Effet quand on supprime un User qui a des casinos |
|---|---|
| *(rien)* = `Restrict` | Postgres **refuse** la suppression (défaut pour une relation obligatoire) |
| `Cascade` | Les casinos sont **supprimés** avec lui |
| `SetNull` | `ownerId` passe à NULL (impose `ownerId String?`) |
| `NoAction` | Proche de Restrict, vérifié en fin de transaction |

> L'exemple `Casino.owner` ci-dessus illustre la syntaxe. Dans le vrai schéma, la propriété d'un casino
> passe par `Membership` (rôle `OWNER`), pour avoir une seule source de vérité sur « qui a des droits sur ce casino ».

**Supprimer « en cascade » peut effacer bien plus que prévu.** `Cascade` sur un owner effacerait son casino,
puis ses tables, ses places, et les réservations en cours de joueurs qui n'y sont pour rien.
Principes retenus (à valider en équipe) :

- **Liens** (ex : `Membership`) : `Cascade` accepté. Si le compte disparaît, son appartenance aussi.
  Le code doit empêcher de supprimer le **dernier `OWNER`** d'un casino.
- **Entités métier avec un historique** (Casino, Reservation, Payment) : **soft delete** (`deletedAt DateTime?`)
  plutôt qu'une suppression physique, et `Restrict` sur les relations qui y mènent. Les stats et le RGPD
  ont besoin de cet historique.

---

## 4. Workflow des migrations

### Modifier le schéma

```bash
# 1. éditer backend/prisma/schema.prisma
cd backend && npx prisma format     # formate et valide la syntaxe
cd .. && make migrate name=add_casino
# 2. LIRE le migration.sql généré (voir ci-dessous)
# 3. commit : schema.prisma + le nouveau dossier de migration, ensemble
```

Nommer les migrations en `snake_case` descriptif : `add_casino`, `rename_casino_address`, `drop_user_is_admin`.
Un nom comme `roleandcorrect` passe, mais il est illisible dans l'historique.

### Toujours relire le `migration.sql`

Si le fichier commence par un bloc `Warnings:`, **on s'arrête et on lit.** Exemple réel :

```sql
/*
  Warnings:
  - You are about to drop the column `adress` on the `Casino` table. All the data in the column will be lost.
  - Added the required column `address` to the `Casino` table without a default value.
    This is not possible if the table is not empty.
*/
ALTER TABLE "Casino" DROP COLUMN "adress",
ADD COLUMN "address" TEXT NOT NULL;
```

Prisma **ne sait pas détecter un renommage**. Il voit une colonne qui disparaît et une autre qui apparaît.
En production, ça veut dire **toutes les adresses effacées**, ou une migration qui échoue si la table n'est pas vide.

Pour renommer sans perte, créer la migration sans l'appliquer, puis corriger le SQL à la main :

```bash
cd backend && npx prisma migrate dev --create-only --name rename_casino_address
# éditer prisma/migrations/<date>_rename_casino_address/migration.sql :
#   ALTER TABLE "Casino" RENAME COLUMN "adress" TO "address";
npx prisma migrate dev          # applique la migration éditée
```

### Migrations de données : ne pas perdre d'information

Prisma génère la **structure** (tables, colonnes, contraintes), jamais le **déplacement des données**.
Quand une info change de forme, par exemple quand `isAdmin Boolean` est remplacé par `role Role`, la migration générée se contente de :

```sql
ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER';
ALTER TABLE "User" DROP COLUMN "isAdmin";
```

Résultat en production : **tous les admins redeviennent de simples users**.
Il faut ajouter à la main, entre l'ajout et la suppression, la requête qui recopie l'info :

```bash
cd backend && npx prisma migrate dev --create-only --name replace_is_admin_by_role
# éditer le migration.sql généré :
#   ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER';
#   UPDATE "User" SET "role" = 'ADMIN' WHERE "isAdmin" = true;   ← ajouté à la main
#   ALTER TABLE "User" DROP COLUMN "isAdmin";
npx prisma migrate dev
```

Toujours dans cet ordre : **1. créer** la nouvelle colonne → **2. recopier** les données → **3. supprimer** l'ancienne.
Avant tout `DROP COLUMN`, se demander : *« si la table contenait des données réelles, qu'est-ce qu'on perdrait ? »*

### Tant que la PR n'est pas mergée : une seule migration propre

Une migration mergée sur `main` est gravée pour toujours. Tant qu'elle ne l'est pas, on peut réécrire les migrations de **sa** branche,
au lieu d'empiler « créer `adress` » puis « supprimer `adress` et créer `address` » :

```bash
rm -r backend/prisma/migrations/<migrations_de_ma_branche>
cd backend && npx prisma migrate reset      # ⚠️ vide la base locale
cd .. && make migrate name=nom_final
```

Si un coéquipier a déjà appliqué les anciennes migrations de la branche, il devra lui aussi lancer `npx prisma migrate reset`.

### Lire la clé étrangère

```sql
ALTER TABLE "Casino" ADD CONSTRAINT "Casino_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

- `ON DELETE ...` : ce qu'on a choisi avec `onDelete`
- `ON UPDATE CASCADE` : si un `User.id` change, les `ownerId` suivent

### Règles d'équipe

1. **Ne jamais modifier une migration déjà mergée sur `main`.** On en crée une nouvelle.
2. **Schéma et migration dans le même commit.** Un schéma sans sa migration trompe les autres :
   le schéma dit une chose, la base en fait une autre.
3. Après un `git pull` qui contient de nouvelles migrations : `make deploy`.
4. Deux branches qui créent chacune une migration : la seconde à merger doit rebaser,
   puis vérifier `npx prisma migrate status`.

---

## 5. Commandes

### Via le Makefile (depuis la racine)

| Commande | Effet |
|---|---|
| `make` / `make all` | Installe les deps, lance Postgres, applique les migrations |
| `make up` / `make down` | Démarre / arrête les conteneurs (les données sont conservées) |
| `make ps` / `make logs` | État / logs des conteneurs |
| `make deploy` | `prisma migrate deploy` : applique les migrations existantes, sans en créer |
| `make migrate name=xxx` | `prisma migrate dev --name xxx` : crée **et** applique une migration |
| `make studio` | Interface web pour lire et éditer les données |
| `make fclean` | ⚠️ Supprime le volume : **toutes les données sont perdues** |
| `make re` | `fclean` + `all` : base neuve, toutes les migrations rejouées |

### Prisma directement (depuis `backend/`)

| Commande | Quand |
|---|---|
| `npx prisma format` | Avant chaque commit : formate et valide |
| `npx prisma validate` | Vérifie le schéma sans toucher à la base |
| `npx prisma migrate status` | Compare les migrations du dossier avec celles appliquées en base |
| `npx prisma migrate dev --name xxx` | Dev : génère le SQL à partir du diff du schéma, puis l'applique |
| `npx prisma migrate dev --create-only --name xxx` | Génère le SQL **sans l'appliquer**, pour l'éditer d'abord |
| `npx prisma migrate deploy` | Applique les migrations en attente (CI, prod, après un pull) |
| `npx prisma migrate reset` | ⚠️ Vide la base et rejoue toutes les migrations (dev uniquement) |
| `npx prisma generate` | Régénère le client TypeScript dans `src/generated/prisma` |
| `npx prisma studio` | Explorateur de données |

`migrate dev` = développement (crée des migrations). `migrate deploy` = tout le reste (applique seulement).

### Postgres directement

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Les guillemets simples font lire les variables **dans le conteneur**, qui les reçoit du `.env`, et non dans ton shell.

| Dans `psql` | Effet |
|---|---|
| `\dt` | Lister les tables |
| `\d "Casino"` | Colonnes, index et clés étrangères d'une table |
| `SELECT * FROM "_prisma_migrations";` | Migrations appliquées selon Prisma |
| `\q` | Quitter |

Les noms de tables Prisma sont en PascalCase, donc il faut les **guillemets** : `"User"`, pas `User`.

---

## 6. Erreurs déjà rencontrées

| Symptôme | Cause | Solution |
|---|---|---|
| `P1012 ... missing an opposite relation field on the model User` | Relation déclarée d'un seul côté | Ajouter `casinos Casino[]` dans `User` |
| `migrate status` ne trouve pas `DATABASE_URL` | `.env` non chargé : il est à la racine, pas dans `backend/` | `dotenv.config({ path: "../.env" })` dans `prisma7.config.ts` |
| Connexion refusée / hôte inconnu | `DATABASE_URL` avec un mauvais hôte | Utiliser `127.0.0.1:5432` |
| Pas de dossier `prisma/migrations` | Schéma modifié mais `migrate dev` jamais lancé | `make migrate name=...` |
| Le schéma dit `Cascade`, la base fait `RESTRICT` | `onDelete` ajouté **après** la migration | Nouvelle migration : `make migrate name=...` |
| Warning « column will be lost » sur un renommage | Prisma fait `DROP` + `ADD` | `--create-only` puis `RENAME COLUMN` à la main |
| `permission denied` sur le socket Docker | User absent du groupe `docker` | `sudo usermod -aG docker $USER` puis se reconnecter |
