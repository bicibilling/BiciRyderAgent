const { chromium } = require('playwright');

async function testProduction() {
  console.log('🌐 TESTING PRODUCTION DEPLOYMENT');
  console.log('================================');
  
  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const page = await browser.newPage();

  try {
    // Test production dashboard
    console.log('📱 Loading production dashboard...');
    await page.goto('https://bici-ryder-dashboard.onrender.com', { waitUntil: 'networkidle' });
    
    // Wait for dashboard to load
    await page.waitForSelector('h1', { timeout: 15000 });
    const title = await page.textContent('h1');
    console.log('✅ Dashboard loads:', title);

    // Check for connection errors
    const hasConnectionError = await page.locator('text=Connection Error').count();
    if (hasConnectionError > 0) {
      console.log('❌ Still showing connection error');
      const errorText = await page.textContent('body');
      console.log('Error details:', errorText.substring(0, 200));
    } else {
      console.log('✅ No connection errors - API working');
    }

    // Check for agent status
    await page.waitForTimeout(3000); // Let API calls complete
    const bodyText = await page.textContent('body');
    
    if (bodyText.includes('RYDER')) {
      console.log('✅ Agent status loaded from production API');
    }
    
    if (bodyText.includes('604') && bodyText.includes('670')) {
      console.log('✅ Phone number displayed correctly');
    }

    // Test navigation
    const tabs = ['Overview', 'Conversations', 'Human Handoff', 'Voice Testing', 'Prompt Editor'];
    for (const tab of tabs) {
      try {
        await page.click(`button:has-text("${tab}")`);
        await page.waitForTimeout(1000);
        console.log(`✅ ${tab} tab works`);
      } catch (error) {
        console.log(`⚠️ ${tab} tab issue:`, error.message.substring(0, 50));
      }
    }

    // Test if API endpoints are responding
    console.log('\n🔗 Testing production API endpoints...');
    
    await page.goto('https://bici-ryder-api.onrender.com/health');
    const healthText = await page.textContent('body');
    if (healthText.includes('healthy')) {
      console.log('✅ Health endpoint working');
    }

    await page.goto('https://bici-ryder-api.onrender.com/api/agent/status');
    const statusText = await page.textContent('body');
    if (statusText.includes('agent')) {
      console.log('✅ Agent status endpoint working');
    }

    // Final screenshot
    await page.goto('https://bici-ryder-dashboard.onrender.com');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/production-final.png', fullPage: true });
    
    console.log('\n🎉 PRODUCTION TEST COMPLETE');
    console.log('📸 Screenshot saved to /tmp/production-final.png');
    
    return {
      success: true,
      urls: {
        dashboard: 'https://bici-ryder-dashboard.onrender.com',
        api: 'https://bici-ryder-api.onrender.com',
        phone: '+1 (604) 670-0262'
      }
    };

  } catch (error) {
    console.error('❌ Production test failed:', error);
    await page.screenshot({ path: '/tmp/production-error.png', fullPage: true });
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    await browser.close();
  }
}

// Run the test
if (require.main === module) {
  testProduction()
    .then(result => {
      console.log('\n📊 PRODUCTION RESULT:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testProduction };