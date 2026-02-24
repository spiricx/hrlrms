import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';

interface AvatarUploadProps {
  avatarUrl: string | null;
  fallback: string;
  size?: string;
  onUpload?: (url: string) => void;
}

export default function AvatarUpload({ avatarUrl, fallback, size = 'h-8 w-8', onUpload }: AvatarUploadProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState(avatarUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error('Upload failed: ' + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const finalUrl = `${publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: finalUrl } as any)
      .eq('user_id', user.id);

    if (updateError) {
      toast.error('Failed to save avatar');
    } else {
      setUrl(finalUrl);
      onUpload?.(finalUrl);
      toast.success('Avatar updated!');
    }
    setUploading(false);
  };

  return (
    <div className="relative group cursor-pointer" onClick={() => inputRef.current?.click()}>
      <Avatar className={size}>
        <AvatarImage src={url || undefined} alt="Avatar" />
        <AvatarFallback className="gradient-primary text-primary-foreground text-xs font-bold">
          {fallback}
        </AvatarFallback>
      </Avatar>
      <div className="absolute inset-0 rounded-full bg-foreground/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
        <Camera className="w-3 h-3 text-white" />
      </div>
      {uploading && (
        <div className="absolute inset-0 rounded-full bg-foreground/60 flex items-center justify-center">
          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  );
}
