#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');

const API_BASE = 'http://localhost:3002/api';

// Load test prompts
const testData = JSON.parse(fs.readFileSync('./test-prompts.json', 'utf8'));

async function runTest(testPrompt, index) {
  console.log(`\n🧪 Test ${index + 1}/10: ${testPrompt.category}`);
  console.log(`📝 Prompt: "${testPrompt.prompt}"`);
  
  const startTime = Date.now();
  
  try {
    const response = await axios.post(`${API_BASE}/agent/test`, {
      message: testPrompt.prompt,
      phone_number: testPrompt.phone_number || '+16041234567'
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    const result = response.data.test_result;
    
    console.log(`⏱️  Response time: ${responseTime}ms`);
    console.log(`🤖 Ryder's response:`);
    console.log(`   "${result.agent_response}"`);
    
    // Basic success criteria checking
    let passedCriteria = 0;
    let totalCriteria = testPrompt.success_criteria.length;
    
    console.log(`\n✅ Checking success criteria:`);
    
    testPrompt.success_criteria.forEach((criteria, i) => {
      let passed = false;
      
      // Simple keyword/content checking
      const response_lower = result.agent_response.toLowerCase();
      
      switch (criteria) {
        case "Contains 'Ryder' and 'Bici'":
          passed = response_lower.includes('ryder') && response_lower.includes('bici');
          break;
        case "Mentions current date":
          // Check for day names or date patterns
          passed = /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|january|february|march|april|may|june|july|august|september|october|november|december)/i.test(result.agent_response);
          break;
        case "States open/closed status":
          passed = /(?:open|closed|close|opens)/i.test(result.agent_response);
          break;
        case "Includes hours information":
          passed = /(?:\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.)|hours|until|from)/i.test(result.agent_response);
          break;
        case "Professional tone":
          // Check for professional language and lack of informal expressions
          passed = !/(yo|hey|sup|whatup|lol|omg)/i.test(result.agent_response) && 
                   /(help|assist|service|team)/i.test(result.agent_response);
          break;
        case "Responds in French":
          passed = /(bonjour|salut|oui|nous|sommes|heures|ouvert|fermé)/i.test(result.agent_response);
          break;
        default:
          // Generic keyword check
          const keywords = criteria.toLowerCase().match(/(?:'([^']+)'|"([^"]+)"|(\w+))/g);
          if (keywords) {
            passed = keywords.some(keyword => 
              response_lower.includes(keyword.replace(/['"]/g, '').toLowerCase())
            );
          }
      }
      
      console.log(`   ${i + 1}. ${criteria}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
      if (passed) passedCriteria++;
    });
    
    const scorePercent = Math.round((passedCriteria / totalCriteria) * 100);
    const testPassed = scorePercent >= 80; // 80% threshold
    
    console.log(`\n📊 Score: ${passedCriteria}/${totalCriteria} (${scorePercent}%) - ${testPassed ? '✅ PASS' : '❌ FAIL'}`);
    
    return {
      id: testPrompt.id,
      category: testPrompt.category,
      prompt: testPrompt.prompt,
      response: result.agent_response,
      response_time: responseTime,
      score: passedCriteria,
      total_criteria: totalCriteria,
      score_percent: scorePercent,
      passed: testPassed,
      success_criteria: testPrompt.success_criteria
    };
    
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return {
      id: testPrompt.id,
      category: testPrompt.category,
      prompt: testPrompt.prompt,
      error: error.message,
      response_time: Date.now() - startTime,
      passed: false,
      score: 0,
      total_criteria: testPrompt.success_criteria.length,
      score_percent: 0
    };
  }
}

async function runAllTests() {
  console.log('🚀 Starting Ryder AI Agent Test Suite');
  console.log('=========================================');
  
  const results = [];
  
  for (let i = 0; i < testData.test_prompts.length; i++) {
    const result = await runTest(testData.test_prompts[i], i);
    results.push(result);
    
    // Small delay between tests
    if (i < testData.test_prompts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Summary
  console.log('\n\n📈 TEST SUMMARY');
  console.log('================');
  
  const passedTests = results.filter(r => r.passed).length;
  const totalTests = results.length;
  const averageScore = Math.round(results.reduce((sum, r) => sum + r.score_percent, 0) / totalTests);
  const averageResponseTime = Math.round(results.reduce((sum, r) => sum + (r.response_time || 0), 0) / totalTests);
  
  console.log(`✅ Passed Tests: ${passedTests}/${totalTests}`);
  console.log(`📊 Average Score: ${averageScore}%`);
  console.log(`⏱️  Average Response Time: ${averageResponseTime}ms`);
  
  const overallPassed = passedTests >= 8; // Need 8/10 to pass
  console.log(`\n🎯 OVERALL RESULT: ${overallPassed ? '✅ PASS' : '❌ FAIL'}`);
  
  if (!overallPassed) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - Test ${r.id}: ${r.category}`);
      if (r.error) {
        console.log(`     Error: ${r.error}`);
      } else {
        console.log(`     Score: ${r.score}/${r.total_criteria} (${r.score_percent}%)`);
      }
    });
  }
  
  // Save detailed results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = `test-results-${timestamp}.json`;
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total_tests: totalTests,
      passed_tests: passedTests,
      average_score_percent: averageScore,
      average_response_time_ms: averageResponseTime,
      overall_passed: overallPassed
    },
    test_results: results,
    test_suite: testData.name
  };
  
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n💾 Detailed results saved to: ${reportFile}`);
  
  return overallPassed;
}

// Run the tests
if (require.main === module) {
  runAllTests()
    .then(passed => {
      process.exit(passed ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test runner error:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests, runTest };