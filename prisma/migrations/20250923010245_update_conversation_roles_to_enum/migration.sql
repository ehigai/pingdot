/*
  Warnings:

  - The `role` column on the `ConversationMember` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."ConversationRole" AS ENUM ('ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "public"."ConversationMember" DROP COLUMN "role",
ADD COLUMN     "role" "public"."ConversationRole";
