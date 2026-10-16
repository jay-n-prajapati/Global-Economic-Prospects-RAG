import { Workspace } from "@/components/workspace";
import { CHAT_MODEL, EMBEDDING_MODEL, RETRIEVE_K, SEND_K } from "@/lib/rag/config";

// Server shell: reads the pipeline constants on the server so the client island never imports server modules.
export default function Home() {
  return (
    <Workspace
      pipeline={{
        topK: RETRIEVE_K,
        sendK: SEND_K,
        embeddingModel: EMBEDDING_MODEL,
        chatModel: CHAT_MODEL,
        documentName: "World Bank GEP, June 2026",
      }}
    />
  );
}
