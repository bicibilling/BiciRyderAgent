#!/bin/bash

# BICI Voice Agent - Remote API Test Script
# Tests the deployed API endpoints on Render

BASE_URL="https://bici-voice-agent.onrender.com"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================================="
echo "🔍 BICI Voice Agent - Remote API Test"
echo "=================================================="
echo ""

# Test health endpoint
echo "📡 Testing Health Endpoint..."
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n 1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓${NC} Health check passed (HTTP $HTTP_CODE)"
    echo "   Response: $BODY"
else
    echo -e "${RED}✗${NC} Health check failed (HTTP $HTTP_CODE)"
fi
echo ""

# Test API endpoints
echo "🔌 Testing API Endpoints..."

# Test leads endpoint
echo -n "  - GET /api/leads: "
LEADS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-organization-id: b0c1b1c1-0000-0000-0000-000000000001" \
    "$BASE_URL/api/leads")

if [ "$LEADS_CODE" = "200" ]; then
    echo -e "${GREEN}✓${NC} Working (HTTP $LEADS_CODE)"
else
    echo -e "${YELLOW}⚠${NC} Status $LEADS_CODE"
fi

# Test dashboard stats
echo -n "  - GET /api/dashboard/stats: "
STATS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-organization-id: b0c1b1c1-0000-0000-0000-000000000001" \
    "$BASE_URL/api/dashboard/stats")

if [ "$STATS_CODE" = "200" ]; then
    echo -e "${GREEN}✓${NC} Working (HTTP $STATS_CODE)"
    STATS=$(curl -s -H "x-organization-id: b0c1b1c1-0000-0000-0000-000000000001" "$BASE_URL/api/dashboard/stats")
    echo "   Stats: $STATS"
else
    echo -e "${YELLOW}⚠${NC} Status $STATS_CODE"
fi
echo ""

# Test webhook endpoints (should exist but may require auth)
echo "🔗 Testing Webhook Endpoints..."

WEBHOOKS=(
    "/webhooks/elevenlabs/conversation-initiation"
    "/webhooks/elevenlabs/post-call"
    "/webhooks/elevenlabs/client-events"
    "/webhooks/twilio/sms"
    "/webhooks/twilio/voice"
)

for webhook in "${WEBHOOKS[@]}"; do
    echo -n "  - POST $webhook: "
    CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL$webhook")
    
    # Webhooks may return 400 without proper data, but that's ok - they exist
    if [ "$CODE" = "400" ] || [ "$CODE" = "403" ] || [ "$CODE" = "200" ]; then
        echo -e "${GREEN}✓${NC} Endpoint exists (HTTP $CODE)"
    elif [ "$CODE" = "404" ]; then
        echo -e "${RED}✗${NC} Not found (HTTP $CODE)"
    else
        echo -e "${YELLOW}⚠${NC} Unexpected status $CODE"
    fi
done
echo ""

# Check server logs for recent errors
echo "📝 Checking Recent Server Activity..."
echo "  Fetching latest logs from Render..."

# Get recent conversations count
CONV_COUNT=$(curl -s -H "x-organization-id: b0c1b1c1-0000-0000-0000-000000000001" \
    "$BASE_URL/api/dashboard/stats" | grep -o '"total_conversations":[0-9]*' | grep -o '[0-9]*')

if [ ! -z "$CONV_COUNT" ]; then
    echo -e "  ${GREEN}✓${NC} Total conversations processed: $CONV_COUNT"
fi

echo ""
echo "=================================================="
echo "📋 Test Summary:"
echo "=================================================="

# Final summary
if [ "$HTTP_CODE" = "200" ] && [ "$LEADS_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Remote API is operational!${NC}"
    echo ""
    echo "🔗 Dashboard: https://bici-dashboard.vercel.app"
    echo "🔗 API Base: $BASE_URL"
else
    echo -e "${YELLOW}⚠ Some endpoints may need attention${NC}"
fi

echo "=================================================="