import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Put } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength, ValidateNested,
} from "class-validator";
import { AccessService } from "../access/access.service";
import { CurrentUser, Roles, type AuthUser } from "../auth/auth.decorators";
import { invalid, notFound } from "../common/errors";
import { kbArticleView } from "../common/views";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

class SourceDto {
  @IsString() @MaxLength(200) slug: string;
  @IsString() @MaxLength(300) title: string;
}

class LogDto {
  @IsString() @MinLength(1, { message: "Пустой вопрос" }) @MaxLength(2000) question: string;
  @IsOptional() @IsString() @MaxLength(20000) answer?: string;
  @IsIn(["answered", "no_answer", "refused"], { message: "status: answered | no_answer | refused" }) status: "answered" | "no_answer" | "refused";
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => SourceDto) sources?: SourceDto[];
}

class EscalateDto {
  @Type(() => Number) @IsInt({ message: "log_id обязателен" }) @IsPositive() log_id: number;
}

class KbUpsertDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(100_000) body_md?: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class AssistantService {
  constructor(private prisma: PrismaService, private access: AccessService, private notifications: NotificationsService) {}

  async kb() {
    return (await this.prisma.kbArticle.findMany({ orderBy: { slug: "asc" } })).map(kbArticleView);
  }

  async upsertKb(slug: string, dto: KbUpsertDto) {
    if (!SLUG.test(slug) || slug.length > 100) throw invalid("slug: латиница, цифры и дефисы");
    const existing = await this.prisma.kbArticle.findUnique({ where: { slug } });
    if (!existing && (!dto.title || !dto.body_md)) throw invalid("Для новой статьи нужны title и body_md");
    const data = {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.body_md !== undefined && { body_md: dto.body_md }),
    };
    const a = existing
      ? await this.prisma.kbArticle.update({ where: { slug }, data })
      : await this.prisma.kbArticle.create({ data: { slug, title: dto.title!, category: dto.category ?? "other", body_md: dto.body_md! } });
    return kbArticleView(a);
  }

  async log(me: AuthUser, dto: LogDto) {
    const row = await this.prisma.assistantLog.create({
      data: {
        user_id: me.id, // always from the JWT, never from the body
        question: dto.question.trim(),
        answer: dto.answer ?? "",
        status: dto.status,
        sources: (dto.sources ?? []).map((s) => ({ slug: s.slug, title: s.title })) as Prisma.InputJsonValue,
      },
    });
    return { log_id: row.id };
  }

  async escalate(me: AuthUser, logId: number) {
    if (me.role === "hr") {
      throw invalid(
        "HR-специалисту не нужно передавать вопрос в HR. Добавьте статью в базу знаний, чтобы ассистент начал отвечать.",
        "escalation_not_allowed",
      );
    }
    const log = await this.prisma.assistantLog.findUnique({ where: { id: logId } });
    // Someone else's log looks the same as a missing one: ids can't be probed.
    if (!log || log.user_id !== me.id) throw notFound("Вопрос не найден");
    if (log.escalated) return { ok: true, already_escalated: true };

    const author = await this.prisma.employee.findUniqueOrThrow({ where: { id: me.employee_id }, select: { full_name: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.assistantLog.update({ where: { id: logId }, data: { escalated: true } });
      await this.notifications.send(await this.access.hrUserIds(), {
        type: "assistant_escalated",
        title: "Вопрос передан в HR",
        body: `${author.full_name}: «${log.question.slice(0, 300)}»`,
        link: "/hr",
      }, tx);
    });
    return { ok: true };
  }

  /** Questions HR should answer (no_answer or escalated), grouped by text, most frequent first. */
  async unanswered() {
    const rows = await this.prisma.assistantLog.findMany({
      where: { OR: [{ status: "no_answer" }, { escalated: true }] },
      select: { question: true, created_at: true },
      orderBy: { created_at: "desc" },
    });
    // Group by normalized text; label each group with its most common phrasing.
    const groups = new Map<string, { variants: Map<string, number>; count: number; last_asked_at: Date }>();
    for (const r of rows) {
      const text = r.question.trim();
      const key = text.toLowerCase().replace(/\s+/g, " ").replace(/[?!.…\s]+$/, "");
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { variants: new Map(), count: 0, last_asked_at: r.created_at })); // rows are newest-first
      g.count++;
      g.variants.set(text, (g.variants.get(text) ?? 0) + 1);
    }
    return [...groups.values()]
      .map((g) => ({
        question: [...g.variants].reduce((best, v) => (v[1] > best[1] ? v : best))[0],
        count: g.count,
        last_asked_at: g.last_asked_at,
      }))
      .sort((a, b) => b.count - a.count || +b.last_asked_at - +a.last_asked_at);
  }

  async stats() {
    const [byStatus, escalated] = await Promise.all([
      this.prisma.assistantLog.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.assistantLog.count({ where: { escalated: true } }),
    ]);
    const n = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const answered = n("answered"), no_answer = n("no_answer"), refused = n("refused");
    return { total: answered + no_answer + refused, answered, no_answer, refused, escalated };
  }
}

@Controller()
export class AssistantController {
  constructor(private svc: AssistantService) {}

  @Get("kb")
  kb() {
    return this.svc.kb();
  }

  @Put("kb/:slug")
  @Roles("hr")
  putKb(@Param("slug") slug: string, @Body() body: KbUpsertDto) {
    return this.svc.upsertKb(slug, body);
  }

  @Post("kb/:slug")
  @Roles("hr")
  @HttpCode(200)
  postKb(@Param("slug") slug: string, @Body() body: KbUpsertDto) {
    return this.svc.upsertKb(slug, body);
  }

  @Post("assistant/logs")
  log(@CurrentUser() me: AuthUser, @Body() body: LogDto) {
    return this.svc.log(me, body);
  }

  @Post("assistant/escalate")
  @HttpCode(200)
  escalate(@CurrentUser() me: AuthUser, @Body() body: EscalateDto) {
    return this.svc.escalate(me, body.log_id);
  }

  @Get("assistant/unanswered")
  @Roles("hr")
  unanswered() {
    return this.svc.unanswered();
  }

  @Get("assistant/stats")
  @Roles("hr")
  stats() {
    return this.svc.stats();
  }
}

@Module({ controllers: [AssistantController], providers: [AssistantService] })
export class AssistantModule {}
