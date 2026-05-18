"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function updateCrm(login: string, data: { status?: string; notes?: string; tags?: string; bookmarked?: boolean }) {
  await prisma.crm.upsert({
    where: { candidateLogin: login },
    create: { candidateLogin: login, ...data },
    update: data,
  });
  revalidatePath(`/candidates/${login}`);
}
