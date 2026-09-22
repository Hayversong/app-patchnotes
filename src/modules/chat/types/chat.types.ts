export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  tokensUsed?: number;
};

export type GetChatHistoryResponse = {
  messages: ChatMessage[];
};

export type SendChatRequest = { message: string; context?: string };

export type SendChatResponse = ChatMessage & {
  role: "assistant";
  tokensUsed: number;
};
