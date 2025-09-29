export class ReturnConversationDto {
  id: string;
  name: string | null;
  latestMessage: {
    content: string | null;
    status: string | null;
  };
  imageUrl: string | null;
  memberCount: number;
  members: {
    id: string;
    email: string;
    profile_image: string | null;
  }[];
  isGroup: boolean;
  messageIds?: string[];
}
