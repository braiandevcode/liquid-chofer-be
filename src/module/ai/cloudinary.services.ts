import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { isConversationFolderPath } from './conversation-image-path.js';

// Todas las imagenes del chat se suben con este tipo de entrega (privado, URL firmada).
const DELIVERY_TYPE = 'authenticated';

// Cloudinary organiza los assets de forma distinta segun el modo de carpetas.
export type TFolderMode = 'dynamic' | 'fixed';

// Datos necesarios para ubicar una imagen en la estructura de carpetas.
export interface IPrivateImageUpload {
  assetFolder: string;
  fileName: string;
  tags?: string[];
}

// Arma las opciones de subida segun el modo de carpetas de la cuenta.
export const buildPrivateImageUploadOptions = (
  folderMode: TFolderMode,
  upload: IPrivateImageUpload,
) => {
  const isDynamic: boolean = folderMode === 'dynamic';

  return {
    public_id: isDynamic
      ? `${upload.assetFolder}/${upload.fileName}`
      : upload.fileName,
    ...(isDynamic
      ? { asset_folder: upload.assetFolder }
      : { folder: upload.assetFolder }),
    ...(upload.tags?.length ? { tags: upload.tags } : {}),
    resource_type: 'image' as const,
    type: DELIVERY_TYPE,
  };
};

@Injectable()
export class CloudinaryService implements OnModuleInit {
  private readonly logger = new Logger(CloudinaryService.name);
  // Por defecto asumo dynamic folders, que es el modo de las cuentas nuevas.
  private folderMode: TFolderMode = 'dynamic';

  constructor(configService: ConfigService) {
    cloudinary.config({
      cloud_name: configService.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: configService.getOrThrow<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  // Detecto una sola vez el modo de carpetas para elegir el parametro correcto.
  async onModuleInit(): Promise<void> {
    try {
      const config = await cloudinary.api.config({ settings: true });
      this.folderMode = config.settings?.folder_mode ?? 'dynamic';
    } catch {
      this.logger.warn(
        'No se pudo detectar el modo de carpetas de Cloudinary; se usa dynamic.',
      );
    }
  }

  // Sube una imagen (data URI base64) como privada y devuelve su public_id.
  async uploadPrivateImage(
    dataUri: string,
    upload: IPrivateImageUpload,
  ): Promise<string> {
    const result = await cloudinary.uploader.upload(
      dataUri,
      buildPrivateImageUploadOptions(this.folderMode, upload),
    );
    return result.public_id;
  }

  // URL firmada para mostrar la imagen. Llamar SOLO despues de validar al dueno.
  getSignedUrl(publicId: string): string {
    return cloudinary.url(publicId, {
      resource_type: 'image',
      type: DELIVERY_TYPE,
      sign_url: true,
      secure: true,
    });
  }

  // Borra el archivo en Cloudinary.
  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image',
      type: DELIVERY_TYPE,
    });
  }

  // Borra la carpeta de una conversacion. Llamar DESPUES de borrar sus imagenes.
  // La validacion evita borrar carpetas mas amplias por error y respeta el entorno actual.
  async deleteConversationFolder(folderPath: string): Promise<void> {
    if (!isConversationFolderPath(folderPath)) {
      throw new Error('Ruta de carpeta de conversacion invalida.');
    }
    await cloudinary.api.delete_folder(folderPath);
  }
}
