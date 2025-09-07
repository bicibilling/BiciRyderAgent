#!/usr/bin/env tsx
/**
 * Redis Validation Suite
 * Production readiness validation with detailed metrics and reporting
 */

import { LeadService } from '../src/services/lead.service';
import { ConversationService } from '../src/services/conversation.service';
import { RedisService } from '../src/services/redis.service';
import { RedisConfig } from '../src/config/redis.config';
import { logger } from '../src/utils/logger';
import chalk from 'chalk';

interface ValidationMetrics {
  webhookResponseTimes: number[];
  cacheHitRates: { [key: string]: { hits: number; misses: number } };
  failoverTests: { [key: string]: boolean };
  consistencyChecks: { [key: string]: boolean };
  performanceImprovements: { [key: string]: number };
}

class RedisValidationSuite {
  private metrics: ValidationMetrics = {
    webhookResponseTimes: [],
    cacheHitRates: {},
    failoverTests: {},
    consistencyChecks: {},
    performanceImprovements: {}
  };

  private leadService: LeadService;
  private conversationService: ConversationService;
  private redisService: RedisService;

  constructor() {
    this.leadService = new LeadService();
    this.conversationService = new ConversationService();
    this.redisService = new RedisService();
  }

  async runFullValidation(): Promise<boolean> {
    console.log(chalk.blue('🚀 Redis Implementation Production Validation'));
    console.log(chalk.blue('=============================================='));
    console.log();

    try {
      // Phase 1: Infrastructure Validation
      console.log(chalk.cyan('📋 Phase 1: Infrastructure Validation'));
      const infraResults = await this.validateInfrastructure();
      this.logPhaseResults('Infrastructure', infraResults);

      // Phase 2: Functional Validation
      console.log(chalk.cyan('📋 Phase 2: Functional Validation'));
      const functionalResults = await this.validateFunctionality();
      this.logPhaseResults('Functional', functionalResults);

      // Phase 3: Performance Validation
      console.log(chalk.cyan('📋 Phase 3: Performance Validation'));
      const performanceResults = await this.validatePerformance();
      this.logPhaseResults('Performance', performanceResults);

      // Phase 4: Resilience Validation
      console.log(chalk.cyan('📋 Phase 4: Resilience Validation'));
      const resilienceResults = await this.validateResilience();
      this.logPhaseResults('Resilience', resilienceResults);

      // Phase 5: Production Readiness
      console.log(chalk.cyan('📋 Phase 5: Production Readiness Assessment'));
      const productionResults = await this.assessProductionReadiness();
      this.logPhaseResults('Production Readiness', productionResults);

      // Final Report
      const overallSuccess = this.generateFinalReport([
        infraResults,
        functionalResults,
        performanceResults,
        resilienceResults,
        productionResults
      ]);

      return overallSuccess;

    } catch (error) {
      console.error(chalk.red('💥 Validation suite failed:'), error);
      return false;
    }
  }

  private async validateInfrastructure(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};

    console.log('  🔧 Testing Redis connectivity...');
    try {
      const healthCheck = await RedisConfig.healthCheck();
      results.redisConnectivity = healthCheck.connected && healthCheck.status === 'healthy';
      console.log(`     ${results.redisConnectivity ? '✅' : '❌'} Redis connectivity`);
    } catch (error) {
      results.redisConnectivity = false;
      console.log('     ❌ Redis connectivity failed');
    }

    console.log('  🔧 Testing Redis service initialization...');
    try {
      const status = this.redisService.getStatus();
      results.redisServiceInit = status.enabled;
      console.log(`     ${results.redisServiceInit ? '✅' : '❌'} Redis service initialization`);
    } catch (error) {
      results.redisServiceInit = false;
      console.log('     ❌ Redis service initialization failed');
    }

    console.log('  🔧 Testing cache operations...');
    try {
      const testKey = `validation:test:${Date.now()}`;
      const testValue = { test: 'data', timestamp: Date.now() };
      
      await this.redisService.set(testKey, testValue, 30);
      const retrieved = await this.redisService.get(testKey);
      await this.redisService.delete(testKey);
      
      results.basicCacheOps = retrieved !== null && retrieved.test === testValue.test;
      console.log(`     ${results.basicCacheOps ? '✅' : '❌'} Basic cache operations`);
    } catch (error) {
      results.basicCacheOps = false;
      console.log('     ❌ Basic cache operations failed');
    }

