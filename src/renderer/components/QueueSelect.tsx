import { queueLabel as sharedQueueLabel } from "../../shared/ui/QueueSelect";

export function queueLabel(queueId: number | undefined): string {
  return sharedQueueLabel(queueId);
}
