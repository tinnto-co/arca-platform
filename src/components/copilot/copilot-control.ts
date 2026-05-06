/**
 * Bridge between code that lives OUTSIDE the CopilotBottomPanel (e.g., the
 * floating AgentInput at the bottom of the page) and the panel's internal
 * state + CopilotKit hooks (`useCopilotChat`).
 *
 * The panel registers two handlers via `registerCopilotControl(...)` on mount;
 * the AgentInput consumes them via `submitMessageToPanel(...)` and
 * `openPanel(...)`. Module-level state is preserved across renders.
 */

type Submit = (text: string) => void;
type Open = () => void;

let submitFn: Submit | null = null;
let openFn: Open | null = null;

export function registerCopilotControl(submit: Submit, open: Open) {
  submitFn = submit;
  openFn = open;
}

export function unregisterCopilotControl() {
  submitFn = null;
  openFn = null;
}

/**
 * Returns true if the message was forwarded to the panel; false if no bridge
 * is registered. Callers can fall back to a different UX when this returns
 * false.
 */
export function submitMessageToSidebar(text: string): boolean {
  if (!submitFn) return false;
  submitFn(text);
  return true;
}

/**
 * Opens the bottom panel without sending a message. Used when the user clicks
 * the floating input to continue an active conversation.
 */
export function openPanel(): boolean {
  if (!openFn) return false;
  openFn();
  return true;
}

/**
 * Module-level tracker of the chat's message count. The panel publishes the
 * current count via `setMessageCount(...)`, and outsiders (like the AgentInput)
 * subscribe to read it. We do this because `useCopilotChat` from
 * @copilotkit/react-core can return an empty `visibleMessages` array outside
 * the panel's own subtree, even though state is logically shared.
 */
let messageCount = 0;
const messageCountSubs = new Set<() => void>();

export function setMessageCount(n: number) {
  if (messageCount === n) return;
  messageCount = n;
  messageCountSubs.forEach((cb) => cb());
}

export function subscribeMessageCount(cb: () => void) {
  messageCountSubs.add(cb);
  return () => {
    messageCountSubs.delete(cb);
  };
}

export function getMessageCount() {
  return messageCount;
}
