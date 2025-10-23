-- Multi-tenant Quiz Builder Schema
-- This migration adds support for multiple users, roles, and tenant isolation

-- 1. Users table (replaces any existing auth system)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    role TEXT NOT NULL DEFAULT 'instructor' CHECK (role IN ('super_admin', 'instructor', 'student')),
    phone TEXT,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    tenant_id UUID REFERENCES tenants(id),
    subscription_id UUID REFERENCES subscriptions(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- 2. Tenants table (for schools/institutions)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    logo_url TEXT,
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    plan_type TEXT NOT NULL CHECK (plan_type IN ('basic', 'pro', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'suspended')),
    max_students INTEGER DEFAULT 50,
    max_classrooms INTEGER DEFAULT 10,
    max_quizzes INTEGER DEFAULT 100,
    features JSONB DEFAULT '[]',
    starts_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. User sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT
);

-- 5. Update existing tables to include tenant_id
ALTER TABLE quiz_blueprints
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

ALTER TABLE classrooms
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

ALTER TABLE classroom_exams
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

ALTER TABLE quiz_distribution_links
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id),
ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- 7. Row Level Security (RLS) Policies

-- Enable RLS on all relevant tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_distribution_links ENABLE ROW LEVEL SECURITY;

-- Users can see their own profile, super admins can see all
CREATE POLICY "Users can view own profile" ON users
FOR SELECT USING (
    auth.uid()::text = id::text OR
    get_current_user_role() = 'super_admin'
);

CREATE POLICY "Users can update own profile" ON users
FOR UPDATE USING (
    auth.uid()::text = id::text OR
    get_current_user_role() = 'super_admin'
);

-- Tenants visibility based on user role
CREATE POLICY "Users can view their tenant" ON tenants
FOR SELECT USING (
    get_current_user_tenant() = id OR
    get_current_user_role() = 'super_admin'
);

-- Quiz blueprints isolation
CREATE POLICY "Users can view their tenant quizzes" ON quiz_blueprints
FOR SELECT USING (
    tenant_id = get_current_user_tenant() OR
    get_current_user_role() = 'super_admin'
);

CREATE POLICY "Users can manage their tenant quizzes" ON quiz_blueprints
FOR ALL USING (
    tenant_id = get_current_user_tenant() AND
    owner_user_id = auth.uid()
);

-- Classrooms isolation
CREATE POLICY "Users can view their tenant classrooms" ON classrooms
FOR SELECT USING (
    tenant_id = get_current_user_tenant() OR
    get_current_user_role() = 'super_admin'
);

CREATE POLICY "Users can manage their tenant classrooms" ON classrooms
FOR ALL USING (
    tenant_id = get_current_user_tenant() AND
    owner_user_id = auth.uid()
);

-- 8. Functions for current user context
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(
        (SELECT role FROM users WHERE id = auth.uid()),
        'anonymous'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_current_user_tenant()
RETURNS UUID AS $$
BEGIN
    RETURN COALESCE(
        (SELECT tenant_id FROM users WHERE id = auth.uid()),
        NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create default super admin and tenant
INSERT INTO tenants (id, name, slug, description)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'System Administration',
    'system-admin',
    'Default tenant for super admin'
) ON CONFLICT (id) DO NOTHING;

-- Create default super admin (password: admin123)
INSERT INTO users (id, email, password_hash, first_name, last_name, role, tenant_id, email_verified)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'admin@quizbuilder.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uOjG', -- admin123
    'Super',
    'Admin',
    'super_admin',
    '00000000-0000-0000-0000-000000000001',
    true
) ON CONFLICT (email) DO NOTHING;

-- 10. Create default enterprise subscription for system admin
INSERT INTO subscriptions (tenant_id, plan_type, status, max_students, max_classrooms, max_quizzes, features)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'enterprise',
    'active',
    999999,
    999999,
    999999,
    '["all_features", "super_admin", "unlimited"]'
) ON CONFLICT DO NOTHING;

-- 11. Trigger to update updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 12. Views for easier querying
CREATE OR REPLACE VIEW user_profile AS
SELECT
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.role,
    u.phone,
    u.is_active,
    u.email_verified,
    u.created_at,
    u.last_login_at,
    t.name as tenant_name,
    t.slug as tenant_slug,
    s.plan_type as subscription_plan,
    s.status as subscription_status,
    s.max_students,
    s.max_classrooms,
    s.max_quizzes,
    s.features
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
LEFT JOIN subscriptions s ON u.subscription_id = s.id;

-- 13. Subscription check function
CREATE OR REPLACE FUNCTION check_subscription_limit(
    p_user_id UUID,
    p_resource_type TEXT,
    p_current_count INTEGER DEFAULT 0
)
RETURNS BOOLEAN AS $$
DECLARE
    v_max_limit INTEGER;
BEGIN
    SELECT CASE p_resource_type
        WHEN 'students' THEN s.max_students
        WHEN 'classrooms' THEN s.max_classrooms
        WHEN 'quizzes' THEN s.max_quizzes
        ELSE 0
    END INTO v_max_limit
    FROM users u
    JOIN subscriptions s ON u.subscription_id = s.id
    WHERE u.id = p_user_id;

    RETURN v_max_limit > p_current_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;