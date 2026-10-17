import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface NewNotification {
  type: string;
  title: string;
  body: string;
  link: string | null;
}

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** Sends the same notification to several users. Pass `tx` to make it part of a transaction. */
  async send(userIds: number[], n: NewNotification, tx: Db = this.prisma) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return;
    await tx.notification.createMany({ data: unique.map((user_id) => ({ user_id, ...n })) });
  }
}
