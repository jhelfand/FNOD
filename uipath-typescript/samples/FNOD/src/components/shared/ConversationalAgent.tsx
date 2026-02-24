/**
 * UiPath Conversational Agent iframe - preloadable for faster display when Summary tab is active.
 */
const AGENT_URL =
  'https://staging.uipath.com/uipathlabs/Playground/autopilotforeveryone_/conversational-agents/?agentId=1495241&mode=embedded&title=UiPath Life Conversation Agent&welcomeTitle=Welcome to UiPath Life Conversational Agent. I am able to help research key information for you&welcomeDescription=Talk with your agent to get started.';

interface ConversationalAgentProps {
  className?: string;
}

export function ConversationalAgent({ className = '' }: ConversationalAgentProps) {
  return (
    <div className={`h-full min-h-[400px] rounded overflow-hidden ${className}`}>
      <iframe
        src={AGENT_URL}
        className="w-full h-full min-h-[400px] border-0 rounded"
        title="UiPath Life Conversation Agent"
        allow="microphone"
      />
    </div>
  );
}
