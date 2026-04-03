export type GraphTargetType = 'agent' | 'canvas' | 'spawn' | 'unknown';

export type GraphToolResultStatus = 'success' | 'error' | 'noop';

export interface GraphToolEvent {
  phase: 'pending' | 'done';
  sourceAgentId: string;
  toolCallId: string;
  toolName: string;
  targetType: GraphTargetType;
  targetId: string | null;
  timestamp: number;
  resultStatus?: GraphToolResultStatus;
}

