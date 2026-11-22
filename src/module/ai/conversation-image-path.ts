import { isProduction } from '../../core/config/environment.js';

// Datos necesarios para ubicar las imagenes de un mensaje en Cloudinary.
export interface IConversationImagePath {
  userId: string;
  conversationId: string;
  conversationCreatedAt: Date;
  messageId: string;
  messageCreatedAt: Date;
}

// Una sola fuente de verdad para las rutas: produccion conserva sus nombres
// originales y desarrollo usa un prefijo propio para no pisar los assets reales.
const root = (): string => (isProduction() ? 'liquid-chofer' : 'liquid-chofer-tests');
const usersSegment = (): string => (isProduction() ? 'users' : 'users-tests');
const conversationsSegment = (): string =>
  isProduction() ? 'conversations' : 'conversations-tests';

// El epoch en milisegundos mantiene orden cronologico al listar por nombre.
const toSortableSegment = (createdAt: Date, id: string): string =>
  `${createdAt.getTime()}-${id}`;

// Prefijo del usuario dentro de la carpeta de imagenes (se usa al borrar).
export const buildConversationUserPrefix = (userId: string): string =>
  `${root()}/${usersSegment()}/${userId}/`;

// Arma la carpeta por usuario, conversacion y mensaje.
export const buildConversationImageFolder = (
  path: IConversationImagePath,
): string => {
  const conversation = toSortableSegment(
    path.conversationCreatedAt,
    path.conversationId,
  );
  const message = toSortableSegment(path.messageCreatedAt, path.messageId);

  return `${buildConversationUserPrefix(path.userId)}${conversationsSegment()}/${conversation}/messages/${message}`;
};

// Ordena las imagenes dentro del mensaje (00, 01, 02...).
export const buildConversationImageFileName = (position: number): string =>
  String(position).padStart(2, '0');

// Tags que permiten buscar/filtrar por usuario y conversacion en Cloudinary.
export const buildConversationImageTags = (
  userId: string,
  conversationId: string,
): string[] =>
  isProduction()
    ? ['liquid-chofer', `user_${userId}`, `conversation_${conversationId}`]
    : ['liquid-chofer-tests', `user-tests_${userId}`, `conversation_${conversationId}`];

const PRODUCTION_PUBLIC_ID_RE =
  /^(liquid-chofer\/users\/[^/]+\/conversations\/[^/]+)\/messages\/[^/]+\/[^/]+$/;
const DEVELOPMENT_PUBLIC_ID_RE =
  /^(liquid-chofer-tests\/users-tests\/[^/]+\/conversations-tests\/[^/]+)\/messages\/[^/]+\/[^/]+$/;

// Obtiene la carpeta de la conversacion a partir del public_id de una de sus imagenes.
export const conversationFolderFromPublicId = (publicId: string): string | null => {
  const match = isProduction()
    ? PRODUCTION_PUBLIC_ID_RE.exec(publicId)
    : DEVELOPMENT_PUBLIC_ID_RE.exec(publicId);
  return match ? match[1] : null;
};

const PRODUCTION_FOLDER_RE = /^liquid-chofer\/users\/[^/]+\/conversations\/[^/]+$/;
const DEVELOPMENT_FOLDER_RE =
  /^liquid-chofer-tests\/users-tests\/[^/]+\/conversations-tests\/[^/]+$/;

// Valida que la carpeta a borrar sea de una conversacion del entorno actual.
export const isConversationFolderPath = (folderPath: string): boolean =>
  isProduction()
    ? PRODUCTION_FOLDER_RE.test(folderPath)
    : DEVELOPMENT_FOLDER_RE.test(folderPath);
