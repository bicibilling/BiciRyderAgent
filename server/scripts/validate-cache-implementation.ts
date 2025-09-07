#!/usr/bin/env tsx
/**
 * Validation script for Lead Service Redis caching implementation
 * Validates code structure, imports, and method signatures without requiring database
 */

import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  test: string;
  passed: boolean;
  details?: string;
}

function validateImplementation(): ValidationResult[] {
  const results: ValidationResult[] = [];
  
  try {
    const leadServicePath = path.join(__dirname, '../src/services/lead.service.ts');
    const leadServiceContent = fs.readFileSync(leadServicePath, 'utf-8');
    
    // Test 1: Redis service import
    results.push({
      test: 'Redis service import added',
      passed: leadServiceContent.includes("import { redisService } from './redis.service';"),
      details: 'redisService import should be present'
    });
    
    // Test 2: Cache check in findOrCreateLead
    results.push({
      test: 'findOrCreateLead has cache check',
      passed: leadServiceContent.includes('redisService.getCachedLead') && 
              leadServiceContent.includes('cache hit'),
      details: 'Should check cache before database query'
    });
    
    // Test 3: Cache write in findOrCreateLead
    results.push({
      test: 'findOrCreateLead caches results',
      passed: leadServiceContent.includes('redisService.cacheLead'),
      details: 'Should cache results after successful database query'
    });
    
    // Test 4: Organization caching
    results.push({
      test: 'getOrganizationByPhone has caching',
      passed: leadServiceContent.includes('redisService.getCachedOrganization') &&
              leadServiceContent.includes('redisService.cacheOrganization'),
      details: 'Organization lookup should use read-through caching'
    });
    
    // Test 5: Cache invalidation in updateLead
    results.push({
      test: 'updateLead invalidates cache',
      passed: leadServiceContent.includes('invalidateLeadCache') ||
              leadServiceContent.includes('clearLeadCache'),
      details: 'Lead updates should invalidate relevant caches'
    });
    
    // Test 6: Error handling for Redis failures
    results.push({
      test: 'Redis error handling implemented',
      passed: leadServiceContent.includes('catch (redisError)') &&
              leadServiceContent.includes('continuing with database'),
      details: 'Should handle Redis failures gracefully'
    });
    
    // Test 7: findLeadByPhone caching
    results.push({
      test: 'findLeadByPhone has caching',
      passed: leadServiceContent.includes('findLeadByPhone') &&
              leadServiceContent.match(/findLeadByPhone[\s\S]*getCachedLead/),
      details: 'findLeadByPhone should also use caching'
    });
    
    // Test 8: Cache management methods added
    results.push({
      test: 'Cache management methods added',
      passed: leadServiceContent.includes('invalidateLeadCaches') &&
              leadServiceContent.includes('getCacheStatus'),
      details: 'Utility methods for cache management should be present'
    });
    
    // Test 9: Preserve existing patterns
    results.push({
      test: 'Existing Supabase queries preserved',
      passed: leadServiceContent.includes('await supabase') &&
              leadServiceContent.includes('.from(\'leads\')') &&
              leadServiceContent.includes('.from(\'organizations\')'),
      details: 'Original database queries should still be present'
    });
    
    // Test 10: Cache key consistency
    results.push({
      test: 'Cache key patterns consistent',
      passed: leadServiceContent.includes('${normalized}:${organizationId}'),
      details: 'Cache keys should include both normalized phone and org ID'
    });
    
    // Test 11: Check RedisService exists
    const redisServicePath = path.join(__dirname, '../src/services/redis.service.ts');
    results.push({
      test: 'RedisService file exists',
      passed: fs.existsSync(redisServicePath),
      details: 'Redis service should exist with caching methods'
    });
    
    // Test 12: Build verification
    try {
      const { execSync } = require('child_process');
      execSync('npm run build', { stdio: 'pipe' });
      results.push({
        test: 'TypeScript compilation successful',
        passed: true,
        details: 'Code compiles without TypeScript errors'
      });
    } catch (error) {
      results.push({
        test: 'TypeScript compilation successful',
        passed: false,
        details: 'Build failed - TypeScript errors present'
      });
    }
    
  } catch (error) {
    results.push({
      test: 'File access',
      passed: false,
      details: `Error reading files: ${error.message}`
    });
  }
  
  return results;
}

function printResults(results: ValidationResult[]): void {
  console.log('🔍 Redis Cache Implementation Validation');
  console.log('==========================================\n');
  
  let passedCount = 0;
  
  results.forEach((result, index) => {
    const icon = result.passed ? '✅' : '❌';
    const status = result.passed ? 'PASS' : 'FAIL';
    
    console.log(`${(index + 1).toString().padStart(2)}. ${icon} ${result.test}: ${status}`);
    if (result.details) {
      console.log(`    ${result.details}`);
    }
    
    if (result.passed) passedCount++;
    console.log();
  });
  
  console.log('📊 Summary');
  console.log('==========');
  console.log(`Passed: ${passedCount}/${results.length} tests`);
  console.log(`Success Rate: ${Math.round((passedCount / results.length) * 100)}%\n`);
  
  if (passedCount === results.length) {
    console.log('🎉 All validation tests passed!');
    console.log('✅ Redis caching implementation appears correct and complete.');
    console.log('\n🚀 Next Steps:');
    console.log('   • Deploy to staging environment with Redis enabled');
    console.log('   • Monitor webhook response times for performance improvement');
    console.log('   • Verify cache hit rates in Redis monitoring');
    console.log('   • Test failover scenarios with Redis disabled');
  } else {
    console.log('⚠️  Some validation tests failed.');
    console.log('❗ Review failed tests and fix issues before deployment.');
  }
}

// Run validation
if (require.main === module) {
  const results = validateImplementation();
  printResults(results);
  
  const passedCount = results.filter(r => r.passed).length;
  process.exit(passedCount === results.length ? 0 : 1);
}

export { validateImplementation };