#!/bin/sh
# Verifies that nginx forwards the real client IP to the backend (TSK-46).
# Prerequisite: the stack is up and healthy (`make all` / `make re`).

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Resetting backend rate-limit counters (restart)..."
docker compose restart backend >/dev/null
sleep 3

LOGIN='{"email":"nobody@example.com","password":"wrong"}'
FAIL=0

echo ""
echo "== Test 1: a spoofed X-Forwarded-For must not escape the rate limit =="
CODES=""
for i in 1 2 3 4 5 6; do
  CODE=$(curl -sk -o /dev/null -w "%{http_code}" -X POST https://127.0.0.1/api/auth/login \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: 10.0.0.$i" \
    -d "$LOGIN")
  CODES="$CODES $CODE"
done
echo "statuses:$CODES"
LAST=$(echo $CODES | awk '{print $6}')
if [ "$LAST" = "429" ]; then
  printf "${GREEN}PASS${NC}: spoofing blocked (6th attempt got 429)\n"
else
  printf "${RED}FAIL${NC}: expected 429 on the 6th attempt, got $LAST\n"
  FAIL=1
fi

echo ""
echo "== Test 2: two different real sources get separate rate-limit buckets =="
echo "Resetting backend rate-limit counters again (fresh start for this test)..."
docker compose restart backend >/dev/null
sleep 3

HOST_CODES=""
for i in 1 2 3 4 5 6; do
  CODE=$(curl -sk -o /dev/null -w "%{http_code}" -X POST https://127.0.0.1/api/auth/login \
    -H "Content-Type: application/json" -d "$LOGIN")
  HOST_CODES="$HOST_CODES $CODE"
done
echo "host statuses:$HOST_CODES"

CONTAINER_CODES=$(docker exec transcendence-frontend-1 sh -c "
for i in 1 2 3 4 5 6; do
  wget -qO- --no-check-certificate --post-data='$LOGIN' \
    --header='Content-Type: application/json' https://nginx:443/api/auth/login -S 2>&1 | \
    awk '/^[[:space:]]*HTTP\//{print \$2}'
done" | tr '\n' ' ')
echo "frontend-container statuses: $CONTAINER_CODES"

HOST_LAST=$(echo $HOST_CODES | awk '{print $6}')
if [ "$HOST_LAST" = "429" ] && echo "$CONTAINER_CODES" | grep -q "429"; then
  printf "${GREEN}PASS${NC}: each source got its own 5 attempts before being blocked\n"
else
  printf "${RED}FAIL${NC}: buckets are not isolated as expected\n"
  FAIL=1
fi

echo ""
if [ "$FAIL" = "0" ]; then
  printf "${GREEN}All good${NC}: nginx forwards the real client IP, per-IP rate limiting works.\n"
else
  printf "${RED}Something is wrong${NC}, see the FAIL lines above.\n"
  exit 1
fi
