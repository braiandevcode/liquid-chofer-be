import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, getApps, getApp, App } from 'firebase-admin/app';
import type { Credential } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { JWT } from 'google-auth-library';

// Los mismos scopes que firebase-admin usa para sus credenciales de cuenta de servicio.
const FIREBASE_SCOPES: readonly string[] = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/firebase.messaging',
  'https://www.googleapis.com/auth/identitytoolkit',
  'https://www.googleapis.com/auth/userinfo.email',
];

// Equivalente a cert() de firebase-admin, pero construido con JWT: el factory
// cert() usa GoogleAuth.fromJSON(), que esta deprecado por google-auth-library.
const buildServiceAccountCredential = (
  clientEmail: string,
  privateKey: string,
): Credential => {
  const jwtClient = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [...FIREBASE_SCOPES],
  });

  return {
    async getAccessToken() {
      const { token } = await jwtClient.getAccessToken();
      if (typeof token !== 'string' || !token) {
        throw new Error('No se pudo obtener el access token de Firebase.');
      }

      const expiryDate = jwtClient.credentials.expiry_date;
      if (typeof expiryDate !== 'number') {
        throw new Error('No se pudo determinar la expiración del access token de Firebase.');
      }

      return {
        access_token: token,
        expires_in: Math.floor((expiryDate - Date.now()) / 1000),
      };
    },
  };
};

// Servicio que inicializa y expone firebase-admin de forma segura.
// Las credenciales se leen de variables de entorno (nunca hardcoded).
@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  // Instancia administrada por Google; se inicializa una unica vez.
  private firebaseApp: App;

  constructor(private readonly configService: ConfigService) { }

  // Reviso si ya existe una app inicializada para no romper en hot-reload.
  onModuleInit(): void {
    if (getApps().length > 0) {
      this.firebaseApp = getApp();
      return;
    }

    const projectId = this.configService.getOrThrow<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.getOrThrow<string>('FIREBASE_CLIENT_EMAIL');
    const rawPrivateKey = this.configService.getOrThrow<string>('FIREBASE_PRIVATE_KEY');

    try {
      const credential = buildServiceAccountCredential(
        clientEmail,
        this.normalizePrivateKey(rawPrivateKey),
      );
      this.firebaseApp = initializeApp({ credential, projectId });
    } catch (error) {
      this.logger.error(
        'No se pudo inicializar Firebase. Verificá las credenciales.',
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }

    this.logger.log('FirebaseApp inicializada correctamente');
  }

  // El private key puede venir como PEM multilinea, con "\n" escapados o base64.
  private normalizePrivateKey(rawPrivateKey: string): string {
    const raw: string = rawPrivateKey.trim();

    if (raw.includes('\\n')) {
      return raw.replace(/\\n/g, '\n');
    }
    if (raw.includes('-----BEGIN')) {
      return raw;
    }

    const decoded: string = Buffer.from(raw, 'base64').toString('utf8').trim();
    return decoded.includes('-----BEGIN') ? decoded : raw;
  }

  // Retorna la interfaz de auth para verificar tokens emitidos por el SDK de firebase.
  get auth(): Auth {
    return getAuth(this.firebaseApp);
  }

}
