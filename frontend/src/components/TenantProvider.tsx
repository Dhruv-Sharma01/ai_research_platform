'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { fetchApi } from '@/lib/api';

import { usePathname } from 'next/navigation';

export type TenantMembership = {
  org_id: string;
  user_id: string;
  role: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    created_at: string;
  };
};

export type TenantContextValue = {
  memberships: TenantMembership[];
  activeTenant: TenantMembership | null;
  switchTenant: (tenantId: string) => void;
  isLoading: boolean;
  refreshMemberships: () => Promise<void>;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [activeTenant, setActiveTenant] = useState<TenantMembership | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadMemberships = async () => {
    try {
      const data: TenantMembership[] = await fetchApi('/organizations');
      setMemberships(data);

      const savedTenantId = localStorage.getItem('active_tenant_id');
      let defaultTenant = data.find(m => m.org_id === savedTenantId);

      if (!defaultTenant && data.length > 0) {
        defaultTenant = data[0];
        localStorage.setItem('active_tenant_id', defaultTenant.org_id);
      } else if (data.length === 0) {
        localStorage.removeItem('active_tenant_id');
      }

      setActiveTenant(defaultTenant || null);
    } catch (err) {
      console.error('Failed to load memberships', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const PUBLIC_PATHS = ['/login', '/'];
    const token = localStorage.getItem('access_token');
    
    // Check auth requirement based on path
    const isPublic = PUBLIC_PATHS.includes(pathname);

    if (token) {
      if (memberships.length === 0 && isLoading) {
        loadMemberships();
      }
    } else {
      setIsLoading(false);
      if (!isPublic) {
        window.location.href = '/login';
      }
    }
  }, [pathname]);

  const switchTenant = (tenantId: string) => {
    const tenant = memberships.find(m => m.org_id === tenantId);
    if (tenant) {
      setActiveTenant(tenant);
      localStorage.setItem('active_tenant_id', tenant.org_id);
      // Force a reload of the window to ensure all tenant-scoped state is blown away
      // This is the safest way to guarantee no data leakage across tenants in a React SPA
      window.location.reload();
    }
  };

  return (
    <TenantContext.Provider
      value={{
        memberships,
        activeTenant,
        switchTenant,
        isLoading,
        refreshMemberships: loadMemberships,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
}
