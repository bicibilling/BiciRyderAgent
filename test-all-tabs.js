const { chromium } = require('playwright');

async function testAllTabs() {
  console.log('🎭 COMPREHENSIVE TAB TESTING - NO MOCK DATA ALLOWED');
  console.log('=====================================================');
  
  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const page = await browser.newPage();

  const results = {
    overview: false,
    conversations: false,
    human_control: false,
    voice_testing: false,
    prompt_editor: false,
    analytics: false,
    settings: false
  };

  try {
    // Load dashboard
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("Ryder AI Dashboard")');
    console.log('✅ Dashboard loaded');

    // Test 1: Overview Tab
    console.log('\n📊 Testing Overview Tab...');
    await page.click('button:has-text("Overview")');
    await page.waitForTimeout(2000);
    
    const overviewContent = await page.textContent('body');
    if (overviewContent.includes('RYDER') && overviewContent.includes('604') && overviewContent.includes('670')) {
      results.overview = true;
      console.log('✅ Overview shows real agent status and phone number');
    }

    // Test 2: Conversations Tab  
    console.log('\n💬 Testing Conversations Tab...');
    await page.click('button:has-text("Conversations")');
    await page.waitForTimeout(3000);
    
    const conversationsContent = await page.textContent('body');
    if (conversationsContent.includes('conv_') || conversationsContent.includes('Mountain bike') || 
        conversationsContent.includes('Continue speaking')) {
      results.conversations = true;
      console.log('✅ Conversations shows real ElevenLabs conversation data');
    } else if (conversationsContent.includes('call +1 (604) 670-0262')) {
      results.conversations = true;
      console.log('✅ Conversations shows proper empty state with phone number');
    }

    // Test 3: Human Handoff Tab
    console.log('\n👤 Testing Human Handoff Tab...');
    await page.click('button:has-text("Human Handoff")');
    await page.waitForTimeout(2000);
    
    const humanContent = await page.textContent('body');
    if (humanContent.includes('voice summary') && humanContent.includes('No Computer Required')) {
      results.human_control = true;
      console.log('✅ Human Handoff shows voice summary system');
    }

    // Test 4: Voice Testing Tab (this was breaking before)
    console.log('\n🎤 Testing Voice Testing Tab...');
    try {
      await page.click('button:has-text("Voice Testing")');
      await page.waitForTimeout(2000);
      
      const voiceContent = await page.textContent('body');
      if (voiceContent.includes('Voice Agent Testing') && voiceContent.includes('604') && voiceContent.includes('670')) {
        results.voice_testing = true;
        console.log('✅ Voice Testing tab loads without breaking UI');
      }
    } catch (error) {
      console.log('❌ Voice Testing tab still has issues:', error.message.substring(0, 50));
    }

    // Test 5: Prompt Editor Tab
    console.log('\n✏️ Testing Prompt Editor Tab...');
    await page.click('button:has-text("Prompt Editor")');
    await page.waitForTimeout(2000);
    
    const promptContent = await page.textContent('body');
    if (promptContent.includes('Agent Prompt Editor') && promptContent.includes('Run All 10 Tests')) {
      results.prompt_editor = true;
      console.log('✅ Prompt Editor functional with 10 test prompts');
    }

    // Test 6: Analytics Tab
    console.log('\n📈 Testing Analytics Tab...');
    await page.click('button:has-text("Analytics")');
    await page.waitForTimeout(2000);
    
    const analyticsContent = await page.textContent('body');
    if (analyticsContent.includes('No analytics data yet') && analyticsContent.includes('604') && analyticsContent.includes('670')) {
      results.analytics = true;
      console.log('✅ Analytics shows proper empty state (no mock data)');
    }

    // Test 7: Settings Tab
    console.log('\n⚙️ Testing Settings Tab...');
    await page.click('button:has-text("Settings")');
    await page.waitForTimeout(2000);
    
    const settingsContent = await page.textContent('body');
    if (settingsContent.includes('agent_7201k9x8c9axe9h99csjf4z59821') && settingsContent.includes('Ryder')) {
      results.settings = true;
      console.log('✅ Settings shows real agent configuration');
    }

    // Final screenshot
    await page.screenshot({ path: '/tmp/all-tabs-test.png', fullPage: true });
    console.log('\n📸 All tabs screenshot saved');

    const allWorking = Object.values(results).every(Boolean);
    
    console.log('\n🎯 TAB TEST RESULTS:');
    Object.entries(results).forEach(([tab, working]) => {
      console.log(`   ${working ? '✅' : '❌'} ${tab}: ${working ? 'WORKING' : 'ISSUES'}`);
    });

    console.log('\n' + (allWorking ? '🎉 ALL TABS WORKING!' : '⚠️ SOME TABS NEED ATTENTION'));
    
    return {
      success: allWorking,
      results: results,
      message: allWorking ? 'All tabs functional with real data' : 'Some tabs have issues'
    };

  } catch (error) {
    console.error('❌ Tab test failed:', error);
    await page.screenshot({ path: '/tmp/tab-test-error.png', fullPage: true });
    
    return {
      success: false,
      error: error.message,
      results: results
    };
  } finally {
    await browser.close();
  }
}

// Run the test
if (require.main === module) {
  testAllTabs()
    .then(result => {
      console.log('\n📊 COMPREHENSIVE TAB TEST RESULT:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testAllTabs };