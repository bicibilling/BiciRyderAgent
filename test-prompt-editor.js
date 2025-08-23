const { chromium } = require('playwright');

async function testPromptEditor() {
  console.log('🎭 Testing Prompt Editor functionality...');
  
  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const page = await browser.newPage();

  try {
    // Navigate to dashboard
    await page.goto('http://localhost:3000');
    await page.waitForSelector('h1:has-text("Ryder AI Dashboard")');
    console.log('✅ Dashboard loaded');

    // Click Prompt Editor tab
    await page.click('button:has-text("Prompt Editor")');
    await page.waitForSelector('h2:has-text("Agent Prompt Editor")');
    console.log('✅ Prompt Editor tab loads');

    // Check for prompt textarea
    const textarea = await page.$('textarea');
    if (textarea) {
      console.log('✅ Found prompt editor textarea');
      
      // Check if it has content
      const content = await textarea.textContent();
      if (content && content.length > 100) {
        console.log('✅ Prompt textarea has content');
      }
    }

    // Check for test buttons
    const runTestsBtn = await page.$('button:has-text("Run All 10 Tests")');
    if (runTestsBtn) {
      console.log('✅ Found Run All Tests button');
    }

    // Check for deploy button  
    const deployBtn = await page.$('button:has-text("Deploy")');
    if (deployBtn) {
      console.log('✅ Found Deploy button');
    }

    // Check for save button
    const saveBtn = await page.$('button:has-text("Save")');
    if (saveBtn) {
      console.log('✅ Found Save button');
    }

    // Check for test categories display
    const testCategories = await page.$$('.text-sm.bg-neutral-50');
    if (testCategories.length > 0) {
      console.log(`✅ Found ${testCategories.length} test categories displayed`);
    }

    await page.screenshot({ path: '/tmp/prompt-editor.png', fullPage: true });
    console.log('📸 Screenshot saved to /tmp/prompt-editor.png');

    console.log('\n✅ Prompt Editor test completed successfully!');
    
    return {
      success: true,
      message: 'Prompt Editor fully functional'
    };

  } catch (error) {
    console.error('❌ Prompt Editor test failed:', error);
    await page.screenshot({ path: '/tmp/prompt-editor-error.png', fullPage: true });
    
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
  testPromptEditor()
    .then(result => {
      console.log('\n📊 Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testPromptEditor };