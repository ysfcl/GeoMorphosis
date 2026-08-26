#!/bin/bash
# Rate limit test scripti
# Kullanim: bash brutal.sh
# Varsayilan: http://localhost:3000/api/analyze
# Farkli adres: bash brutal.sh http://geomorphosis.com.tr/api/analyze

BASE_URL="${1:-http://localhost:3000/api/analyze}"

# Gecerli bir payload (minumum gereksinimleri karsilayan)
PAYLOAD='{"start_points":[{"lat":39.69,"lon":37.74}],"end_points":[{"lat":39.70,"lon":37.75}],"buffer_meters":500,"region_name":"test"}'

echo "========================================="
echo "  RATE LIMIT TEST - $BASE_URL"
echo "  6 hizli istek atilacak (limit: 5/dk)"
echo "========================================="
echo ""

for i in $(seq 1 6); do
  echo "--- Istek $i / 6 ---"
  HTTP_CODE=$(curl -s -o /tmp/ratelimit_response.txt -w "%{http_code}" \
    -X POST "$BASE_URL" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

  BODY=$(cat /tmp/ratelimit_response.txt)

  if [ "$HTTP_CODE" = "429" ]; then
    echo "  Status: $HTTP_CODE (RATE LIMIT VURULDU)"
    echo "  Yanit: $BODY"
  elif [ "$HTTP_CODE" = "502" ]; then
    echo "  Status: $HTTP_CODE (AI Engine yuklu degil - beklenen)"
    echo "  Yanit: $BODY"
  elif [ "$HTTP_CODE" = "200" ]; then
    echo "  Status: $HTTP_CODE (Basarili)"
    echo "  Yanit: $BODY"
  else
    echo "  Status: $HTTP_CODE"
    echo "  Yanit: $BODY"
  fi
  echo ""

  # Istekler arasinda 100ms bekleme (cok hizli olmasin ki sirayla artsin)
  sleep 0
done

echo "========================================="
echo "  EGER 5. ISTEKTEN SONRA 429 DONUYORSA"
echo "  RATE LIMIT CALISIYOR DEMEKTIR"
echo "========================================="
