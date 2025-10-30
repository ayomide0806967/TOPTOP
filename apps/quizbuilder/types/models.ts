export type Role = 'super_admin' | 'instructor' | 'student';

export interface Subscription {
  plan_type: 'basic' | 'pro' | 'enterprise';
  max_students?: number;
  max_classrooms?: number;
  max_quizzes?: number;
}

export interface Tenant {
  id: string;
  slug?: string;
  name?: string;
}

export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: Role;
  tenant?: Tenant;
  subscription?: Subscription;
}

