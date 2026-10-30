-- Une réservation active ne bloque plus la place ni le joueur de façon permanente,
-- seulement pour sa journée casino : de 8h à 5h le lendemain (fermeture 5h-8h), heure de Paris.
-- journée casino = date(arrivalAt en heure de Paris - 5h) : une arrivée à 2h compte pour la veille.

DROP INDEX "Reservation_active_seat_key";

DROP INDEX "Reservation_active_user_key";

-- Une seule réservation active par place et par journée casino
CREATE UNIQUE INDEX "Reservation_active_seat_key" ON "Reservation" (
  "seatId",
  ((("arrivalAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' - interval '5 hours')::date)
)
  WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'SEATED');

-- Une seule réservation active par joueur et par journée casino
CREATE UNIQUE INDEX "Reservation_active_user_key" ON "Reservation" (
  "userId",
  ((("arrivalAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris' - interval '5 hours')::date)
)
  WHERE "status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'SEATED');
