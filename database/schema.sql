-- -------------------------------------------------------------
-- users: usuarios registrados (vinculados a Firebase por uid)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`            VARCHAR(36) NOT NULL PRIMARY KEY,
  `firebase_uid`  VARCHAR(128) NOT NULL UNIQUE,
  `email`         VARCHAR(191) NOT NULL UNIQUE,
  `display_name`  VARCHAR(191) NULL,
  `photo_url`     VARCHAR(512) NULL,
  `created_at`    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at`    DATETIME(6) NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- refresh_tokens: refresh tokens opacos (hash) con rotacion
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id`             VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id`        VARCHAR(36) NOT NULL,
  `token_hash`     VARCHAR(128) NOT NULL UNIQUE,
  `expires_at`     DATETIME(6) NOT NULL,
  `revoked_at`     DATETIME(6) NULL DEFAULT NULL,
  `replaced_by_id` VARCHAR(36) NULL DEFAULT NULL,
  `created_at`     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_refresh_tokens_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_refresh_tokens_user_id` (`user_id`),
  INDEX `idx_refresh_tokens_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- conversations: charlas del usuario con la IA, con TTL de 24hs
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conversations` (
  `id`         VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id`    VARCHAR(36) NOT NULL,
  `thread_id`  VARCHAR(128) NULL,
  `title`      VARCHAR(191) NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_conversations_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_conversations_user_expires` (`user_id`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- conversation_messages: mensajes de cada conversacion
-- role: 'system' | 'user' | 'assistant' (rol de la IA para todos)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conversation_messages` (
  `id`              VARCHAR(36) NOT NULL PRIMARY KEY,
  `conversation_id` VARCHAR(36) NOT NULL,
  `role`            VARCHAR(20) NOT NULL,
  `content`         LONGTEXT NOT NULL,
  `created_at`      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_messages_conversation`
    FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE,
  INDEX `idx_messages_conv_created` (`conversation_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- user_daily_usage: limite diario gratuito de mensajes de IA
-- una fila por (usuario, dia); se resetea al cambiar el dia
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_daily_usage` (
  `id`            VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id`       VARCHAR(36) NOT NULL,
  `usage_date`    DATE NOT NULL,
  `messages_used` INT NOT NULL DEFAULT 0,
  CONSTRAINT `fk_usage_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_usage_user_date` (`user_id`, `usage_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- -------------------------------------------------------------
-- conversation_calculations: borradores y resultados del calculo
-- de cierre asociados a la conversacion (persisten el contexto)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conversation_calculations` (
  `id`                  VARCHAR(36) NOT NULL PRIMARY KEY,
  `conversation_id`     VARCHAR(36) NOT NULL,
  `message_id`          VARCHAR(36) NULL,
  `status`              VARCHAR(20) NOT NULL,
  `input_json`          JSON NULL,
  `result_json`         JSON NULL,
  `missing_fields_json` JSON NULL,
  `created_at`          TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`          TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  KEY `idx_conversation_calculations_conversation_status` (`conversation_id`, `status`),
  CONSTRAINT `fk_conversation_calculations_conversation`
    FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_conversation_calculations_message`
    FOREIGN KEY (`message_id`) REFERENCES `conversation_messages`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `conversation_message_images` (
  id          VARCHAR(36)  NOT NULL,
  message_id  VARCHAR(36)  NOT NULL,
  public_id   VARCHAR(255) NOT NULL,
  `position`  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_conversation_message_images_message_id (message_id),
  CONSTRAINT fk_conversation_message_images_message
    FOREIGN KEY (message_id) REFERENCES conversation_messages (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- -------------------------------------------------------------
-- user_settings: ajustes del usuario (1 fila por usuario)
-- Porcentajes por defecto de la calculadora.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_settings` (
  `user_id`                VARCHAR(36) NOT NULL PRIMARY KEY,
  `default_agency_percent` TINYINT UNSIGNED NOT NULL DEFAULT 70,
  `default_driver_percent` TINYINT UNSIGNED NOT NULL DEFAULT 30,
  `default_car_rented`     TINYINT(1) NOT NULL DEFAULT 0,
  `default_car_percent`    TINYINT UNSIGNED NULL,
  `default_car_owner`      VARCHAR(10) NULL,
  `created_at`             DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at`             DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_user_settings_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- journey_history: jornadas guardadas (entrada y resultado del momento)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `journey_history` (
  `id`              VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id`         VARCHAR(36) NOT NULL,
  `journey_date`    DATE NOT NULL,
  `total`           DECIMAL(14,2) NOT NULL,
  `agency_percent`  TINYINT UNSIGNED NOT NULL,
  `driver_percent`  TINYINT UNSIGNED NOT NULL,
  `car_rented`      TINYINT(1) NOT NULL DEFAULT 0,
  `car_percent`     TINYINT UNSIGNED NULL,
  `gas`             DECIMAL(14,2) NOT NULL DEFAULT 0,
  `petrol`          DECIMAL(14,2) NOT NULL DEFAULT 0,
  `factory_total`   DECIMAL(14,2) NOT NULL DEFAULT 0,
  `fixed_fee_total` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `other_total`     DECIMAL(14,2) NOT NULL DEFAULT 0,
  `adjusted_total`  DECIMAL(14,2) NOT NULL,
  `car_owner`       VARCHAR(10) NULL,
  `agency_amount`   DECIMAL(14,2) NOT NULL,
  `driver_amount`   DECIMAL(14,2) NOT NULL,
  `car_amount`      DECIMAL(14,2) NULL,
  `final_agency`    DECIMAL(14,2) NOT NULL,
  `deleted_at`      TIMESTAMP NULL DEFAULT NULL,
  `delete_reason`   VARCHAR(10) NULL DEFAULT NULL,
  `replaced_by_id`  VARCHAR(36) NULL DEFAULT NULL,
  `source_calculation_id` VARCHAR(36) NULL DEFAULT NULL,
  `active_slot`     TINYINT UNSIGNED NULL DEFAULT 1,
  `verification_code` CHAR(16) NOT NULL,
  `created_at`      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_journey_history_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_journey_history_user_date` (`user_id`, `journey_date`),
  UNIQUE INDEX `UQ_journey_history_active_day` (`user_id`, `journey_date`, `active_slot`),
  UNIQUE INDEX `UQ_journey_history_verification_code` (`verification_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `journey_tombstones` (
  `verification_code` CHAR(16) NOT NULL PRIMARY KEY,
  `journey_date`      DATE NOT NULL,
  `created_at`        DATETIME(6) NOT NULL,
  `deleted_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delete_reason`     VARCHAR(10) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------
-- journey_history_vouchers: vales de cada jornada guardada
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `journey_history_vouchers` (
  `id`                  VARCHAR(36) NOT NULL PRIMARY KEY,
  `journey_id`          VARCHAR(36) NOT NULL,
  `type`                VARCHAR(10) NOT NULL,
  `name`                VARCHAR(40) NOT NULL,
  `trips`               SMALLINT UNSIGNED NOT NULL,
  `price_per_trip`      DECIMAL(12,2) NOT NULL,
  `fixed_fee_per_trip`  DECIMAL(12,2) NOT NULL DEFAULT 0,
  `position`            INT NOT NULL DEFAULT 0,
  CONSTRAINT `fk_journey_vouchers_journey`
    FOREIGN KEY (`journey_id`) REFERENCES `journey_history`(`id`) ON DELETE CASCADE,
  INDEX `idx_journey_vouchers_journey` (`journey_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



-- -------------------------------------------------------------
-- journey_drafts: borrador actual de la calculadora (1 fila por usuario)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `journey_drafts` (
  `user_id`    VARCHAR(36) NOT NULL PRIMARY KEY,
  `data_json`  JSON NOT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT `fk_journey_drafts_user`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;