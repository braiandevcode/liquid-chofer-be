import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert, getApps, getApp, App } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';

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
      this.firebaseApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: this.normalizePrivateKey(rawPrivateKey),
        }),
      });
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
