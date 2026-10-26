-- Données de dev : casinos, tables, sièges, users (l'équipe), memberships,
-- réservations, paiements, notifications.
-- UUID fixes : les mêmes ids après chaque `make re`.
-- Rejouable : ON CONFLICT DO NOTHING, ne casse pas si déjà importé.
--
-- Import (après `make re`, les migrations sont appliquées au démarrage du backend) :
--   docker exec -i transcendence-db-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < backend/prisma/seed/seed_dev.sql

BEGIN;

-- ─── Casinos ────────────────────────────────────────────────
INSERT INTO "Casino" (id, name, city, address, "updatedAt", "deletedAt") VALUES
  ('c0000000-0000-4000-8000-000000000001', 'Casino Lumière', 'Lyon',      '1 quai Saint-Antoine', now(), NULL),
  ('c0000000-0000-4000-8000-000000000002', 'Casino du Port', 'Marseille', '12 quai du Port',      now(), NULL),
  -- casino supprimé (soft delete)
  ('c0000000-0000-4000-8000-000000000003', 'Casino Fermé',   'Paris',     '5 rue Close',          now(), now())
ON CONFLICT (id) DO NOTHING;

-- ─── Tables ─────────────────────────────────────────────────
INSERT INTO "PokerTable"
  (id, "casinoId", name, variant, "smallBlind", "bigBlind", "maxSeats", status, "moneyOnTable", "updatedAt", "deletedAt")
VALUES
  -- Lyon
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Table 1',      'TEXAS_HOLDEM',  1,   2, 10, 'OPEN',    0,     now(), NULL),
  ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Table 2',      'TEXAS_HOLDEM',  5,  10,  6, 'OPEN',    1500,  now(), NULL),
  ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'Omaha High',   'OMAHA',         5,  10,  8, 'OPEN',    4200,  now(), NULL),
  ('a0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'Heads-up',     'TEXAS_HOLDEM', 50, 100,  2, 'PAUSED',  0,     now(), NULL),
  -- Marseille
  ('a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000002', 'Table Vieux-Port', 'TEXAS_HOLDEM', 2, 2, 9, 'OPEN', 800,   now(), NULL),
  ('a0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000002', 'Omaha Pot-Limit',  'OMAHA',        10, 20, 6, 'OPEN', 9000, now(), NULL),
  -- table supprimée (soft delete) : GET /tables ne doit pas la renvoyer, GET /tables/:id → 404
  ('a0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001', 'Ancienne table', 'TEXAS_HOLDEM', 5, 10, 6, 'OPEN', 0, now(), now()),
  -- Paris (casino supprimé) : table et sièges non supprimés eux-mêmes,
  -- POST /reservations sur un de ces sièges → 404 via le casino
  ('a0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000003', 'Table Paris',    'TEXAS_HOLDEM', 1, 2, 6, 'OPEN', 0, now(), NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── Sièges ─────────────────────────────────────────────────
-- Un siège par numéro, de 1 à maxSeats, pour chaque table.
-- id déterministe : md5(tableId-numéro) converti en uuid.
-- Les caractères 13 et 17 sont forcés à '4' et '8' pour obtenir un UUID v4
-- valide : sinon @IsUUID() (class-validator) refuse l'id et renvoie 400.
INSERT INTO "Seat" (id, "tableId", "seatNumber", status)
SELECT overlay(overlay(md5(t.id || '-' || n) placing '4' from 13) placing '8' from 17)::uuid::text,
       t.id, n, 'FREE'
FROM "PokerTable" t
CROSS JOIN LATERAL generate_series(1, t."maxSeats") AS n
WHERE t.id LIKE 'a0000000-0000-4000-8000-%'
ON CONFLICT ("tableId", "seatNumber") DO NOTHING;

-- Quelques sièges occupés
UPDATE "Seat" SET status = 'OCCUPIED'
WHERE ("tableId", "seatNumber") IN (
  ('a0000000-0000-4000-8000-000000000002', 1),
  ('a0000000-0000-4000-8000-000000000002', 4),
  ('a0000000-0000-4000-8000-000000000003', 2),
  ('a0000000-0000-4000-8000-000000000004', 1),
  ('a0000000-0000-4000-8000-000000000004', 2)
);

-- Siège supprimé (soft delete) : Table 1 doit renvoyer 9 sièges, pas 10
UPDATE "Seat" SET "deletedAt" = now()
WHERE "tableId" = 'a0000000-0000-4000-8000-000000000001' AND "seatNumber" = 10;

-- ─── Users (l'équipe) ───────────────────────────────────────
-- Pas de mot de passe (passwordHash NULL) : l'auth n'existe pas encore,
-- on passe le userId dans le body de POST /reservations.
-- pseudo en minuscules (règle du schéma).
-- DO UPDATE : relancer le seed remet les users dans cet état.
INSERT INTO "User"
  (id, email, pseudo, "passwordHash", "firstName", "lastName", "birthDate", phone, role, "updatedAt", "deletedAt")
VALUES
  ('b0000000-0000-4000-8000-000000000001', 'frederic.ducrot@dev.local',       'fred',  NULL, 'Frédéric', 'Ducrot',          '1990-01-01', '0600000001', 'ADMIN', now(), NULL),
  ('b0000000-0000-4000-8000-000000000002', 'leo.granger@dev.local',           'leo',   NULL, 'Léo',      'Granger',         '1990-01-01', NULL,         'USER',  now(), NULL),
  ('b0000000-0000-4000-8000-000000000003', 'dusan.fama@dev.local',            'dusan', NULL, 'Dusan',    'Fama',            '1990-01-01', NULL,         'USER',  now(), NULL),
  ('b0000000-0000-4000-8000-000000000004', 'lucas.debarnot@dev.local',        'lucas', NULL, 'Lucas',    'Debarnot',        '1990-01-01', NULL,         'USER',  now(), NULL),
  ('b0000000-0000-4000-8000-000000000005', 'lylah.andrianarijaona@dev.local', 'lylah', NULL, 'Lylah',    'Andrianarijaona', '1990-01-01', NULL,         'USER',  now(), NULL),
  -- user supprimé (RGPD, soft delete) : cas limite pour les règles d'accès
  ('b0000000-0000-4000-8000-000000000006', 'ghost@dev.local',                 'ghost', NULL, 'Ghost',    'Deleted',         '1990-01-01', NULL,         'USER',  now(), now())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email, pseudo = EXCLUDED.pseudo, "firstName" = EXCLUDED."firstName",
  "lastName" = EXCLUDED."lastName", phone = EXCLUDED.phone, role = EXCLUDED.role,
  "updatedAt" = now(), "deletedAt" = EXCLUDED."deletedAt";

-- ─── Memberships (staff des casinos) ────────────────────────
INSERT INTO "Membership" (id, "userId", "casinoId", role) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'OWNER'), -- Lucas, Lyon
  ('f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'FLOOR'), -- Lylah, Lyon
  ('f0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'OWNER')  -- Dusan, Marseille
ON CONFLICT (id) DO NOTHING;

-- ─── Réservations ───────────────────────────────────────────
-- Index partiels : une seule réservation active (PENDING_PAYMENT, CONFIRMED,
-- SEATED) par place ET par joueur.
--
-- Actives (servent aux tests de conflit 409) :
--   Léo   CONFIRMED       Table 2 #5      → réserver Table 2 #5 = 409 « place prise »
--                                          → Léo réserve ailleurs = 409 « joueur déjà réservé »
--   Lylah PENDING_PAYMENT Omaha High #1
--   Lucas SEATED          Table 2 #4      (siège OCCUPIED)
-- Libres pour POST /reservations : Frédéric et Dusan (historique seulement).
--
-- Dates relatives à now() au premier import : `make re` pour les rafraîchir.
INSERT INTO "Reservation"
  (id, "userId", "seatId", status, "arrivalAt", "seatedAt", "leftAt", "cancelledAt", "createdAt", "updatedAt")
SELECT r.id, r.user_id, s.id, r.status::"ReservationStatus",
       r.arrival_at, r.seated_at, r.left_at, r.cancelled_at, r.created_at, now()
FROM (VALUES
  -- actives
  ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 5, 'CONFIRMED',
   now() + interval '2 hours', NULL::timestamp, NULL::timestamp, NULL::timestamp, now() - interval '1 hour'),
  ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000003', 1, 'PENDING_PAYMENT',
   now() + interval '1 hour', NULL, NULL, NULL, now() - interval '5 minutes'),
  ('e0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', 4, 'SEATED',
   now() - interval '1 hour', now() - interval '50 minutes', NULL, NULL, now() - interval '3 hours'),
  -- historique
  ('e0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 3, 'COMPLETED',
   now() - interval '1 day', now() - interval '1 day' + interval '10 minutes', now() - interval '1 day' + interval '4 hours', NULL, now() - interval '2 days'),
  ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 2, 'CANCELLED',
   now() - interval '2 days', NULL, NULL, now() - interval '3 days', now() - interval '4 days'),
  ('e0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005', 1, 'NO_SHOW',
   now() - interval '1 day', NULL, NULL, NULL, now() - interval '2 days'),
  ('e0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000006', 2, 'EXPIRED',
   now() - interval '3 days', NULL, NULL, NULL, now() - interval '3 days' - interval '1 hour')
) AS r(id, user_id, table_id, seat_number, status, arrival_at, seated_at, left_at, cancelled_at, created_at)
JOIN "Seat" s ON s."tableId" = r.table_id AND s."seatNumber" = r.seat_number
ON CONFLICT (id) DO NOTHING;

-- ─── Paiements ──────────────────────────────────────────────
-- amount en centimes (convention Stripe). Ids Stripe factices.
INSERT INTO "Payment"
  (id, "reservationId", amount, status, "stripePaymentIntentId", "stripeRefundId", "createdAt", "paidAt", "refundedAt")
VALUES
  ('90000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 20000, 'SUCCEEDED', 'pi_dev_0001', NULL,          now() - interval '1 hour',    now() - interval '1 hour', NULL),
  ('90000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 10000, 'PENDING',   'pi_dev_0002', NULL,          now() - interval '5 minutes', NULL,                      NULL),
  ('90000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003', 50000, 'SUCCEEDED', 'pi_dev_0003', NULL,          now() - interval '3 hours',   now() - interval '3 hours', NULL),
  ('90000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000004', 20000, 'SUCCEEDED', 'pi_dev_0004', NULL,          now() - interval '2 days',    now() - interval '2 days', NULL),
  -- annulation et no-show : remboursés (règles v1)
  ('90000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000005', 10000, 'REFUNDED',  'pi_dev_0005', 're_dev_0005', now() - interval '4 days',    now() - interval '4 days', now() - interval '3 days'),
  ('90000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000006', 10000, 'REFUNDED',  'pi_dev_0006', 're_dev_0006', now() - interval '2 days',    now() - interval '2 days', now() - interval '1 day'),
  -- expirée : paiement jamais abouti
  ('90000000-0000-4000-8000-000000000007', 'e0000000-0000-4000-8000-000000000007', 10000, 'FAILED',    'pi_dev_0007', NULL,          now() - interval '3 days',    NULL,                      NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── Notifications ──────────────────────────────────────────
-- readAt NULL = non lue.
INSERT INTO "Notification" (id, "userId", "reservationId", type, params, "createdAt", "readAt") VALUES
  ('70000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'RESERVATION_CONFIRMED',
   '{"tableName": "Table 2", "seatNumber": 5}', now() - interval '1 hour', NULL),
  ('70000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000005', 'RESERVATION_CANCELLED',
   '{"tableName": "Table 2", "seatNumber": 2}', now() - interval '3 days', now() - interval '3 days'),
  ('70000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', NULL, 'SEAT_FREED',
   '{"tableName": "Table Vieux-Port", "seatNumber": 1}', now() - interval '1 day', NULL)
ON CONFLICT (id) DO NOTHING;

COMMIT;
