import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/lib/db";
import { job, client, jobLog } from "@/drizzle/schema";
import { getSessionWithOrg } from "@/actions/helpers";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

const jobStatusEnum = z.enum(["pending", "running", "failed", "finished"]);
const jobTypeEnum = z.enum([
  "iva",
  "comprobantes",
  "comprobantes_full",
  "notificaciones",
  "deuda",
  "vencimientos",
]);

export type JobStatus = z.infer<typeof jobStatusEnum>;
export type JobType = z.infer<typeof jobTypeEnum>;

export interface JobRow {
  id: string;
  status: JobStatus;
  type: JobType;
  clientId: string;
  clientName: string | null;
  params: { [key: string]: {} } | null;
  result: { [key: string]: {} } | null;
  failedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  progress: number | null;
}

export interface JobsResponse {
  jobs: JobRow[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

export interface JobLogRow {
  id: string;
  jobId: string;
  level: string;
  message: string;
  context: { [key: string]: {} } | null;
  createdAt: Date;
}

export const getJobs = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      clientId: z.string().optional(),
      status: jobStatusEnum.optional(),
      type: jobTypeEnum.optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const { page, limit, clientId, status, type } = ctx.data;
    const offset = (page - 1) * limit;

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));

    const clientIds = userClients.map((c) => c.id);
    if (clientIds.length === 0) {
      return {
        jobs: [],
        totalCount: 0,
        totalPages: 0,
        currentPage: page,
      };
    }

    const conditions = [inArray(job.clientId, clientIds)];

    if (clientId) {
      conditions.push(eq(job.clientId, clientId));
    }

    if (status) {
      conditions.push(eq(job.status, status));
    }

    if (type) {
      conditions.push(eq(job.type, type));
    }

    const whereCondition = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(job)
      .where(whereCondition);

    const rawJobs = await db
      .select({
        id: job.id,
        status: job.status,
        type: job.type,
        clientId: job.clientId,
        clientName: client.name,
        params: job.params,
        result: job.result,
        failedReason: job.failedReason,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        progress: job.progress,
      })
      .from(job)
      .leftJoin(client, eq(job.clientId, client.id))
      .where(whereCondition)
      .orderBy(desc(job.createdAt))
      .limit(limit)
      .offset(offset);

    const jobs: JobRow[] = rawJobs.map((j) => ({
      ...j,
      params: (j.params ?? null) as { [key: string]: {} } | null,
      result: (j.result ?? null) as { [key: string]: {} } | null,
    }));

    const response: JobsResponse = {
      jobs: jobs,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };

    return response;
  });

export const getJobLogs = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      jobId: z.string().uuid(),
      limit: z.number().default(100),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const { jobId, limit } = ctx.data;

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));

    const clientIds = userClients.map((c) => c.id);
    if (clientIds.length === 0) {
      return [] as JobLogRow[];
    }

    const [jobRow] = await db
      .select({ id: job.id, clientId: job.clientId })
      .from(job)
      .where(eq(job.id, jobId))
      .limit(1);

    if (!jobRow || !clientIds.includes(jobRow.clientId)) {
      return [] as JobLogRow[];
    }

    const logs = await db
      .select({
        id: jobLog.id,
        jobId: jobLog.jobId,
        level: jobLog.level,
        message: jobLog.message,
        context: jobLog.context,
        createdAt: jobLog.createdAt,
      })
      .from(jobLog)
      .where(eq(jobLog.jobId, jobId))
      .orderBy(asc(jobLog.createdAt))
      .limit(limit);

    return logs as JobLogRow[];
  });

