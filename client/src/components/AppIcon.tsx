import type { LucideIcon } from 'lucide-react';
import { MorphIcon } from 'morphicons/react';

export function AppIcon({ icon: Icon, size = 20, ...props }: { icon: LucideIcon; size?: number; className?: string; 'aria-hidden'?: boolean }) {
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" {...props} />;
}

export function StateIcon({ icon, size = 20 }: { icon: React.ComponentProps<typeof MorphIcon>['icon']; size?: number }) {
  return <MorphIcon icon={icon} size={size} strokeWidth={1.8} reducedMotion="user" />;
}
