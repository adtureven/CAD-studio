import { AppShell } from "@/components/layout/AppShell";
import { useWebSocket } from "@/hooks/useWebSocket";

export default function App() {
  const { sendMessage, updateParameters } = useWebSocket();

  return (
    <AppShell
      onSendMessage={sendMessage}
      onUpdateParameters={updateParameters}
    />
  );
}
