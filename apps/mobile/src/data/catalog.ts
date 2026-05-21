export type Course = {
  id: string;
  name: string;
  description: string;
};

export type Department = {
  id: string;
  name: string;
  subtitle: string;
  courses: Course[];
};

export type Plan = {
  id: string;
  name: string;
  departmentId: string;
  price: number;
  currency: 'NGN';
  dailyQuestions: number;
  durationDays: number;
  highlight?: string;
};

export const departments: Department[] = [
  {
    id: 'nursing',
    name: 'Nursing',
    subtitle: 'General nursing CBT preparation',
    courses: [
      {
        id: 'general-nursing',
        name: 'General Nursing',
        description:
          'Core nursing practice, medical-surgical, fundamentals, and exam drills.',
      },
    ],
  },
  {
    id: 'midwifery',
    name: 'Midwifery',
    subtitle: 'Midwifery-focused exam practice',
    courses: [
      {
        id: 'general-midwifery',
        name: 'General Midwifery',
        description:
          'Antenatal, intrapartum, postnatal, newborn care, and clinical practice.',
      },
    ],
  },
  {
    id: 'public-health',
    name: 'Public Health',
    subtitle: 'Community and population health preparation',
    courses: [
      {
        id: 'public-health-nursing',
        name: 'Public Health Nursing',
        description:
          'Epidemiology, health promotion, disease prevention, and primary care.',
      },
    ],
  },
  {
    id: 'community-health',
    name: 'Community Health',
    subtitle: 'Community health officer and extension practice',
    courses: [
      {
        id: 'community-health-practice',
        name: 'Community Health Practice',
        description:
          'Primary care, public health intervention, and community case management.',
      },
    ],
  },
  {
    id: 'post-basic',
    name: 'Post Basic Courses',
    subtitle: 'Specialist nursing pathways',
    courses: [
      {
        id: 'ophthalmic',
        name: 'Ophthalmic Nursing',
        description:
          'Eye care, ophthalmic procedures, and specialist nursing practice.',
      },
      {
        id: 'ent',
        name: 'ENT Nursing',
        description:
          'Ear, nose, throat assessment, treatment support, and specialist care.',
      },
      {
        id: 'psychiatric',
        name: 'Psychiatric Nursing',
        description:
          'Mental health, psychiatric assessment, therapy support, and safety.',
      },
      {
        id: 'perioperative',
        name: 'Perioperative Nursing',
        description:
          'Theatre care, asepsis, surgical support, and recovery workflows.',
      },
      {
        id: 'paediatric',
        name: 'Paediatric Nursing',
        description:
          'Child health, growth, family-centered care, and paediatric emergencies.',
      },
      {
        id: 'accident-emergency',
        name: 'Accident & Emergency Nursing',
        description:
          'Triage, emergency response, trauma care, and acute stabilization.',
      },
      {
        id: 'anaesthetic',
        name: 'Anaesthetic Nursing',
        description:
          'Anaesthesia support, airway safety, monitoring, and recovery care.',
      },
      {
        id: 'intensive-care',
        name: 'Intensive Care Nursing',
        description:
          'Critical care monitoring, ventilation support, and complex patient care.',
      },
      {
        id: 'nephrology',
        name: 'Nephrology Nursing',
        description:
          'Renal care, dialysis principles, fluid balance, and chronic kidney support.',
      },
      {
        id: 'occupational-health',
        name: 'Occupational Health Nursing',
        description:
          'Workplace health, safety programs, prevention, and employee care.',
      },
    ],
  },
];

export const plans: Plan[] = [
  {
    id: 'nursing-100-daily',
    name: 'Nursing · 100 Daily',
    departmentId: 'nursing',
    price: 2999,
    currency: 'NGN',
    dailyQuestions: 100,
    durationDays: 30,
    highlight: 'Most popular for daily practice',
  },
  {
    id: 'midwifery-100-daily',
    name: 'Midwifery · 100 Daily',
    departmentId: 'midwifery',
    price: 2999,
    currency: 'NGN',
    dailyQuestions: 100,
    durationDays: 30,
  },
  {
    id: 'public-health-100-daily',
    name: 'Public Health · 100 Daily',
    departmentId: 'public-health',
    price: 2999,
    currency: 'NGN',
    dailyQuestions: 100,
    durationDays: 30,
  },
  {
    id: 'community-health-100-daily',
    name: 'Community Health · 100 Daily',
    departmentId: 'community-health',
    price: 2999,
    currency: 'NGN',
    dailyQuestions: 100,
    durationDays: 30,
  },
  {
    id: 'post-basic-100-daily',
    name: 'Post Basic · 100 Daily',
    departmentId: 'post-basic',
    price: 2999,
    currency: 'NGN',
    dailyQuestions: 100,
    durationDays: 30,
  },
];

export function formatPrice(plan: Plan) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: plan.currency,
    maximumFractionDigits: 0,
  }).format(plan.price);
}
