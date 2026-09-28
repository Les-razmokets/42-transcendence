## Ticket

TSK-

## Quoi / pourquoi

<!-- Ce que fait la PR et pourquoi, en 2-3 phrases. -->

## Choix à valider par l'équipe

<!-- Décisions discutables (ex : onDelete: Cascade sur Casino.owner). Supprimer la section si aucune. -->

## Comment tester

```bash
make re
```

<!-- Étapes pour vérifier le changement. -->

## Checklist

- [ ] La branche est à jour avec `main`
- [ ] `make re` passe sur une base neuve
- [ ] Pas de secret ni de `.env` dans le diff
- [ ] Doc mise à jour si besoin (`docs/`)

### Si la PR touche la base de données

- [ ] `npx prisma format` lancé
- [ ] `schema.prisma` et la migration sont dans le même commit
