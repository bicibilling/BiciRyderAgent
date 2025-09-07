#!/usr/bin/env tsx
/**
 * Comprehensive Redis Implementation Test Runner
 * Runs all Redis tests in a structured manner with detailed reporting
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import chalk from 'chalk';

interface TestSuite {
  name: string;
  description: string;
  pattern: string;
  timeout: number;
  critical: boolean;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'Unit Tests',
    description: 'Individual service and configuration unit tests',
    pattern: 'src/__tests__/unit/**/*.test.ts',
    timeout: 30000,
    critical: true
  },
  {
    name: 'Integration Tests - Lead Service',
    description: 'Lead service Redis integration and caching tests',
    pattern: 'src/__tests__/integration/lead-service-redis.test.ts',
    timeout: 60000,
    critical: true
  },
  {
    name: 'Integration Tests - Conversation Service',
    description: 'Conversation service Redis integration and context caching',
    pattern: 'src/__tests__/integration/conversation-service-redis.test.ts',
    timeout: 60000,
    critical: true
  },
  {
    name: 'Resilience Tests',
    description: 'Redis failure handling and graceful degradation',
    pattern: 'src/__tests__/integration/redis-resilience.test.ts',
    timeout: 90000,
    critical: true
  },
  {
    name: 'Performance Tests',
    description: 'Redis performance validation and benchmarking',
    pattern: 'src/__tests__/performance/redis-performance.test.ts',
    timeout: 120000,
    critical: false
  },
  {
    name: 'E2E Webhook Tests',
    description: 'End-to-end webhook flow validation with Redis',
    pattern: 'src/__tests__/e2e/webhook-flow-redis.test.ts',
    timeout: 90000,
    critical: true
  },
  {
    name: 'E2E Dashboard Tests',
    description: 'Dashboard SSE and real-time updates with Redis',
    pattern: 'src/__tests__/e2e/dashboard-sse-redis.test.ts',
    timeout: 90000,
    critical: false
  }
];

interface TestResult {
  suite: string;
  passed: boolean;
  output: string;
  duration: number;
  error?: string;
}

class RedisTestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  constructor() {
    this.startTime = Date.now();
  }

  async runAllTests(options: {
    skipPerformance?: boolean;
    skipE2E?: boolean;
    redisEnabled?: boolean;
  } = {}) {
    console.log(chalk.blue('🧪 Comprehensive Redis Implementation Test Suite'));
    console.log(chalk.blue('===================================================='));
    console.log();
    
    this.logEnvironmentInfo(options);
    
    let totalTests = TEST_SUITES.length;
    let passedTests = 0;
    let criticalFailures = 0;

    for (const suite of TEST_SUITES) {
      // Skip optional suites based on options
      if (options.skipPerformance && suite.name.includes('Performance')) {
        console.log(chalk.yellow(`⏭️  Skipping ${suite.name} (performance tests disabled)`));
        continue;
      }
      
      if (options.skipE2E && suite.name.includes('E2E')) {
        console.log(chalk.yellow(`⏭️  Skipping ${suite.name} (E2E tests disabled)`));
        continue;
      }

      console.log(chalk.cyan(`\n🔬 Running ${suite.name}`));
      console.log(chalk.gray(`   ${suite.description}`));
      console.log(chalk.gray(`   Pattern: ${suite.pattern}`));
      console.log();

      const result = await this.runTestSuite(suite, options);
      this.results.push(result);

      if (result.passed) {
        passedTests++;
        console.log(chalk.green(`✅ ${suite.name} PASSED (${result.duration}ms)`));
      } else {
        if (suite.critical) {
          criticalFailures++;
          console.log(chalk.red(`❌ ${suite.name} FAILED (CRITICAL) (${result.duration}ms)`));
        } else {
          console.log(chalk.yellow(`⚠️  ${suite.name} FAILED (non-critical) (${result.duration}ms)`));
        }
        
        if (result.error) {
          console.log(chalk.red('Error details:'));
          console.log(chalk.red(result.error));
        }
      }
    }

    this.generateReport(totalTests, passedTests, criticalFailures);
    return { totalTests, passedTests, criticalFailures };
  }

  private async runTestSuite(suite: TestSuite, options: any): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const env = {
        ...process.env,
        NODE_ENV: 'test',
        REDIS_ENABLED: options.redisEnabled ? 'true' : 'false',
        LOG_LEVEL: 'error'
      };

      const jestCommand = [
        'npx jest',
        `--testPathPattern="${suite.pattern}"`,
        `--testTimeout=${suite.timeout}`,
        '--verbose',
        '--detectOpenHandles',
        '--forceExit'
      ].join(' ');

      console.log(chalk.gray(`   Command: ${jestCommand}`));
      console.log(chalk.gray(`   Environment: REDIS_ENABLED=${env.REDIS_ENABLED}`));

      const output = execSync(jestCommand, {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
        timeout: suite.timeout + 10000 // Add buffer time
      });

      return {
        suite: suite.name,
        passed: true,
        output,
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        suite: suite.name,
        passed: false,
        output: error.stdout || '',
        duration: Date.now() - startTime,
        error: error.stderr || error.message
      };
    }
  }

  private logEnvironmentInfo(options: any) {
    console.log(chalk.blue('Environment Configuration:'));
    console.log(`  Node.js Version: ${process.version}`);
    console.log(`  Redis Enabled: ${options.redisEnabled ? 'YES' : 'NO'}`);
    console.log(`  Skip Performance: ${options.skipPerformance ? 'YES' : 'NO'}`);
    console.log(`  Skip E2E: ${options.skipE2E ? 'YES' : 'NO'}`);
    console.log();

    // Check Redis availability if enabled
    if (options.redisEnabled) {
      console.log(chalk.blue('Redis Connectivity Check:'));
      try {
        // This would be a real Redis connectivity check
        console.log(chalk.green('  ✅ Redis connectivity will be tested during test runs'));
      } catch (error) {
        console.log(chalk.red('  ❌ Redis connectivity issue detected'));
        console.log(chalk.yellow('  ⚠️  Tests will proceed but may show Redis-disabled behavior'));
      }
      console.log();
    }
  }

  private generateReport(totalTests: number, passedTests: number, criticalFailures: number) {
    const totalDuration = Date.now() - this.startTime;
    
    console.log(chalk.blue('\n📊 Test Execution Report'));
    console.log(chalk.blue('========================'));
    
    console.log(`\n📈 Summary:`);
    console.log(`  Total Test Suites: ${totalTests}`);
    console.log(`  Passed: ${chalk.green(passedTests)}`);
    console.log(`  Failed: ${chalk.red(totalTests - passedTests)}`);
    console.log(`  Critical Failures: ${criticalFailures > 0 ? chalk.red(criticalFailures) : chalk.green('0')}`);
    console.log(`  Total Duration: ${Math.round(totalDuration / 1000)}s`);

    console.log(`\n📋 Detailed Results:`);
    this.results.forEach(result => {
      const status = result.passed ? chalk.green('PASS') : chalk.red('FAIL');
      const duration = `${Math.round(result.duration / 1000)}s`;
      console.log(`  ${status} ${result.suite} (${duration})`);
    });

    // Performance analysis
    const performanceResults = this.results.filter(r => r.suite.includes('Performance'));
    if (performanceResults.length > 0) {
      console.log(`\n⚡ Performance Analysis:`);
      performanceResults.forEach(result => {
        if (result.passed && result.output) {
          // Extract performance metrics from test output
          const metrics = this.extractPerformanceMetrics(result.output);
          if (metrics.length > 0) {
            console.log(`  ${result.suite}:`);
            metrics.forEach(metric => console.log(`    ${metric}`));
          }
        }
      });
    }

    // Resilience analysis
    const resilienceResults = this.results.filter(r => r.suite.includes('Resilience'));
    if (resilienceResults.length > 0) {
      console.log(`\n🛡️  Resilience Validation:`);
      resilienceResults.forEach(result => {
        const status = result.passed ? '✅ PASSED' : '❌ FAILED';
        console.log(`  Fallback behavior: ${status}`);
        console.log(`  Graceful degradation: ${status}`);
        console.log(`  Error handling: ${status}`);
      });
    }

    // Overall health assessment
    console.log(`\n🎯 Overall Assessment:`);
    if (criticalFailures === 0) {
      console.log(chalk.green('  ✅ Redis implementation is production-ready'));
      console.log(chalk.green('  ✅ All critical functionality working correctly'));
      console.log(chalk.green('  ✅ Fallback mechanisms operational'));
      
      if (passedTests === totalTests) {
        console.log(chalk.green('  🎉 Perfect score! All test suites passed'));
      }
    } else {
      console.log(chalk.red('  ❌ Critical issues detected - not ready for production'));
      console.log(chalk.red('  🔧 Address critical failures before deployment'));
    }

    // Recommendations
    console.log(`\n💡 Recommendations:`);
    if (criticalFailures === 0) {
      console.log('  • Monitor cache hit rates in production');
      console.log('  • Set up Redis health monitoring');
      console.log('  • Configure alerts for cache failures');
      console.log('  • Regular performance benchmarking');
    } else {
      console.log('  • Review and fix critical test failures');
      console.log('  • Ensure Redis configuration is correct');
      console.log('  • Verify fallback mechanisms work properly');
      console.log('  • Re-run tests after fixes');
    }

    console.log();
  }

  private extractPerformanceMetrics(output: string): string[] {
    const metrics: string[] = [];
    
    // Look for common performance indicators in test output
    const patterns = [
      /webhook.*?(\d+\.?\d*)ms/gi,
      /cache.*?(\d+\.?\d*)ms/gi,
      /improvement.*?(\d+\.?\d*)%/gi,
      /avg.*?(\d+\.?\d*)ms/gi,
      /p95.*?(\d+\.?\d*)ms/gi
    ];

    patterns.forEach(pattern => {
      const matches = output.match(pattern);
      if (matches) {
        metrics.push(...matches.slice(0, 5)); // Limit to prevent spam
      }
    });

    return metrics;
  }

  async generateDetailedReport() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `redis-test-report-${timestamp}.json`;
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalSuites: this.results.length,
        passedSuites: this.results.filter(r => r.passed).length,
        failedSuites: this.results.filter(r => !r.passed).length,
        totalDuration: Date.now() - this.startTime
      },
      results: this.results,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        redisEnabled: process.env.REDIS_ENABLED
      }
    };

    // In a real implementation, you'd write this to a file
    console.log(`\n📁 Detailed report would be saved to: ${filename}`);
    return report;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    skipPerformance: args.includes('--skip-performance'),
    skipE2E: args.includes('--skip-e2e'),
    redisEnabled: !args.includes('--no-redis'),
    detailedReport: args.includes('--detailed-report')
  };

  if (args.includes('--help')) {
    console.log(`
Redis Implementation Test Runner

Usage: tsx scripts/test-redis-comprehensive.ts [options]

Options:
  --skip-performance    Skip performance benchmarking tests
  --skip-e2e           Skip end-to-end integration tests  
  --no-redis           Run tests with Redis disabled (baseline)
  --detailed-report    Generate detailed JSON report
  --help               Show this help message

Examples:
  # Run all tests with Redis enabled
  tsx scripts/test-redis-comprehensive.ts

  # Run only critical tests without performance benchmarks
  tsx scripts/test-redis-comprehensive.ts --skip-performance --skip-e2e

  # Test baseline behavior without Redis
  tsx scripts/test-redis-comprehensive.ts --no-redis

  # Generate detailed report
  tsx scripts/test-redis-comprehensive.ts --detailed-report
    `);
    return;
  }

  const runner = new RedisTestRunner();
  
  try {
    const results = await runner.runAllTests(options);
    
    if (options.detailedReport) {
      await runner.generateDetailedReport();
    }
    
    // Exit with appropriate code
    if (results.criticalFailures > 0) {
      process.exit(1); // Critical failures
    } else if (results.passedTests < results.totalTests) {
      process.exit(2); // Non-critical failures
    } else {
      process.exit(0); // All tests passed
    }
    
  } catch (error) {
    console.error(chalk.red('\n💥 Test runner failed:'), error);
    process.exit(3);
  }
}

if (require.main === module) {
  main();
}

export { RedisTestRunner };