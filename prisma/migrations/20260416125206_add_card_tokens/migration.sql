-- CreateEnum
CREATE TYPE "visibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "format" AS ENUM ('STANDARD', 'PIONEER', 'MODERN', 'LEGACY', 'VINTAGE', 'COMMANDER', 'PAUPER', 'OATHBREAKER', 'BRAWL', 'HISTORIC', 'EXPLORER', 'ALCHEMY', 'CASUAL');

-- CreateTable
CREATE TABLE "card_tokens" (
    "id" SERIAL NOT NULL,
    "card_id" INTEGER NOT NULL,
    "token_name" TEXT NOT NULL,
    "token_scryfall_id" TEXT NOT NULL,

    CONSTRAINT "card_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "id_token" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deck" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "format" "format" NOT NULL DEFAULT 'COMMANDER',
    "visibility" "visibility" NOT NULL DEFAULT 'PRIVATE',
    "forked_from_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deck_card" (
    "id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "card_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT NOT NULL DEFAULT 'Mainboard',
    "printing_id" INTEGER,
    "is_foil" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deck_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deck_category" (
    "id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_built_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deck_category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_tokens_card_id_idx" ON "card_tokens"("card_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_tokens_card_id_token_scryfall_id_key" ON "card_tokens"("card_id", "token_scryfall_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "deck_user_id_idx" ON "deck"("user_id");

-- CreateIndex
CREATE INDEX "deck_card_deck_id_idx" ON "deck_card"("deck_id");

-- CreateIndex
CREATE INDEX "deck_card_card_id_idx" ON "deck_card"("card_id");

-- CreateIndex
CREATE UNIQUE INDEX "deck_card_deck_id_card_id_category_key" ON "deck_card"("deck_id", "card_id", "category");

-- CreateIndex
CREATE INDEX "deck_category_deck_id_idx" ON "deck_category"("deck_id");

-- CreateIndex
CREATE UNIQUE INDEX "deck_category_deck_id_name_key" ON "deck_category"("deck_id", "name");

-- AddForeignKey
ALTER TABLE "card_tokens" ADD CONSTRAINT "card_tokens_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck" ADD CONSTRAINT "deck_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck" ADD CONSTRAINT "deck_forked_from_id_fkey" FOREIGN KEY ("forked_from_id") REFERENCES "deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_card" ADD CONSTRAINT "deck_card_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_card" ADD CONSTRAINT "deck_card_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_card" ADD CONSTRAINT "deck_card_printing_id_fkey" FOREIGN KEY ("printing_id") REFERENCES "printing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_category" ADD CONSTRAINT "deck_category_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
