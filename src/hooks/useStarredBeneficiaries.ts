import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useStarredBeneficiaries() {
  const { user } = useAuth();
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchStarred = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('starred_beneficiaries')
      .select('beneficiary_id')
      .eq('user_id', user.id);
    if (data) setStarredIds(new Set(data.map(r => r.beneficiary_id)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchStarred();
    if (!user) return;
    const channel = supabase
      .channel('starred-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'starred_beneficiaries' }, () => fetchStarred())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchStarred, user]);

  const toggle = useCallback(async (beneficiaryId: string) => {
    if (!user) return;
    const isStarred = starredIds.has(beneficiaryId);
    // Optimistic update
    setStarredIds(prev => {
      const next = new Set(prev);
      if (isStarred) next.delete(beneficiaryId); else next.add(beneficiaryId);
      return next;
    });

    if (isStarred) {
      await supabase
        .from('starred_beneficiaries')
        .delete()
        .eq('user_id', user.id)
        .eq('beneficiary_id', beneficiaryId);
    } else {
      await supabase
        .from('starred_beneficiaries')
        .insert({ user_id: user.id, beneficiary_id: beneficiaryId });
    }
  }, [user, starredIds]);

  const isStarred = useCallback((beneficiaryId: string) => starredIds.has(beneficiaryId), [starredIds]);

  return { starredIds, isStarred, toggle, loading };
}
