// Datos necesarios para ubicar las imagenes de un mensaje en Cloudinary.
export interface IConversationImagePath {
  userId: string;
  conversationId: string;
  conversationCreatedAt: Date;
  messageId: string;
  messageCreatedAt: Date;
}

// El epoch en milisegundos mantiene orden cronologico al listar por nombre.
const toSortableSegment = (createdAt: Date, id: string): string =>
  `${createdAt.getTime()}-${id}`;

// Arma la carpeta por usuario, conversacion y mensaje.
export const buildConversationImageFolder = (
  path: IConversationImagePath,
): string => {
  const conversation = toSortableSegment(
    path.conversationCreatedAt,
    path.conversationId,
  );
  const message = toSortableSegment(path.messageCreatedAt, path.messageId);

  return `liquid-chofer/users/${path.userId}/conversations/${conversation}/messages/${message}`;
};

// Ordena las imagenes dentro del mensaje (00, 01, 02...).
export const buildConversationImageFileName = (position: number): string =>
  String(position).padStart(2, '0');

// Tags que permiten buscar/filtrar por usuario y conversacion en Cloudinary.
export const buildConversationImageTags = (
  userId: string,
  conversationId: string,
): string[] => ['liquid-chofer', `user_${userId}`, `conversation_${conversationId}`];

// Obtiene la carpeta de la conversacion a partir del public_id de una de sus imagenes.
export const conversationFolderFromPublicId = (publicId: string): string | null => {
  const match =
    /^(liquid-chofer\/users\/[^/]+\/conversations\/[^/]+)\/messages\/[^/]+\/[^/]+$/.exec(publicId);
  return match ? match[1] : null;
};