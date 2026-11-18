// CENTRALIZAR ENDPOINTS

enum API{
    ENDPOINT='api/v1'
}

// Prefijos de @Controller: sin slash inicial, tal como los usa Nest.
export enum ApiBasePath {
  AI = `${API.ENDPOINT}/ai`,
  AUTH = `${API.ENDPOINT}/auth`,
  JOURNEY_DRAFT = `${API.ENDPOINT}/journey-draft`,
  SETTINGS = `${API.ENDPOINT}/settings`,
  JOURNEYS = `${API.ENDPOINT}/journeys`,
  VERIFY = `${API.ENDPOINT}/verify`,
  HEALTH = `${API.ENDPOINT}/health`,
}

// Sub-rutas del controlador de IA, relativas al prefijo AI.
export enum AiEndpoint {
  CHAT = 'chat',
  CONVERSATIONS = 'conversations',
  CONVERSATION_MESSAGES = 'conversations/:id/messages',
  CONVERSATION = 'conversations/:id',
  USAGE = 'usage',
}

// Sub-rutas del controlador de autenticación, relativas al prefijo AUTH.
export enum AuthEndpoint {
  LOGIN = 'login',
  REFRESH = 'refresh',
  ME = 'me',
  LOGOUT = 'logout',
  ACCOUNT = 'account',
}

// Sub-rutas del controlador de jornadas, relativas al prefijo JOURNEYS.
export enum JourneysEndpoint {
  SHARE_STATUS = ':id/share-status',
  TRASH = 'trash',
  RESTORE = ':id/restore',
  BY_ID = ':id',
}

// Sub-ruta del controlador de verificación pública, relativa al prefijo VERIFY.
export enum VerifyEndpoint {
  BY_CODE = ':code',
}

