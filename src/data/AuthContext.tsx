import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAppData } from './AppDataContext';

export type Role = 'tourist' | 'hotel' | 'operator' | 'admin';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: Role;
  linkedHotelId?: string;
  linkedOperatorId?: string;
}

interface SignupInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  phone?: string;
  hotelName?: string;
  hotelLocation?: string;
  businessName?: string;
}

interface AuthValue {
  currentUser: AuthUser | null;
  login: (email: string, password: string) => AuthUser;
  signup: (input: SignupInput) => AuthUser;
  logout: () => void;
  requestPasswordReset: (email: string) => void;
  resetPassword: (email: string, newPassword: string) => boolean;
}

const STORAGE_KEY = 'kariba-boats-auth-v1';

const seedUsers: AuthUser[] = [
  {
    id: 'user-admin',
    name: 'Kariba Admin',
    email: 'admin@kariba.com',
    password: 'admin123',
    role: 'admin',
  },
  {
    id: 'user-hotel-1',
    name: 'Caribbea Bay Front Desk',
    email: 'caribbea@kariba.com',
    password: 'hotel123',
    role: 'hotel',
    linkedHotelId: 'hotel-1',
  },
  {
    id: 'user-operator-1',
    name: 'Blessing Ncube',
    email: 'tigerfish@kariba.com',
    password: 'operator123',
    role: 'operator',
    linkedOperatorId: 'op-3',
  },
  {
    id: 'user-tourist-1',
    name: 'Grace Ndlovu',
    email: 'tourist@kariba.com',
    password: 'tourist123',
    role: 'tourist',
    phone: '+263 71 999 0000',
  },
];

function loadState(): { users: AuthUser[]; currentUserId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed storage
  }
  return { users: seedUsers, currentUserId: null };
}

const AuthContext = createContext<AuthValue | null>(null);

let userCounter = 200;

export function AuthProvider({ children }: { children: ReactNode }) {
  const appData = useAppData();
  const [users, setUsers] = useState<AuthUser[]>(() => loadState().users);
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => loadState().currentUserId);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ users, currentUserId }));
  }, [users, currentUserId]);

  const currentUser = users.find((u) => u.id === currentUserId) ?? null;

  const login = (email: string, password: string): AuthUser => {
    const match = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!match || match.password !== password) {
      throw new Error('Incorrect email or password.');
    }
    setCurrentUserId(match.id);
    return match;
  };

  const signup = (input: SignupInput): AuthUser => {
    const existing = users.find((u) => u.email.toLowerCase() === input.email.trim().toLowerCase());
    if (existing) {
      throw new Error('An account with that email already exists.');
    }

    let linkedHotelId: string | undefined;
    let linkedOperatorId: string | undefined;

    if (input.role === 'hotel') {
      const hotel = appData.addHotel({
        name: input.hotelName || `${input.name}'s property`,
        location: input.hotelLocation || 'Kariba Town',
      });
      linkedHotelId = hotel.id;
    }

    if (input.role === 'operator') {
      const operator = appData.addOperator({
        businessName: input.businessName || `${input.name} Boats`,
        contactName: input.name,
        phone: input.phone || '',
      });
      linkedOperatorId = operator.id;
    }

    const user: AuthUser = {
      id: `user-${userCounter++}`,
      name: input.name,
      email: input.email.trim(),
      password: input.password,
      phone: input.phone,
      role: input.role,
      linkedHotelId,
      linkedOperatorId,
    };
    setUsers((prev) => [...prev, user]);
    setCurrentUserId(user.id);
    return user;
  };

  const logout = () => setCurrentUserId(null);

  const requestPasswordReset = (_email: string) => {
    // Simulated: in a real product this sends an email. No account-existence
    // check is surfaced to the caller so the UI can show a generic message.
  };

  const resetPassword = (email: string, newPassword: string): boolean => {
    const match = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!match) return false;
    setUsers((prev) => prev.map((u) => (u.id === match.id ? { ...u, password: newPassword } : u)));
    return true;
  };

  return (
    <AuthContext.Provider
      value={{ currentUser, login, signup, logout, requestPasswordReset, resetPassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
