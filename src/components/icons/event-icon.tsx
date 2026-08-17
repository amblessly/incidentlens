import {
  Bell,
  Check,
  CheckCircle2,
  Circle,
  Eye,
  FileText,
  Flag,
  GitBranch,
  Lightbulb,
  Link2,
  Rocket,
  RotateCcw,
  Search,
  Server,
  Shield,
  StickyNote,
  UserCheck,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { EventType } from "@/lib/types";

const ICONS: Record<EventType, LucideIcon> = {
  incident_created: Circle,
  alert_received: Bell,
  investigation_started: Search,
  infrastructure_queried: Server,
  logs_inspected: FileText,
  changes_inspected: GitBranch,
  deployment_discovered: Rocket,
  evidence_correlated: Link2,
  hypothesis_generated: Lightbulb,
  remediation_proposed: Shield,
  approval_requested: UserCheck,
  approval_granted: Check,
  approval_rejected: X,
  remediation_executed: Zap,
  incident_resolved: CheckCircle2,
  plan_viewed: Eye,
  execution_started: Zap,
  execution_result: Flag,
  rollback_result: RotateCcw,
  note: StickyNote,
};

export function EventIcon({ type }: { type: EventType }) {
  const Icon = ICONS[type] ?? Circle;
  return <Icon className="size-4" aria-hidden />;
}
