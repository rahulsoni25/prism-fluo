#!/bin/bash

# ════════════════════════════════════════════════════════════════
# PRISM PRODUCTION DEPLOYMENT VERIFICATION
# Verifies all critical endpoints are working after deployment
# ════════════════════════════════════════════════════════════════

set -e

# Configuration
DOMAIN="${1:-https://prism-fluo.vercel.app}"
TIMEOUT=30
SUCCESS=0
FAILED=0

echo "🚀 PRISM Production Deployment Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Domain: $DOMAIN"
echo "Started: $(date)"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test function
test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local expected_status=$4
  
  echo -n "Testing $name... "
  
  response=$(curl -s -w "\n%{http_code}" -X "$method" --max-time $TIMEOUT "$DOMAIN$endpoint" 2>/dev/null || echo "error")
  
  if [ "$response" = "error" ]; then
    echo -e "${RED}✗ FAILED${NC} (connection error)"
    FAILED=$((FAILED + 1))
    return 1
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" = "$expected_status" ]; then
    echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
    SUCCESS=$((SUCCESS + 1))
    return 0
  else
    echo -e "${RED}✗ FAILED${NC} (Expected $expected_status, got $http_code)"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

echo "📋 CORE ENDPOINTS"
echo "─────────────────────────────────────────"
test_endpoint "Health Check" "GET" "/api/health" "200"
test_endpoint "Auth Check" "GET" "/api/auth/me" "401"
test_endpoint "Version" "GET" "/api/version" "200"

echo ""
echo "🔐 AUTHENTICATION"
echo "─────────────────────────────────────────"
test_endpoint "Auth Providers" "GET" "/api/auth/providers" "200"

echo ""
echo "📊 API ENDPOINTS"
echo "─────────────────────────────────────────"
test_endpoint "Briefs List (no auth)" "GET" "/api/briefs" "401"
test_endpoint "Templates List (no auth)" "GET" "/api/templates" "401"
test_endpoint "Analyses List (no auth)" "GET" "/api/analyses" "401"

echo ""
echo "🔍 ROUTES VERIFICATION"
echo "─────────────────────────────────────────"
test_endpoint "Dashboard" "GET" "/dashboard" "200"
test_endpoint "Upload Page" "GET" "/upload" "200"
test_endpoint "Insights Page" "GET" "/insights" "200"
test_endpoint "Login Page" "GET" "/login" "200"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "✓ Passed: ${GREEN}$SUCCESS${NC}"
echo -e "✗ Failed: ${RED}$FAILED${NC}"
echo "Total:  $((SUCCESS + FAILED))"
echo "Verified: $(date)"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ DEPLOYMENT VERIFIED - ALL SYSTEMS GO!${NC}"
  exit 0
else
  echo -e "${RED}❌ DEPLOYMENT VERIFICATION FAILED${NC}"
  echo "Please check:"
  echo "  1. Vercel deployment logs: https://vercel.com/dashboard"
  echo "  2. Environment variables are set correctly"
  echo "  3. Database connection is working"
  exit 1
fi
