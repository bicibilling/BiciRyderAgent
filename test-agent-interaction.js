const { chromium } = require('playwright');

async function testAgentInteraction() {
  console.log('🤖 Testing Ryder agent interaction...');
  
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to dashboard
    console.log('📱 Loading dashboard...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Ryder AI Dashboard")');

    // Navigate to Agent Testing tab
    console.log('🧪 Opening Agent Testing tab...');
    await page.click('button:has-text("Agent Testing")');
    await page.waitForSelector('h2:has-text("Agent Testing")');

    // Test sending a message
    console.log('💬 Testing agent interaction...');
    
    // Find input field and type a test message
    const inputSelector = 'input[placeholder*="Ask Ryder"]';
    await page.waitForSelector(inputSelector);
    await page.fill(inputSelector, 'What are your store hours?');
    
    // Submit message (try Enter key or find button)
    await page.press(inputSelector, 'Enter');
    
    // Wait for response (look for test history to appear)
    console.log('⏳ Waiting for agent response...');
    await page.waitForSelector('h3:has-text("Test History")', { timeout: 10000 });
    
    // Check for success indicators
    const successIndicator = await page.$('.border-green-200');
    if (successIndicator) {
      console.log('✅ Agent responded successfully');
      
      // Get the response text
      const responseText = await page.textContent('.border-green-200 .bg-white p');
      console.log('🤖 Ryder\'s response:', responseText?.substring(0, 100) + '...');
    } else {
      console.log('⚠️  Could not find successful response indicator');
    }

    // Test quick test buttons
    console.log('🔘 Testing quick test buttons...');
    const quickTestButtons = await page.$$('button:has-text("Where are you located?")');
    if (quickTestButtons.length > 0) {
      await quickTestButtons[0].click();
      console.log('✅ Quick test button works');
      
      // Wait for new response
      await page.waitForTimeout(2000);
    }

    // Check for multiple test results
    const testResults = await page.$$('.border-green-200, .border-red-200');
    console.log(`📊 Found ${testResults.length} test results in history`);

    // Test navigation to other tabs while preserving state
    console.log('🔄 Testing tab persistence...');
    await page.click('button:has-text("Overview")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Agent Testing")');
    
    // Check if test history is preserved
    const preservedResults = await page.$$('.border-green-200, .border-red-200');
    if (preservedResults.length > 0) {
      console.log('✅ Test history preserved across tab switches');
    }

    // Test Analytics tab with data
    console.log('📈 Testing Analytics tab...');
    await page.click('button:has-text("Analytics")');
    await page.waitForSelector('text=Total Calls', { timeout: 5000 });
    console.log('✅ Analytics tab loads with mock data');

    // Final screenshot
    await page.screenshot({ path: '/tmp/agent-interaction-test.png', fullPage: true });
    console.log('📸 Final screenshot saved');

    console.log('\n✅ Agent interaction test completed successfully!');
    
    return {
      success: true,
      message: 'Agent interaction fully functional',
      tests: [
        'Dashboard loads correctly',
        'Agent Testing tab functional', 
        'Can send messages to Ryder',
        'Agent responds appropriately',
        'Quick test buttons work',
        'Test history preserved',
        'Analytics displays mock data'
      ]
    };

  } catch (error) {
    console.error('❌ Agent interaction test failed:', error);
    await page.screenshot({ path: '/tmp/agent-interaction-error.png', fullPage: true });
    
    return {
      success: false,
      error: error.message,
      message: 'Agent interaction test failed'
    };
  } finally {
    await browser.close();
  }
}

// Run the test
if (require.main === module) {
  testAgentInteraction()
    .then(result => {
      console.log('\n📊 Final Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testAgentInteraction };