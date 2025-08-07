#!/bin/bash

# BICI Quick Test Data Clear Script
# Usage: ./clear-test-data.sh [phone_number] [--reset-lead]

# Default test phone number
DEFAULT_PHONE="6049085474"
PHONE="${1:-$DEFAULT_PHONE}"

# Remove any non-digits from phone number
PHONE_NORMALIZED=$(echo "$PHONE" | sed 's/[^0-9]//g')

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}════════════════════════════════════════════${NC}"
echo -e "${CYAN}  BICI Test Data Clear - Quick Mode${NC}"
echo -e "${CYAN}════════════════════════════════════════════${NC}"
echo ""

# Check if running TypeScript version or direct SQL
if command -v ts-node &> /dev/null && [ -f ".env" ]; then
    echo -e "${GREEN}Using TypeScript cleanup tool...${NC}"
    npx ts-node scripts/clear-test-conversations.ts "$PHONE" "$@"
else
    echo -e "${YELLOW}⚠️  TypeScript tool not available${NC}"
    echo -e "${YELLOW}Please ensure you have:${NC}"
    echo -e "  1. ts-node installed (npm install -g ts-node)"
    echo -e "  2. .env file with SUPABASE credentials"
    echo ""
    echo -e "${CYAN}Alternative: Use the Supabase dashboard to clear data manually${NC}"
    echo ""
    
    # Provide SQL queries for manual execution
    echo -e "${CYAN}SQL Queries to run in Supabase SQL Editor:${NC}"
    echo ""
    echo "-- Find lead ID"
    echo "SELECT id, customer_name, phone_number FROM leads"
    echo "WHERE phone_number_normalized = '$PHONE_NORMALIZED';"
    echo ""
    echo "-- Delete conversations (replace LEAD_ID with actual ID)"
    echo "DELETE FROM conversations WHERE lead_id = 'LEAD_ID';"
    echo "DELETE FROM conversation_summaries WHERE lead_id = 'LEAD_ID';"
    echo "DELETE FROM call_sessions WHERE lead_id = 'LEAD_ID';"
    echo ""
    
    if [[ "$*" == *"--reset-lead"* ]] || [[ "$*" == *"-r"* ]]; then
        echo "-- Reset lead data"
        echo "UPDATE leads SET"
        echo "  customer_name = NULL,"
        echo "  status = 'new',"
        echo "  sentiment = 'neutral',"
        echo "  bike_interest = '{}'::jsonb,"
        echo "  qualification_data = '{\"ready_to_buy\": false, \"contact_preference\": \"phone\"}'::jsonb,"
        echo "  last_contact_at = NULL"
        echo "WHERE id = 'LEAD_ID';"
    fi
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════════${NC}"