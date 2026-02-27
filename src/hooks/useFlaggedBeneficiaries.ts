import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useFlaggedBeneficiaries() {
  const { user } = useAuth();
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchFlagged = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from('flagged_beneficiaries')
      .select('beneficiary_id')
      .eq('user_id', user.id);
    if (data) setFlaggedIds(new Set(data.map(r => r.beneficiary_id)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchFlagged();
    if (!user) return;
    const channel = supabase
      .channel('flagged-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flagged_beneficiaries' }, () => fetchFlagged())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchFlagged, user]);

  const toggle = useCallback(async (beneficiaryId: string) => {
    if (!user) return;
    const isFlagged = flaggedIds.has(beneficiaryId);
    setFlaggedIds(prev => {
      const next = new Set(prev);
      if (isFlagged) next.delete(beneficiaryId); else next.add(beneficiaryId);
      return next;
    });

    if (isFlagged) {
      await supabase
        .from('flagged_beneficiaries')
        .delete()
        .eq('user_id', user.id)
        .eq('beneficiary_id', beneficiaryId);
    } else {
      await supabase
        .from('flagged_beneficiaries')
        .insert({ user_id: user.id, beneficiary_id: beneficiaryId });
    }
  }, [user, flaggedIds]);

  const isFlagged = useCallback((beneficiaryId: string) => flaggedIds.has(beneficiaryId), [flaggedIds]);

  return { flaggedIds, isFlagged, toggle, loading };
}
