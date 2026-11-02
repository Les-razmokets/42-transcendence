# Frontend — Transcendence

## 🚀 Première fois que tu ouvres le projet

Prérequis : avoir [nvm](https://github.com/nvm-sh/nvm) installé.

```bash
# 1. Va dans le dossier frontend
cd frontend

# 2. Passe sur la version de Node du projet (Node 24, lue dans .nvmrc)
nvm install     # seulement la première fois, si tu n'as pas encore Node 24
nvm use

# 3. Installe les dépendances EXACTES du projet, depuis la RACINE du repo (⚠️ PAS NPM INSTALL !)
cd ..
npm ci
cd frontend

# 4. Installe le navigateur pour les tests Storybook (une seule fois par machine)
npx playwright install chromium

# 5. Lance l'app
npm run dev
```

> [!CAUTION]
> **PAS `NPM INSTALL` !** Utilise toujours `npm ci` pour installer le projet. `npm install` peut modifier le `package-lock.json` et installer des versions différentes de celles de l'équipe.

> [!IMPORTANT]
> **`npm ci` se lance à la racine du repo, pas dans `frontend/`.** Le repo est un monorepo npm workspaces (`backend`, `frontend`, `shared`) avec **un seul** `package-lock.json`, à la racine. Une seule installation suffit pour tout le monde. Le front utilise aussi le package `@transcendence/shared` (types et enums communs avec le back) : voir [`docs/shared.md`](../docs/shared.md).

Ouvre ensuite **http://localhost:5173**. Si la page s'affiche, tout est bon ✅

---

## 🔁 Chaque jour

```bash
git pull
nvm use
(cd .. && npm ci)    # seulement si package-lock.json (à la racine) a changé
npm run dev
```

## 📜 Les commandes

| Commande | À quoi ça sert |
|---|---|
| `npm run dev` | lance l'app sur http://localhost:5173 (se recharge toute seule) |
| `npm run storybook` | lance Storybook sur http://localhost:6006 pour voir chaque composant seul |
| `npm run lint` | vérifie le code avec Oxlint (à faire avant de commit) |
| `npm run build` | vérifie TypeScript et construit le site final dans `dist/` |
| `npx vitest` | lance les tests |

Pour arrêter un serveur : `Ctrl + C`.

## 📦 Ajouter une dépendance

1. Préviens l'autre avant d'en ajouter une.
2. Depuis la **racine** du repo : `npm i <paquet> -w frontend` (ou `npm i -D <paquet> -w frontend` pour un outil de dev).
3. Commit **ensemble** `frontend/package.json` **et** le `package-lock.json` de la racine.
4. Une PR = un ajout de dépendance.

⚠️ Ne jamais commit `node_modules/` (déjà dans le `.gitignore`).

⚠️ Si un `frontend/package-lock.json` apparaît, c'est qu'une commande npm a été lancée sans `-w` depuis `frontend/` : supprime-le, il n'a rien à faire là.

**Conflit sur `package-lock.json` ?** Ne le corrige pas à la main : garde les `package.json` fusionnés, lance `npm install` **à la racine** pour régénérer le lock, puis commit.

## 🗂️ Où ranger quoi

```
src/
├── design-system/
│   ├── tokens/        couleurs, espacements, polices
│   ├── icons/
│   ├── primitives/    petits composants de base (Bouton, Badge, Avatar…)
│   └── composites/    composants faits de primitives (CarteTable, EnTete…)
├── features/          les écrans par domaine (auth, booking, lobby, table, account)
├── lib/               outils partagés (i18n, appels API…)
└── three/             tout ce qui concerne la 3D
public/
├── images/
└── models/            les fichiers .glb
```

## 🧩 Un composant = 5 fichiers

Exemple avec `design-system/primitives/Bouton/` :

1. `Bouton.tsx` : le composant lui-même
2. `Bouton.module.css` : son apparence, avec les tokens
3. `Bouton.stories.tsx` : la story, pour lancer le composant seul dans Storybook
4. `Bouton.test.tsx` : le test qui vérifie qu'il fonctionne
5. `index.ts` : la porte d'entrée, pour l'importer facilement partout (comme un `.h`)

## 🛠️ Les outils

| Outil | Rôle |
|---|---|
| Vite | serveur de dev et build |
| React + TypeScript | l'app |
| Oxlint | repère les bugs probables (même linter que le back) |
| Prettier | formatage identique pour tout le monde |
| Vitest + Testing Library | les tests |
| Storybook | voir et tester chaque composant seul |
| Three.js + React Three Fiber + Drei | la table 3D |
| GSAP | les animations de caméra |
| i18next | les 4 langues |
| React Router | les pages et les URL |

## ❓ Ça ne marche pas

- **`npm ci` échoue** → vérifie `node -v`. Ça doit afficher `v24.x`. Sinon, fais `nvm use` dans `frontend/`.
- **`nvm: command not found`** → nvm n'est pas chargé dans ton terminal. Vérifie qu'il est bien dans ton `~/.zshrc`, puis ouvre un nouveau terminal.
- **Port 5173 déjà utilisé** → un autre `npm run dev` tourne déjà quelque part. Ferme-le.
- **Les tests Storybook plantent sur « browser not found »** → refais `npx playwright install chromium`.
- **Warning `install-scripts` sur `fsevents`** → sans gravité (paquet macOS pour surveiller les fichiers). Il est déjà autorisé dans `allowScripts`. S'il revient après une mise à jour, refais `npm install-scripts approve fsevents` **à la racine** et commit le `package.json` de la racine (c'est lui qui contient `allowScripts`).
- **`Cannot find module '@transcendence/shared'`** → l'installation n'a pas été faite depuis la racine. Lance `npm ci` à la racine du repo.
