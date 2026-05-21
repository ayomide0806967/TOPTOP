import {
  createContext,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Department, Course, Plan } from '../data/catalog';

type ProfileDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
};

type RegistrationState = {
  department: Department | null;
  course: Course | null;
  plan: Plan | null;
  profile: ProfileDraft;
};

type RegistrationContextValue = RegistrationState & {
  setDepartment: (department: Department) => void;
  setCourse: (course: Course) => void;
  setPlan: (plan: Plan) => void;
  setProfile: (profile: ProfileDraft) => void;
  reset: () => void;
};

const emptyProfile: ProfileDraft = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
};

const RegistrationContext = createContext<RegistrationContextValue | null>(
  null
);

export function RegistrationProvider({ children }: PropsWithChildren) {
  const [department, setDepartmentState] = useState<Department | null>(null);
  const [course, setCourseState] = useState<Course | null>(null);
  const [plan, setPlanState] = useState<Plan | null>(null);
  const [profile, setProfile] = useState<ProfileDraft>(emptyProfile);

  const value = useMemo<RegistrationContextValue>(
    () => ({
      department,
      course,
      plan,
      profile,
      setDepartment: (nextDepartment) => {
        setDepartmentState(nextDepartment);
        setCourseState(null);
        setPlanState(null);
      },
      setCourse: setCourseState,
      setPlan: setPlanState,
      setProfile,
      reset: () => {
        setDepartmentState(null);
        setCourseState(null);
        setPlanState(null);
        setProfile(emptyProfile);
      },
    }),
    [course, department, plan, profile]
  );

  return (
    <RegistrationContext.Provider value={value}>
      {children}
    </RegistrationContext.Provider>
  );
}

export function useRegistration() {
  const value = useContext(RegistrationContext);
  if (!value) {
    throw new Error(
      'useRegistration must be used inside RegistrationProvider.'
    );
  }
  return value;
}
