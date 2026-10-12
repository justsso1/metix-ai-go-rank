import { useEffect, useState } from 'react';
import { DEFAULT_AVATAR } from './avatar';

export function useAvatarSource(avatar?: string) {
  const [image, setImage] = useState<{ source?: string; loaded: boolean }>({ loaded: false });
  useEffect(() => {
    // Start the request after hydration, when image error handlers are attached.
    setImage({ source: avatar, loaded: false });
  }, [avatar]);
  return {
    // Starting with the fallback also covers failures before React hydrates.
    source: avatar && avatar === image.source ? avatar : DEFAULT_AVATAR,
    isLoading: Boolean(avatar && avatar !== DEFAULT_AVATAR && avatar === image.source && !image.loaded),
    onLoad: () => setImage(current => current.source === avatar ? { ...current, loaded: true } : current),
    onError: () => setImage(current => current.source === avatar ? { loaded: false } : current),
  };
}

export default function ProfileAvatar({ avatar }: { avatar?: string }) {
  const { source, isLoading, onLoad, onError } = useAvatarSource(avatar);
  const fallback = source === DEFAULT_AVATAR;
  return <img src={source} className={`rv-profile-avatar${fallback || isLoading ? ' rv-avatar-fallback' : ''}`} width={48} height={48} alt=""
    style={isLoading ? { backgroundImage: `url("${DEFAULT_AVATAR}")`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : undefined}
    onLoad={fallback ? undefined : onLoad} onError={fallback ? undefined : onError} />;
}