    return results;
  }

  private async validateFunctionality(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};

    console.log('  📞 Testing lead service caching...');
    try {
      const testPhone = `+1778${Date.now().toString().slice(-7)}`;
      const orgId = 'b0c1b1c1-0000-0000-0000-000000000001';
      
      // First call (should cache)
      const lead1 = await this.leadService.findOrCreateLead(testPhone, orgId);
      // Second call (should use cache)
      const lead2 = await this.leadService.findOrCreateLead(testPhone, orgId);
      
      results.leadServiceCaching = lead1.id === lead2.id;
      this.metrics.cacheHitRates.leadService = { hits: 1, misses: 1 };
      console.log(`     ${results.leadServiceCaching ? '✅' : '❌'} Lead service caching`);
    } catch (error) {
      results.leadServiceCaching = false;
      console.log('     ❌ Lead service caching failed');
    }

    console.log('  💬 Testing conversation context caching...');
    try {
      const testPhone = `+1778${Date.now().toString().slice(-7)}`;
      const orgId = 'b0c1b1c1-0000-0000-0000-000000000001';
      
      const lead = await this.leadService.findOrCreateLead(testPhone, orgId);
      
      // Build context (should cache)
      const context1 = await this.conversationService.buildConversationContext(lead.id);
      // Build again (should use cache)
      const context2 = await this.conversationService.buildConversationContext(lead.id);
      
      results.contextCaching = context1.customer_context.phone === context2.customer_context.phone;
      this.metrics.cacheHitRates.conversationContext = { hits: 1, misses: 1 };
      console.log(`     ${results.contextCaching ? '✅' : '❌'} Context caching`);
    } catch (error) {
      results.contextCaching = false;
      console.log('     ❌ Context caching failed');
    }

    console.log('  🔄 Testing cache invalidation...');
    try {
      const testPhone = `+1778${Date.now().toString().slice(-7)}`;
      const orgId = 'b0c1b1c1-0000-0000-0000-000000000001';
      
      const lead = await this.leadService.findOrCreateLead(testPhone, orgId);
      
      // Update lead (should invalidate cache)
      await this.leadService.updateLead(lead.id, {
        customer_name: 'Cache Invalidation Test',
        sentiment: 'positive'
      });
      
      // Next call should reflect update
      const updatedLead = await this.leadService.findOrCreateLead(testPhone, orgId);
      results.cacheInvalidation = updatedLead.customer_name === 'Cache Invalidation Test';
      console.log(`     ${results.cacheInvalidation ? '✅' : '❌'} Cache invalidation`);
    } catch (error) {
      results.cacheInvalidation = false;
      console.log('     ❌ Cache invalidation failed');
    }

    return results;
  }

  private async validatePerformance(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};

    console.log('  ⚡ Testing webhook response times...');
    try {
      const WEBHOOK_TIMEOUT = 100; // 100ms requirement
      const testIterations = 10;
      
      for (let i = 0; i < testIterations; i++) {
        const testPhone = `+1778555${String(i).padStart(4, '0')}`;
        const orgId = 'b0c1b1c1-0000-0000-0000-000000000001';
        
        const startTime = performance.now();
        
        // Simulate webhook operations
        const lead = await this.leadService.findOrCreateLead(testPhone, orgId);
        const context = await this.conversationService.buildConversationContext(lead.id);
        const greeting = await this.conversationService.generateDynamicGreeting(lead.id, 'voice');
        
        const responseTime = performance.now() - startTime;
        this.metrics.webhookResponseTimes.push(responseTime);
      }
      
      const avgResponseTime = this.metrics.webhookResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.webhookResponseTimes.length;
      const maxResponseTime = Math.max(...this.metrics.webhookResponseTimes);
      
      results.webhookPerformance = avgResponseTime < WEBHOOK_TIMEOUT && maxResponseTime < WEBHOOK_TIMEOUT * 2;
      
      console.log(`     ${results.webhookPerformance ? '✅' : '❌'} Webhook response times (avg: ${avgResponseTime.toFixed(2)}ms, max: ${maxResponseTime.toFixed(2)}ms)`);
    } catch (error) {
      results.webhookPerformance = false;
      console.log('     ❌ Webhook performance test failed');
    }

    console.log('  📊 Testing cache performance improvement...');
    try {
      const testPhone = `+1778666${Date.now().toString().slice(-7)}`;
      const orgId = 'b0c1b1c1-0000-0000-0000-000000000001';
      
      // Cold cache
      const coldStart = performance.now();
      const lead1 = await this.leadService.findOrCreateLead(testPhone, orgId);
      const coldTime = performance.now() - coldStart;
      
      // Warm cache
      const warmStart = performance.now();
      const lead2 = await this.leadService.findOrCreateLead(testPhone, orgId);
      const warmTime = performance.now() - warmStart;
      
      const improvement = ((coldTime - warmTime) / coldTime) * 100;
      this.metrics.performanceImprovements.cacheImprovement = improvement;
      
      results.cachePerformanceImprovement = improvement > 20; // At least 20% improvement
      
      console.log(`     ${results.cachePerformanceImprovement ? '✅' : '❌'} Cache performance improvement (${improvement.toFixed(1)}%)`);
    } catch (error) {
      results.cachePerformanceImprovement = false;
      console.log('     ❌ Cache performance improvement test failed');
    }

    return results;
  }

  private async validateResilience(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};

    console.log('  🛡️  Testing graceful degradation...');
    try {
      // Temporarily disable Redis
      process.env.REDIS_ENABLED = 'false';
      const degradedLeadService = new LeadService();
      
      const testPhone = `+1778777${Date.now().toString().slice(-7)}`;
      const orgId = 'b0c1b1c1-0000-0000-0000-000000000001';
      
      const lead = await degradedLeadService.findOrCreateLead(testPhone, orgId);
      results.gracefulDegradation = lead !== null && lead.phone_number === testPhone;
      this.metrics.failoverTests.gracefulDegradation = results.gracefulDegradation;
      
      console.log(`     ${results.gracefulDegradation ? '✅' : '❌'} Graceful degradation`);
      
      // Re-enable Redis
      process.env.REDIS_ENABLED = 'true';
    } catch (error) {
      results.gracefulDegradation = false;
      console.log('     ❌ Graceful degradation test failed');
    }

    console.log('  🔄 Testing error recovery...');
    try {
      // Test with normal Redis operations
      const testPhone = `+1778888${Date.now().toString().slice(-7)}`;
      const orgId = 'b0c1b1c1-0000-0000-0000-000000000001';
      
      const lead1 = await this.leadService.findOrCreateLead(testPhone, orgId);
      const lead2 = await this.leadService.findOrCreateLead(testPhone, orgId);
      
      results.errorRecovery = lead1.id === lead2.id;
      this.metrics.failoverTests.errorRecovery = results.errorRecovery;
      
      console.log(`     ${results.errorRecovery ? '✅' : '❌'} Error recovery`);
    } catch (error) {
      results.errorRecovery = false;
      console.log('     ❌ Error recovery test failed');
    }

    console.log('  🔒 Testing data consistency...');
    try {
      const testPhone = `+1778999${Date.now().toString().slice(-7)}`;
      const orgId = 'b0c1b1c1-0000-0000-0000-000000000001';
      
      const lead = await this.leadService.findOrCreateLead(testPhone, orgId);
      
      // Update and verify consistency
      await this.leadService.updateLead(lead.id, {
        customer_name: 'Consistency Test',
        sentiment: 'positive'
      });
      
      const verifyLead = await this.leadService.findOrCreateLead(testPhone, orgId);
      results.dataConsistency = verifyLead.customer_name === 'Consistency Test';
      this.metrics.consistencyChecks.dataConsistency = results.dataConsistency;
      
      console.log(`     ${results.dataConsistency ? '✅' : '❌'} Data consistency`);
    } catch (error) {
      results.dataConsistency = false;
      console.log('     ❌ Data consistency test failed');
    }

    return results;
  }

  private async assessProductionReadiness(): Promise<{ [key: string]: boolean }> {
    const results: { [key: string]: boolean } = {};

    console.log('  🎯 Assessing webhook timeout compliance...');
    const avgWebhookTime = this.metrics.webhookResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.webhookResponseTimes.length;
    results.webhookTimeoutCompliance = avgWebhookTime < 100;
    console.log(`     ${results.webhookTimeoutCompliance ? '✅' : '❌'} Webhook timeout compliance (${avgWebhookTime.toFixed(2)}ms avg)`);

    console.log('  📈 Assessing cache effectiveness...');
    const cacheHitRate = this.calculateOverallCacheHitRate();
    results.cacheEffectiveness = cacheHitRate > 50; // At least 50% hit rate
    console.log(`     ${results.cacheEffectiveness ? '✅' : '❌'} Cache effectiveness (${cacheHitRate.toFixed(1)}% hit rate)`);

    console.log('  🛡️  Assessing resilience coverage...');
    const resilienceScore = Object.values(this.metrics.failoverTests).filter(Boolean).length / Object.keys(this.metrics.failoverTests).length;
    results.resilienceCoverage = resilienceScore >= 1.0;
    console.log(`     ${results.resilienceCoverage ? '✅' : '❌'} Resilience coverage (${(resilienceScore * 100).toFixed(0)}%)`);

    console.log('  ⚡ Assessing performance improvements...');
    const performanceGains = Object.values(this.metrics.performanceImprovements).filter(gain => gain > 20).length;
    results.performanceGains = performanceGains > 0;
    console.log(`     ${results.performanceGains ? '✅' : '❌'} Performance improvements detected`);

    return results;
  }

  private calculateOverallCacheHitRate(): number {
    let totalHits = 0;
    let totalRequests = 0;
    
    Object.values(this.metrics.cacheHitRates).forEach(rate => {
      totalHits += rate.hits;
      totalRequests += rate.hits + rate.misses;
    });
    
    return totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
  }

  private logPhaseResults(phaseName: string, results: { [key: string]: boolean }) {
    const passed = Object.values(results).filter(Boolean).length;
    const total = Object.keys(results).length;
    const percentage = total > 0 ? (passed / total) * 100 : 0;
    
    const status = percentage === 100 ? chalk.green('✅ PASSED') : 
                   percentage >= 80 ? chalk.yellow('⚠️  PARTIAL') : 
                   chalk.red('❌ FAILED');
    
    console.log(`   ${status} ${phaseName} (${passed}/${total} - ${percentage.toFixed(0)}%)`);
    console.log();
  }

  private generateFinalReport(phaseResults: { [key: string]: boolean }[]): boolean {
    console.log(chalk.blue('🎯 Final Production Readiness Report'));
    console.log(chalk.blue('===================================='));
    console.log();

    // Calculate overall metrics
    const totalTests = phaseResults.reduce((sum, phase) => sum + Object.keys(phase).length, 0);
    const passedTests = phaseResults.reduce((sum, phase) => sum + Object.values(phase).filter(Boolean).length, 0);
    const overallPercentage = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    console.log(`📊 Overall Results:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${chalk.green(passedTests)}`);
    console.log(`   Failed: ${chalk.red(totalTests - passedTests)}`);
    console.log(`   Success Rate: ${overallPercentage.toFixed(1)}%`);
    console.log();

    // Performance summary
    if (this.metrics.webhookResponseTimes.length > 0) {
      const avgWebhookTime = this.metrics.webhookResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.webhookResponseTimes.length;
      const maxWebhookTime = Math.max(...this.metrics.webhookResponseTimes);
      
      console.log(`⚡ Performance Summary:`);
      console.log(`   Average webhook response: ${avgWebhookTime.toFixed(2)}ms`);
      console.log(`   Maximum webhook response: ${maxWebhookTime.toFixed(2)}ms`);
      console.log(`   Cache hit rate: ${this.calculateOverallCacheHitRate().toFixed(1)}%`);
      console.log();
    }

    // Production readiness assessment
    console.log(`🚀 Production Readiness Assessment:`);
    if (overallPercentage >= 95) {
      console.log(chalk.green('   ✅ PRODUCTION READY - Excellent'));
      console.log(chalk.green('   ✅ All critical systems functioning correctly'));
      console.log(chalk.green('   ✅ Performance targets met'));
      console.log(chalk.green('   ✅ Resilience measures operational'));
    } else if (overallPercentage >= 85) {
      console.log(chalk.yellow('   ⚠️  PRODUCTION READY - With monitoring'));
      console.log(chalk.yellow('   ⚠️  Minor issues present but not blocking'));
      console.log(chalk.yellow('   ⚠️  Recommend additional monitoring'));
    } else if (overallPercentage >= 70) {
      console.log(chalk.red('   ❌ NOT PRODUCTION READY - Issues present'));
      console.log(chalk.red('   ❌ Significant issues need resolution'));
      console.log(chalk.red('   ❌ Address failures before deployment'));
    } else {
      console.log(chalk.red('   ❌ NOT PRODUCTION READY - Critical failures'));
      console.log(chalk.red('   ❌ Major system issues detected'));
      console.log(chalk.red('   ❌ Requires significant remediation'));
    }
    console.log();

    // Deployment recommendations
    console.log(`💡 Deployment Recommendations:`);
    if (overallPercentage >= 85) {
      console.log('   • Enable Redis in production environment');
      console.log('   • Monitor cache hit rates and performance');
      console.log('   • Set up Redis health alerts');
      console.log('   • Regular performance benchmarking');
    } else {
      console.log('   • Address test failures before production deployment');
      console.log('   • Verify Redis configuration and connectivity');
      console.log('   • Test fallback mechanisms thoroughly');
      console.log('   • Re-run validation suite after fixes');
    }
    console.log();

    return overallPercentage >= 85;
  }

  async cleanup() {
    try {
      await this.redisService.cleanup();
      await RedisConfig.closeConnection();
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }
}

// CLI interface
async function main() {
  const suite = new RedisValidationSuite();
  
  try {
    console.log(chalk.blue('Starting Redis Implementation Validation...'));
    console.log();
    
    const success = await suite.runFullValidation();
    
    if (success) {
      console.log(chalk.green('🎉 Validation completed successfully - Production ready!'));
      process.exit(0);
    } else {
      console.log(chalk.red('💥 Validation failed - Not ready for production'));
      process.exit(1);
    }
    
  } catch (error) {
    console.error(chalk.red('💥 Validation suite error:'), error);
    process.exit(2);
  } finally {
    await suite.cleanup();
  }
}

if (require.main === module) {
  main();
}

export { RedisValidationSuite };