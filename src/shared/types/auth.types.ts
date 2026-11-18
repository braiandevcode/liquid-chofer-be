import { Request } from 'express';

// Contrato del usuario autenticado que adjuntamos al request tras verificar
// el token. Inicia con I segun las reglas de AGENTS.md.
export interface IAuthUser {
  id: string;
  firebaseUid: string;
  email: string;
  displayName: string | null;
  photoUrl: string | null;
}

// Request de Express enriquecido con la sesion y el payload del JWT.
export interface IAuthenticatedRequest extends Request {
  user: IAuthUser;
  authToken: string;
}