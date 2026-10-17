import { Controller, Get, Injectable, Module } from "@nestjs/common";
import { AccessService } from "../access/access.service";
import { CurrentUser, type AuthUser } from "../auth/auth.decorators";
import {
  ENROLLMENT_INCLUDE, enrollmentView, profileView, requestListItemView, requestTypeHuman,
} from "../common/views";
import { PrismaService } from "../prisma/prisma.service";

const RECENT_REJECTION_DAYS = 14;

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService, private access: AccessService) {}

  async profile(me: AuthUser) {
    const e = await this.prisma.employee.findUniqueOrThrow({ where: { id: me.employee_id }, include: { department: true, manager: true } });
    return profileView(e);
  }

  /** Home screen: profile + "what needs my attention" + active requests + courses + unread count. */
  async dashboard(me: AuthUser) {
    const pendingWhere = this.access.pendingApprovalsWhere(me);
    const rejectedSince = new Date(Date.now() - RECENT_REJECTION_DAYS * 86_400_000);
    const ref = { employee: { select: { id: true, full_name: true } } } as const;

    const [profile, toApprove, mine, enrollments, unread] = await Promise.all([
      this.profile(me),
      pendingWhere ? this.prisma.request.findMany({ where: pendingWhere, include: ref, orderBy: { created_at: "asc" } }) : [],
      this.prisma.request.findMany({ where: { employee_id: me.employee_id }, include: ref, orderBy: [{ created_at: "desc" }, { id: "desc" }] }),
      this.prisma.enrollment.findMany({ where: { employee_id: me.employee_id }, include: ENROLLMENT_INCLUDE, orderBy: { id: "asc" } }),
      this.prisma.notification.count({ where: { user_id: me.id, read_at: null } }),
    ]);

    const tasks: { type: string; title: string; link: string; due: string | null }[] = [];
    for (const r of toApprove) {
      tasks.push({ type: "approve_request", title: `Согласовать ${requestTypeHuman(r)}: ${r.employee.full_name}`, link: `/requests/${r.id}`, due: null });
    }
    const enrollmentViews = enrollments.map(enrollmentView);
    for (const e of enrollmentViews) {
      if (e.status !== "completed") tasks.push({ type: "course", title: `Пройти курс «${e.course.title}»`, link: `/academy/${e.course_id}`, due: e.due_date });
    }
    for (const r of mine) {
      if (r.status === "rejected" && r.updated_at >= rejectedSince) {
        tasks.push({ type: "request_rejected", title: `Заявка на ${requestTypeHuman(r)} отклонена — посмотреть причину`, link: `/requests/${r.id}`, due: null });
      }
    }

    return {
      profile,
      tasks,
      active_requests: mine.filter((r) => r.status === "submitted" || r.status === "manager_approved").map(requestListItemView),
      enrollments: enrollmentViews,
      unread_notifications: unread,
    };
  }
}

@Controller()
export class ProfileController {
  constructor(private svc: ProfileService) {}

  @Get("profile")
  profile(@CurrentUser() me: AuthUser) {
    return this.svc.profile(me);
  }

  @Get("dashboard")
  dashboard(@CurrentUser() me: AuthUser) {
    return this.svc.dashboard(me);
  }
}

@Module({ controllers: [ProfileController], providers: [ProfileService] })
export class ProfileModule {}
