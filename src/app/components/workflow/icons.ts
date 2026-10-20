// Icon and color lookup for actions, integrations and triggers (CNV-07, CNV-09).

import {
  Bug,
  Clock,
  Code,
  Database,
  GitBranch,
  Image,
  LucideIconData,
  Mail,
  Play,
  Settings,
  Slack,
  Sparkles,
  Timer,
  Type,
  Webhook,
  Zap
} from 'lucide-angular';
import { getAction } from '../../actions/registry';
import { TriggerType } from '../../models/workflow';

export interface IconSpec {
  icon: LucideIconData;
  color: string;
}

const ICONS: Record<string, IconSpec> = {
  http: { icon: Zap, color: 'text-amber-500' },
  database: { icon: Database, color: 'text-blue-500' },
  condition: { icon: GitBranch, color: 'text-pink-500' },
  code: { icon: Code, color: 'text-green-500' },
  ai: { icon: Sparkles, color: 'text-violet-500' },
  image: { icon: Image, color: 'text-fuchsia-500' },
  slack: { icon: Slack, color: 'text-[#4A154B] dark:text-[#E01E5A]' },
  resend: { icon: Mail, color: 'text-foreground' },
  delay: { icon: Timer, color: 'text-sky-500' },
  text: { icon: Type, color: 'text-teal-500' },
  error: { icon: Bug, color: 'text-red-500' }
};

const FALLBACK: IconSpec = { icon: Zap, color: 'text-amber-500' };

export function iconForKey(key: string | undefined): IconSpec {
  return (key && ICONS[key]) || FALLBACK;
}

export function iconForAction(actionType: string): IconSpec {
  return iconForKey(getAction(actionType)?.icon);
}

/** Group icon in the action picker: the integration icon, or Settings for System. */
export function iconForCategory(category: string, sampleIcon?: string): IconSpec {
  if (category === 'System') {
    return { icon: Settings, color: 'text-muted-foreground' };
  }
  return iconForKey(sampleIcon);
}

export const TRIGGER_ICONS: Record<TriggerType, LucideIconData> = {
  Manual: Play,
  Schedule: Clock,
  Webhook: Webhook
};
