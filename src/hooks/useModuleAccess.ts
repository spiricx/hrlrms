import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useModuleAccess() {
  const { user, roles } = useAuth();
  const [allowedModules, setAllowedModules] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAllowedModules(new Set());
      setLoading(false);
      return;
    }

    // Admins always have full access
    if (roles.includes('admin')) {
      setAllowedModules(new Set('__all__'));
      setLoading(false);
      return;
    }

    const fetchAccess = async () => {
      const { data } = await supabase
        .from('user_module_access')
        .select('module_key')
        .eq('user_id', user.id);

      if (data) {
        setAllowedModules(new Set(data.map((r: any) => r.module_key)));
      }
      setLoading(false);
    };

    fetchAccess();
  }, [user, roles]);

  const hasModuleAccess = (moduleKey: string): boolean => {
    if (roles.includes('admin')) return true;
    return allowedModules.has(moduleKey);
  };

  return { hasModuleAccess, loading };
}
