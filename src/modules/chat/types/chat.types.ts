export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  tokensUsed?: number;
};

export type SendChatRequest = { message: string; context?: string };

export type SendChatResponse = ChatMessage & {
  role: "assistant";
  tokensUsed: number;
};
