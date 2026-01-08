-- QuizBuilder Database Cleanup Script
-- Run this in your Supabase SQL Editor to remove QuizBuilder tables, views, and functions
--
-- ⚠️ WARNING: This script will permanently delete the following database objects.
-- Make sure you have a backup if you need to preserve any data.

-- ============================================================================
-- STEP 1: Drop Views (must be dropped before tables they depend on)
-- ============================================================================

DROP VIEW IF EXISTS public.user_profile CASCADE;
DROP VIEW IF EXISTS public.active_user_plans CASCADE;
DROP VIEW IF EXISTS public.admin_dashboard_stats CASCADE;
DROP VIEW IF EXISTS public.subscription_products_with_plans CASCADE;

-- ============================================================================
-- STEP 2: Drop Tables (in reverse dependency order)
-- ============================================================================

-- Drop tables with foreign key dependencies first
DROP TABLE IF EXISTS public.user_sessions CASCADE;
DROP TABLE IF EXISTS public.subscriptions CASCADE;

-- Drop main tables
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;

-- ============================================================================
-- STEP 3: Drop Functions
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_current_user_role();
DROP FUNCTION IF EXISTS public.get_current_user_tenant();
DROP FUNCTION IF EXISTS public.check_subscription_limit(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- ============================================================================
-- STEP 4: Clean up RLS Policies (if tables were already dropped, these are no-ops)
-- ============================================================================

-- These will error gracefully if the tables don't exist
DO $$
BEGIN
    -- Try to drop policies, ignore errors if tables don't exist
    EXECUTE 'DROP POLICY IF EXISTS "Users can view own profile" ON public.users';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update own profile" ON public.users';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view their tenant" ON public.tenants';
EXCEPTION
    WHEN undefined_table THEN
        -- Table doesn't exist, nothing to do
        NULL;
END;
$$;

-- ============================================================================
-- STEP 5: Remove columns added to existing tables (if any)
-- ============================================================================

-- These ALTER statements will fail gracefully if columns don't exist
DO $$
BEGIN
    ALTER TABLE IF EXISTS public.quiz_blueprints DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE IF EXISTS public.quiz_blueprints DROP COLUMN IF EXISTS owner_user_id;
    ALTER TABLE IF EXISTS public.classrooms DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE IF EXISTS public.classrooms DROP COLUMN IF EXISTS owner_user_id;
    ALTER TABLE IF EXISTS public.classroom_exams DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE IF EXISTS public.classroom_exams DROP COLUMN IF EXISTS owner_user_id;
    ALTER TABLE IF EXISTS public.quiz_distribution_links DROP COLUMN IF EXISTS tenant_id;
    ALTER TABLE IF EXISTS public.quiz_distribution_links DROP COLUMN IF EXISTS owner_user_id;
EXCEPTION
    WHEN undefined_table THEN
        NULL;
END;
$$;

-- ============================================================================
-- STEP 6: Drop Indexes
-- ============================================================================

DROP INDEX IF EXISTS public.idx_users_email;
DROP INDEX IF EXISTS public.idx_users_role;
DROP INDEX IF EXISTS public.idx_users_tenant;
DROP INDEX IF EXISTS public.idx_tenants_slug;
DROP INDEX IF EXISTS public.idx_subscriptions_tenant;
DROP INDEX IF EXISTS public.idx_subscriptions_status;
DROP INDEX IF EXISTS public.idx_user_sessions_token;
DROP INDEX IF EXISTS public.idx_user_sessions_expires;

-- ============================================================================
-- VERIFICATION: Check what was removed
-- ============================================================================

-- You can run this query after the cleanup to verify tables were removed:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('users', 'tenants', 'subscriptions', 'user_sessions');

-- Expected result: Empty set (no rows)

SELECT 'QuizBuilder cleanup complete!' as status;
