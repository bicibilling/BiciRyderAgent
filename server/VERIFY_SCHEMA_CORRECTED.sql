-- SCHEMA VERIFICATION SCRIPT (CORRECTED)
-- Matches actual Supabase schema

-- ============================================
-- VERIFY SENT_BY CONSTRAINT
-- ============================================
-- Check if human_agent is allowed in sent_by
SELECT 
    'conversations.sent_by allows human_agent' as check_name,
    CASE 
        WHEN pg_get_constraintdef(oid) LIKE '%human_agent%'
        THEN '✅ CORRECT'
        ELSE '❌ NEEDS UPDATE - run migration to add human_agent'
    END as status
FROM pg_constraint 
WHERE conname = 'conversations_sent_by_check';

-- ============================================
-- CHECK ACTUAL SENT_BY VALUES IN USE
-- ============================================
SELECT 
    sent_by,
    COUNT(*) as count,
    CASE 
        WHEN sent_by IN ('user', 'agent', 'system', 'human_agent')
        THEN '✅ Valid'
        ELSE '❌ Invalid'
    END as status
FROM conversations
GROUP BY sent_by
ORDER BY count DESC;

-- ============================================
-- CHECK CONVERSATION TYPES IN USE
-- ============================================
SELECT 
    type,
    COUNT(*) as count,
    CASE 
        WHEN type IN ('voice', 'sms', 'email', 'system')
        THEN '✅ Valid'
        ELSE '❌ Invalid'
    END as status
FROM conversations
GROUP BY type
ORDER BY count DESC;

-- ============================================
-- CHECK CONVERSATION_SUMMARIES.CONVERSATION_TYPE
-- ============================================
SELECT 
    'conversation_summaries.conversation_type exists' as check_name,
    CASE 
        WHEN column_name IS NOT NULL
        THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM information_schema.columns
WHERE table_name = 'conversation_summaries'
  AND column_name = 'conversation_type';

-- ============================================
-- CHECK FOR ORPHANED RECORDS
-- ============================================
SELECT 
    'Orphaned conversations' as issue,
    COUNT(*) as count,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ None'
        ELSE '❌ Found orphans - run cleanup'
    END as status
FROM conversations c
WHERE c.lead_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = c.lead_id)
UNION ALL
SELECT 
    'Orphaned summaries',
    COUNT(*),
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ None'
        ELSE '❌ Found orphans - run cleanup'
    END
FROM conversation_summaries cs
WHERE cs.lead_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = cs.lead_id)
UNION ALL
SELECT 
    'Orphaned call sessions',
    COUNT(*),
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ None'
        ELSE '❌ Found orphans - run cleanup'
    END
FROM call_sessions cs
WHERE cs.lead_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = cs.lead_id);

-- ============================================
-- CHECK FOR INCORRECT CUSTOMER NAMES
-- ============================================
SELECT 
    'Leads named Mark (potential agent name)' as issue,
    COUNT(*) as count,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ None'
        ELSE '⚠️ Review these - might be agent name'
    END as status
FROM leads
WHERE customer_name = 'Mark';

-- If found, show details
SELECT 
    id,
    customer_name,
    phone_number,
    created_at,
    updated_at
FROM leads
WHERE customer_name = 'Mark'
LIMIT 5;

-- ============================================
-- SUMMARY STATISTICS
-- ============================================
SELECT 
    'Total Leads' as metric,
    COUNT(*) as count
FROM leads
UNION ALL
SELECT 
    'Total Conversations',
    COUNT(*)
FROM conversations
UNION ALL
SELECT 
    'Voice Conversations',
    COUNT(*)
FROM conversations
WHERE type = 'voice'
UNION ALL
SELECT 
    'SMS Conversations',
    COUNT(*)
FROM conversations
WHERE type = 'sms'
UNION ALL
SELECT 
    'System Messages',
    COUNT(*)
FROM conversations
WHERE type = 'system'
UNION ALL
SELECT 
    'Email Conversations',
    COUNT(*)
FROM conversations
WHERE type = 'email'
ORDER BY metric;