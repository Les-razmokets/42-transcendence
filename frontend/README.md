# Frontend — Transcendence

## 🚀 Première fois que tu ouvres le projet

Prérequis : avoir [nvm](https://github.com/nvm-sh/nvm) installé.

```bash
# 1. Va dans le dossier frontend
cd frontend

# 2. Passe sur la version de Node du projet (Node 24, lue dans .nvmrc)
nvm install     # seulement la première fois, si tu n'as pas encore Node 24
nvm use

# 3. Installe les dépendances EXACTES du projet (⚠️ PAS NPM INSTALL !)
npm ci

# 4. Installe le navigateur pour les tests Storybook (une seule fois par machine)
npx playwright install chromium

# 5. Lance l'app
npm run dev
```

> [!CAUTION]
> **PAS `NPM INSTALL` !** Utilise toujours `npm ci` pour installer le projet. `npm install` peut modifier le `package-lock.json` et installer des versions différentes de celles de l'équipe.

Ouvre ensuite **http://localhost:5173**. Si la page s'affiche, tout est bon ✅

---

## 🔁 Chaque jour

```bash
git pull
nvm use
npm ci          # seulement si package-lock.json a changé
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
2. `npm i <paquet>` (ou `npm i -D <paquet>` pour un outil de dev).
3. Commit **ensemble** `package.json` **et** `package-lock.json`.
4. Une PR = un ajout de dépendance.

⚠️ Ne jamais commit `node_modules/` (déjà dans le `.gitignore`).

**Conflit sur `package-lock.json` ?** Ne le corrige pas à la main : garde le `package.json` fusionné, lance `npm install` pour régénérer le lock, puis commit.

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
- **Warning `install-scripts` sur `fsevents`** → sans gravité (paquet macOS pour surveiller les fichiers). Il est déjà autorisé dans `allowScripts`. S'il revient après une mise à jour, refais `npm install-scripts approve fsevents` et commit le `package.json`.
