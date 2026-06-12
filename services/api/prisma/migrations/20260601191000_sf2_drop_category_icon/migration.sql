-- SF.2: remove o ícone (emoji/URL) das categorias do marketplace.

-- AlterTable
ALTER TABLE "marketplace_categories" DROP COLUMN "icon";
